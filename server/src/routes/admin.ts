import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { newSession, normalizeTarget, requireAuth, type AuthedRequest, validTarget } from "../auth.js";
import type { Ctx } from "../context.js";
import { HttpError, bad, forbidden, notFound, wrap } from "../lib/errors.js";
import { GIFT_MONTHS, MARKET_CPM_EGP, MAX_CAMPAIGN_DAYS, newGiftCode, addDays, conflictError, dayCount, ensureDefaultPlacements, findConflicts, isDay, occupancy, priceOf, startOfCairoDay, todayCairo, withAdsLock, daysBetween, HOLD } from "../lib/adsInventory.js";
import { randomToken, sha256 } from "../lib/tokens.js";
import { emitToUsers } from "../realtime.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { notifyPush } from "../lib/push.js";
import { messageInclude, messageView } from "../serialize.js";
import { ALL_PERMS, CATALOG, effectivePerms, ensurePresetRoles, isPerm } from "../lib/permissions.js";

export interface StaffInfo { userId: string; name: string; isOwner: boolean; perms: Set<string> }
type StaffReq = AuthedRequest & { staff: StaffInfo };

const PermList = z.array(z.string()).max(50).refine((l) => l.every(isPerm), "صلاحية غير معروفة");

export function adminRoutes(ctx: Ctx) {
  const r = Router();
  const db = ctx.db;
  const ownerContacts = ctx.config.OWNER_CONTACTS.split(",").map((s) => s.trim()).filter(Boolean)
    .map((c) => (c.includes("@") ? c.toLowerCase() : normalizeTarget("phone", c)));

  /** يحمّل الموظف الحالي. بيحوّل صاحب رقم/إيميل OWNER_CONTACTS لمالك تلقائيًا. بيرمي 403 لو مش موظف أو معطّل. */
  async function loadStaff(userId: string): Promise<StaffInfo> {
    await ensurePresetRoles(ctx);
    const u = await db.user.findUnique({ where: { id: userId }, include: { staff: { include: { role: true } } } });
    if (!u) throw new HttpError(401, "unauthorized", "غير مصرّح");
    let st = u.staff;
    if (!st && ownerContacts.some((c) => c === u.phone || c === u.email)) {
      st = await db.staff.create({ data: { userId, isOwner: true }, include: { role: true } });
    }
    if (!st || !st.active) throw new HttpError(403, "not_staff", "الحساب ده مش من فريق الإدارة");
    return { userId, name: u.name, isOwner: st.isOwner, perms: new Set(effectivePerms(st)) };
  }

  const need = (...perms: string[]): RequestHandler => async (req, _res, next: NextFunction) => {
    try {
      const staff = await loadStaff((req as AuthedRequest).userId);
      if (!perms.every((p) => staff.perms.has(p))) throw forbidden("مالكش صلاحية للإجراء ده");
      (req as StaffReq).staff = staff;
      next();
    } catch (e) { next(e); }
  };
  const S = (req: Request) => (req as StaffReq).staff;

  async function audit(s: StaffInfo, action: string, target?: string, meta?: Record<string, unknown>) {
    await db.auditLog.create({ data: { actorId: s.userId, actorName: s.name, action, target, meta: meta as object | undefined } });
  }
  /** مفيش حد يدّي صلاحية مالوش هو نفسه (ماعدا المالك) */
  const assertGrantable = (s: StaffInfo, perms: string[]) => {
    if (s.isOwner) return;
    const over = perms.filter((p) => !s.perms.has(p));
    if (over.length) throw forbidden(`مينفعش تدّي صلاحيات مالكش: ${over.join(", ")}`);
  };

  /** دخول مباشر للوحة من التطبيق: التطبيق بيطلب تذكرة لمرة واحدة، واللوحة بتبدّلها بجلسة. الموظف الفعّال بس. */
  r.post("/auth/handoff/exchange", wrap(async (req, res) => {
    const b = z.object({ code: z.string().min(20).max(100) }).parse(req.body);
    const hash = sha256(b.code);
    const row = await db.adminHandoff.findUnique({ where: { hash } });
    const del = await db.adminHandoff.deleteMany({ where: { hash } }); // استخدام واحد فقط
    if (!row || del.count !== 1 || row.expiresAt < new Date()) throw new HttpError(401, "bad_handoff", "التذكرة منتهية أو مستخدمة. افتحي اللوحة من التطبيق تاني.");
    const u = await db.user.findUnique({ where: { id: row.userId }, select: { modStatus: true } });
    if (!u || u.modStatus !== "active") throw forbidden("الحساب موقوف");
    await loadStaff(row.userId); // يرمي 403 لو مش موظف أو معطّل
    res.json(await newSession(ctx, row.userId, "لوحة الإدارة (من التطبيق)"));
  }));

  r.use("/admin", requireAuth(ctx));

  r.post("/admin/handoff", need(), wrap(async (req, res) => {
    const code = randomToken();
    await db.adminHandoff.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.adminHandoff.create({ data: { hash: sha256(code), userId: S(req).userId, expiresAt: new Date(Date.now() + 60_000) } });
    res.status(201).json({ code, expiresIn: 60 });
  }));

  r.get("/admin/me", wrap(async (req, res) => {
    const s = await loadStaff((req as AuthedRequest).userId);
    const st = await db.staff.findUnique({ where: { userId: s.userId }, include: { role: true } });
    res.json({ user: { id: s.userId, name: s.name }, isOwner: s.isOwner, role: st?.role ? { id: st.role.id, key: st.role.key, name: st.role.name } : null, permissions: [...s.perms], catalog: CATALOG });
  }));

  // ---------- الأدوار
  const roleView = (x: { id: string; key: string; name: string; permissions: string[]; system: boolean; _count?: { staff: number } }) =>
    ({ id: x.id, key: x.key, name: x.name, permissions: x.permissions, system: x.system, members: x._count?.staff ?? 0 });

  r.get("/admin/roles", need("team.view"), wrap(async (_req, res) => {
    const l = await db.staffRole.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { staff: true } } } });
    res.json(l.map(roleView));
  }));
  r.post("/admin/roles", need("team.manage"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ name: z.string().trim().min(2).max(40), permissions: PermList }).parse(req.body);
    assertGrantable(s, b.permissions);
    const role = await db.staffRole.create({ data: { key: "custom-" + crypto.randomBytes(4).toString("hex"), name: b.name, permissions: b.permissions } });
    await audit(s, "أنشأ دور", b.name, { permissions: b.permissions });
    res.status(201).json(roleView(role));
  }));
  r.patch("/admin/roles/:id", need("team.manage"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ name: z.string().trim().min(2).max(40).optional(), permissions: PermList.optional() }).parse(req.body);
    const cur = await db.staffRole.findUnique({ where: { id: String(req.params.id) } });
    if (!cur) throw notFound("الدور مش موجود");
    if (b.permissions) assertGrantable(s, b.permissions.filter((p) => !cur.permissions.includes(p))); // المضاف بس
    const role = await db.staffRole.update({ where: { id: cur.id }, data: b });
    await audit(s, "عدّل دور", role.name, { permissions: role.permissions });
    res.json(roleView(role));
  }));
  r.delete("/admin/roles/:id", need("team.manage"), wrap(async (req, res) => {
    const s = S(req);
    const cur = await db.staffRole.findUnique({ where: { id: String(req.params.id) }, include: { _count: { select: { staff: true } } } });
    if (!cur) throw notFound("الدور مش موجود");
    if (cur.system) throw bad("system_role", "الأدوار الجاهزة مينفعش تتمسح (عدّلي صلاحياتها)");
    if (cur._count.staff > 0) throw bad("role_in_use", "فيه أعضاء على الدور ده، انقليهم الأول");
    await db.staffRole.delete({ where: { id: cur.id } });
    await audit(s, "حذف دور", cur.name);
    res.status(204).end();
  }));

  // ---------- الفريق
  const staffView = (x: { userId: string; isOwner: boolean; active: boolean; grant: string[]; revoke: string[]; createdAt: Date; role: { id: string; name: string; permissions: string[] } | null; user: { name: string; phone: string | null; email: string | null } }) => ({
    userId: x.userId, name: x.user.name, contact: x.user.phone ?? x.user.email ?? "", isOwner: x.isOwner, active: x.active,
    role: x.role ? { id: x.role.id, name: x.role.name } : null, grant: x.grant, revoke: x.revoke,
    permissions: effectivePerms(x), createdAt: x.createdAt.toISOString(),
  });
  const staffInclude = { role: true, user: { select: { name: true, phone: true, email: true } } } as const;

  r.get("/admin/staff", need("team.view"), wrap(async (_req, res) => {
    const l = await db.staff.findMany({ include: staffInclude, orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }] });
    res.json(l.map(staffView));
  }));

  r.post("/admin/staff", need("team.manage"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({
      contact: z.string().trim().min(5).max(100), name: z.string().trim().min(1).max(60).optional(),
      roleId: z.string().min(1), grant: PermList.default([]), revoke: PermList.default([]),
    }).parse(req.body);
    const channel = b.contact.includes("@") ? "email" : "phone";
    const target = normalizeTarget(channel, b.contact);
    if (!validTarget(channel, target)) throw bad("invalid_contact", "رقم أو إيميل غير صحيح");
    const role = await db.staffRole.findUnique({ where: { id: b.roleId } });
    if (!role) throw bad("bad_role", "الدور مش موجود");
    assertGrantable(s, effectivePerms({ isOwner: false, grant: b.grant, revoke: b.revoke, role }));
    const where = channel === "phone" ? { phone: target } : { email: target };
    // لو صاحب الرقم/الإيميل مسجّل بالتطبيق نستخدمه، وإلا نجهّز له حساب وهو يدخل بالكود عادي
    const user = (await db.user.findUnique({ where })) ??
      (await db.user.create({ data: { ...where, name: b.name ?? (channel === "phone" ? `موظف ${target.slice(-4)}` : target.split("@")[0]), wallet: { create: {} } } }));
    if (await db.staff.findUnique({ where: { userId: user.id } })) throw new HttpError(409, "already_staff", "ده عضو في الفريق بالفعل");
    const created = await db.staff.create({ data: { userId: user.id, roleId: role.id, grant: b.grant, revoke: b.revoke, addedById: s.userId }, include: staffInclude });
    await audit(s, "أضاف عضو للفريق", user.name, { role: role.name, grant: b.grant, revoke: b.revoke });
    res.status(201).json(staffView(created));
  }));

  r.patch("/admin/staff/:userId", need("team.manage"), wrap(async (req, res) => {
    const s = S(req);
    const uid = String(req.params.userId);
    if (uid === s.userId) throw forbidden("مينفعش تعدّل صلاحياتك بنفسك");
    const b = z.object({ roleId: z.string().optional(), grant: PermList.optional(), revoke: PermList.optional(), active: z.boolean().optional() }).parse(req.body);
    const cur = await db.staff.findUnique({ where: { userId: uid }, include: staffInclude });
    if (!cur) throw notFound("العضو مش موجود");
    if (cur.isOwner) throw forbidden("المالك مينفعش يتعدّل");
    let role = cur.role;
    if (b.roleId) { role = await db.staffRole.findUnique({ where: { id: b.roleId } }); if (!role) throw bad("bad_role", "الدور مش موجود"); }
    const next = { isOwner: false, grant: b.grant ?? cur.grant, revoke: b.revoke ?? cur.revoke, role };
    // الصلاحيات الجديدة بس هي اللي بتتفحص (مينفعش تدّي حاجة مالكش، لكن تقدر تسحب)
    assertGrantable(s, effectivePerms(next).filter((p) => !effectivePerms(cur).includes(p)));
    const up = await db.staff.update({ where: { userId: uid }, data: { roleId: role?.id, grant: next.grant, revoke: next.revoke, active: b.active }, include: staffInclude });
    await audit(s, b.active === false ? "عطّل عضو" : b.active === true && !cur.active ? "فعّل عضو" : "عدّل صلاحيات عضو", up.user.name, { role: role?.name, grant: next.grant, revoke: next.revoke });
    res.json(staffView(up));
  }));

  r.delete("/admin/staff/:userId", need("team.manage"), wrap(async (req, res) => {
    const s = S(req);
    const uid = String(req.params.userId);
    if (uid === s.userId) throw forbidden("مينفعش تشيل نفسك");
    const cur = await db.staff.findUnique({ where: { userId: uid }, include: { user: true } });
    if (!cur) throw notFound("العضو مش موجود");
    if (cur.isOwner) throw forbidden("المالك مينفعش يتشال");
    await db.staff.delete({ where: { userId: uid } });
    await audit(s, "شال عضو من الفريق", cur.user.name);
    res.status(204).end();
  }));

  // ---------- سجل المراجعة
  r.get("/admin/audit", need("audit.view"), wrap(async (req, res) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), before: z.string().optional() }).parse(req.query);
    const before = q.before ? new Date(q.before) : undefined;
    const rows = await db.auditLog.findMany({ where: before && !isNaN(+before) ? { createdAt: { lt: before } } : {}, orderBy: { createdAt: "desc" }, take: q.limit });
    res.json(rows.map((a) => ({ id: a.id, who: a.actorName, what: a.action, target: a.target, meta: a.meta, at: a.createdAt.toISOString() })));
  }));

  // ---------- المستخدمون
  r.get("/admin/users", need("users.view"), wrap(async (req, res) => {
    const q = z.object({ q: z.string().trim().max(100).default(""), status: z.enum(["active", "suspended", "banned"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const users = await db.user.findMany({
      where: { ...(q.status ? { modStatus: q.status } : {}), ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }, { email: { contains: q.q.toLowerCase() } }, { id: q.q }] } : {}) },
      include: { wallet: { select: { balance: true } } }, orderBy: { createdAt: "desc" }, take: q.limit,
    });
    res.json(users.map((u) => ({ id: u.id, name: u.name, contact: u.phone ?? u.email ?? "", joined: u.createdAt.toISOString(), lastSeen: u.lastSeenAt?.toISOString() ?? null, status: u.modStatus, wallet: Number(u.wallet?.balance ?? 0) })));
  }));

  /** يغيّر حالة حساب (مع حماية الفريق/المالك) ويقطع جلساته لو اتوقف. بيرمي لو مش مسموح. */
  async function setUserStatus(s: StaffInfo, id: string, status: "active" | "suspended" | "banned", reason?: string) {
    if (id === s.userId) throw forbidden("مينفعش توقف نفسك");
    const u = await db.user.findUnique({ where: { id }, include: { staff: true } });
    if (!u) throw notFound("المستخدم مش موجود");
    if (u.staff && !s.isOwner) throw forbidden("أعضاء الفريق بيتديروا من المالك بس");
    if (u.staff?.isOwner) throw forbidden("المالك مينفعش يتوقف");
    await db.user.update({ where: { id }, data: { modStatus: status } });
    if (status !== "active") {
      await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      ctx.io?.in(`user:${id}`).disconnectSockets(true);
    }
    await audit(s, status === "active" ? "فعّل حساب" : status === "suspended" ? "أوقف حساب" : "حظر حساب", u.name, { reason });
  }

  r.patch("/admin/users/:id/status", need("users.manage"), wrap(async (req, res) => {
    const s = S(req);
    const id = String(req.params.id);
    const b = z.object({ status: z.enum(["active", "suspended", "banned"]), reason: z.string().max(200).optional() }).parse(req.body);
    await setUserStatus(s, id, b.status, b.reason);
    res.json({ id, status: b.status });
  }));

  // ---------- المالية
  r.get("/admin/finance/tx", need("finance.view"), wrap(async (req, res) => {
    const q = z.object({ q: z.string().trim().max(100).default(""), kind: z.enum(["topup", "bill", "refund"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const rows = await db.walletTx.findMany({
      where: { ...(q.kind ? { kind: q.kind } : {}), ...(q.q ? { OR: [{ ref: { contains: q.q } }, { wallet: { user: { name: { contains: q.q, mode: "insensitive" } } } }] } : {}) },
      include: { wallet: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: q.limit,
    });
    res.json(rows.map((t) => ({
      id: t.id, ref: t.ref, user: t.wallet.user.name, userId: t.userId, kind: t.kind, service: t.service, amount: Number(t.amount), discount: Number(t.discount),
      paid: Number(t.amount), gross: +(Number(t.amount) + Number(t.discount)).toFixed(2), status: t.refundedAt ? "refunded" : "done", at: t.createdAt.toISOString(),
    })));
  }));

  r.get("/admin/finance/summary", need("finance.view"), wrap(async (_req, res) => {
    const since = new Date(Date.now() - 30 * 86400_000);
    const g = await db.walletTx.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _sum: { amount: true, discount: true }, _count: true });
    const pick = (k: string) => { const x = g.find((y) => y.kind === k); return { count: x?._count ?? 0, amount: Number(x?._sum.amount ?? 0), discount: Number(x?._sum.discount ?? 0) }; };
    res.json({ days: 30, bills: pick("bill"), topups: pick("topup"), refunds: pick("refund") });
  }));

  r.post("/admin/finance/tx/:id/refund", need("finance.refund"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ reason: z.string().max(200).optional() }).parse(req.body ?? {});
    const t = await db.walletTx.findUnique({ where: { id: String(req.params.id) } });
    if (!t) throw notFound("المعاملة مش موجودة");
    if (t.kind !== "bill") throw bad("not_refundable", "الاسترداد للفواتير بس");
    // WalletTx.amount = اللي اتخصم فعلًا من الرصيد (بعد الخصم) → ده اللي بيترجّع
    const paid = Number(t.amount);
    const refund = await db.$transaction(async (tx) => {
      // updateMany بشرط refundedAt=null: لو اتنين ضغطوا مع بعض واحد بس هينجح
      const claimed = await tx.walletTx.updateMany({ where: { id: t.id, refundedAt: null }, data: { refundedAt: new Date() } });
      if (claimed.count !== 1) throw new HttpError(409, "already_refunded", "المعاملة دي اتسترجعت قبل كده");
      await tx.wallet.update({ where: { userId: t.userId }, data: { balance: { increment: paid.toFixed(2) } } });
      return tx.walletTx.create({ data: { userId: t.userId, kind: "refund", service: t.service, amount: paid.toFixed(2), ref: "RF-" + crypto.randomInt(100000, 999999) + crypto.randomInt(10, 99) } });
    });
    await audit(s, "استرد معاملة", t.ref, { amount: paid, reason: b.reason });
    res.status(201).json({ refundRef: refund.ref, amount: paid });
  }));

  // ---------- العروض
  const offerView = (o: { code: string; service: string | null; percent: number; maxOff: unknown; active: boolean }) => ({ code: o.code, service: o.service, percent: o.percent, max: Number(o.maxOff), active: o.active });
  const OfferIn = z.object({ service: z.string().max(100).nullable().optional(), percent: z.number().int().min(1).max(100), max: z.number().min(0).max(100000), active: z.boolean().default(true) });
  r.get("/admin/offers", need("finance.view"), wrap(async (_req, res) => { res.json((await db.offer.findMany({ orderBy: { code: "asc" } })).map(offerView)); }));
  r.put("/admin/offers/:code", need("finance.offers"), wrap(async (req, res) => {
    const s = S(req);
    const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "كود من حروف إنجليزي وأرقام (٣–٢٠)").parse(req.params.code);
    const b = OfferIn.parse(req.body);
    const data = { service: b.service || null, percent: b.percent, maxOff: b.max.toFixed(2), active: b.active };
    const o = await db.offer.upsert({ where: { code }, create: { code, ...data }, update: data });
    await audit(s, "حفظ عرض", code, { percent: b.percent, max: b.max, active: b.active });
    res.json(offerView(o));
  }));
  r.delete("/admin/offers/:code", need("finance.offers"), wrap(async (req, res) => {
    const s = S(req);
    const code = String(req.params.code).toUpperCase();
    await db.offer.deleteMany({ where: { code } });
    await audit(s, "حذف عرض", code);
    res.status(204).end();
  }));

  // ================= الإعلانات: المواضع / المخزون / الحجز =================
  const Day = z.string().refine(isDay, "تاريخ غير صحيح (YYYY-MM-DD)");
  const Key = z.string().regex(/^[a-z0-9_]{2,24}$/);
  const placementView = (p: { key: string; name: string; kind: string; width: number; height: number; slots: number; pricePerDay: unknown; active: boolean; note: string | null; dailyImpressions: number }) => ({
    key: p.key, name: p.name, kind: p.kind, width: p.width, height: p.height, slots: p.slots, pricePerDay: Number(p.pricePerDay), active: p.active, note: p.note,
    dailyImpressions: p.dailyImpressions, effectiveCpm: p.dailyImpressions > 0 ? +((Number(p.pricePerDay) / p.dailyImpressions) * 1000).toFixed(0) : null, marketCpm: MARKET_CPM_EGP,
  });
  const phaseOf = (c: { status: string; startDate: string; endDate: string }) => {
    const t = todayCairo();
    return c.endDate < t ? "ended" : c.startDate > t ? "upcoming" : "running";
  };
  type CampRow = Awaited<ReturnType<typeof loadCampaign>>;
  const loadCampaign = (id: string) => db.adCampaign.findUnique({ where: { id }, include: { bookings: { include: { placement: true } } } });
  type Totals = Map<string, { shown: number; clicked: number }>;
  const totalsFor = async (ids: string[]): Promise<Totals> => {
    const g = await db.adStat.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids } }, _sum: { shown: true, clicked: true } });
    return new Map(g.map((x) => [x.campaignId, { shown: x._sum.shown ?? 0, clicked: x._sum.clicked ?? 0 }]));
  };
  const campView = (c: NonNullable<CampRow>, tot?: Totals) => ({
    shown: tot?.get(c.id)?.shown ?? 0, clicked: tot?.get(c.id)?.clicked ?? 0,
    id: c.id, advertiser: c.advertiser, headline: c.headline, body: c.body, cta: c.cta, link: c.link, grad: c.grad, audience: c.audience,
    priority: c.priority, dailyCap: c.dailyCap, start: c.startDate, end: c.endDate, status: c.status, phase: phaseOf(c), total: Number(c.total), discount: Number(c.discount), gross: +(Number(c.total) + Number(c.discount)).toFixed(2), giftCode: c.giftCode, note: c.note,
    days: dayCount(c.startDate, c.endDate), placements: c.bookings.map((b) => ({ key: b.placement.key, name: b.placement.name, pricePerDay: Number(b.pricePerDay) })), createdAt: c.createdAt.toISOString(),
  });
  const normCode = (s: string) => s.trim().toUpperCase();
  /** يحسب خصم كود الهدية: بيغطي min(مدة الحملة، مدة الهدية) من أيام المواضع المشمولة */
  async function giftDiscount(codeIn: string, ps: { key: string; pricePerDay: unknown }[], start: string, end: string, campaignId?: string) {
    const gift = await db.adGift.findUnique({ where: { code: normCode(codeIn) } });
    if (!gift || gift.voidedAt) throw bad("bad_gift", "كود الهدية غير صحيح");
    const mine = !!campaignId && gift.usedByCampaignId === campaignId;
    if (gift.usedByCampaignId && !mine) throw bad("gift_used", "كود الهدية ده اتستخدم قبل كده");
    if (gift.expiresAt && gift.expiresAt < todayCairo() && !mine) throw bad("gift_expired", "كود الهدية انتهت صلاحيته");
    const covered = gift.placements.length ? ps.filter((p) => gift.placements.includes(p.key)) : ps;
    if (!covered.length) throw bad("gift_placement", "كود الهدية مش بيشمل المواضع المختارة");
    const days = Math.min(dayCount(start, end), gift.days);
    return { gift, discount: +(covered.reduce((a, p) => a + Number(p.pricePerDay), 0) * days).toFixed(2), coveredDays: days };
  }
  const Content = z.object({
    advertiser: z.string().trim().min(2).max(60), headline: z.string().trim().min(2).max(50), body: z.string().trim().max(110).default(""), cta: z.string().trim().max(16).default("اعرف أكتر"),
    link: z.string().trim().max(300).regex(/^https:\/\/\S+$/, "الرابط لازم يبدأ بـ https://"), grad: z.number().int().min(0).max(5).default(0), audience: z.string().trim().max(60).default("كل المستخدمين"),
    priority: z.number().int().min(1).max(3).default(2), dailyCap: z.number().int().min(1).max(10).default(3), note: z.string().trim().max(300).optional(),
  });
  const Range = z.object({ start: Day, end: Day }).refine((b) => b.end >= b.start, { message: "تاريخ النهاية قبل البداية", path: ["end"] })
    .refine((b) => dayCount(b.start, b.end) <= MAX_CAMPAIGN_DAYS, { message: "أقصى مدة سنة", path: ["end"] });
  async function placementsByKeys(keys: string[]) {
    await ensureDefaultPlacements(ctx);
    const uniq = [...new Set(keys)];
    const ps = await db.adPlacement.findMany({ where: { key: { in: uniq } } });
    if (ps.length !== uniq.length) throw bad("bad_placement", "موضع غير موجود");
    return ps;
  }

  r.get("/admin/ads/placements", need("ads.view"), wrap(async (_req, res) => {
    await ensureDefaultPlacements(ctx);
    res.json((await db.adPlacement.findMany({ orderBy: { sort: "asc" } })).map(placementView));
  }));

  r.put("/admin/ads/placements/:key", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req); const key = Key.parse(req.params.key);
    const b = z.object({
      name: z.string().trim().min(2).max(60), kind: z.enum(["modal", "banner", "story", "room"]), width: z.number().int().min(50).max(4000), height: z.number().int().min(50).max(4000),
      slots: z.number().int().min(1).max(20), pricePerDay: z.number().min(0).max(1_000_000), dailyImpressions: z.number().int().min(0).max(100_000_000).default(0), active: z.boolean().default(true), note: z.string().trim().max(200).nullable().optional(),
    }).parse(req.body);
    await ensureDefaultPlacements(ctx);
    const out = await withAdsLock(ctx, async () => {
      const cur = await db.adPlacement.findUnique({ where: { key } });
      if (cur && b.slots < cur.slots) { // تقليل السعة ممنوع لو فيه أيام جاية محجوزة أكتر منها
        const bk = await db.adBooking.findMany({ where: { placementId: cur.id, campaign: { status: { in: [...HOLD] }, endDate: { gte: todayCairo() } } }, select: { campaign: { select: { startDate: true, endDate: true } } } });
        const load = new Map<string, number>();
        for (const x of bk) for (const d of daysBetween(x.campaign.startDate < todayCairo() ? todayCairo() : x.campaign.startDate, x.campaign.endDate)) load.set(d, (load.get(d) ?? 0) + 1);
        const worst = [...load.entries()].find(([, n]) => n > b.slots);
        if (worst) throw new HttpError(409, "slots_in_use", `فيه حجوزات أكتر من ${b.slots} يوم ${worst[0]}`);
      }
      const data = { name: b.name, kind: b.kind, width: b.width, height: b.height, slots: b.slots, pricePerDay: b.pricePerDay.toFixed(2), dailyImpressions: b.dailyImpressions, active: b.active, note: b.note ?? null };
      return cur ? db.adPlacement.update({ where: { key }, data }) : db.adPlacement.create({ data: { key, sort: 100, ...data } });
    });
    await audit(s, "عدّل موضع إعلاني", out.name, { slots: out.slots, price: Number(out.pricePerDay), active: out.active });
    res.json(placementView(out));
  }));

  /** خريطة المخزون: موضع × يوم (محجوز/مؤقت/مقفول/متاح) + شرائط الحملات */
  r.get("/admin/ads/inventory", need("ads.view"), wrap(async (req, res) => {
    const q = z.object({ from: Day.default(todayCairo()), days: z.coerce.number().int().min(1).max(92).default(30) }).parse(req.query);
    const to = addDays(q.from, q.days - 1);
    await ensureDefaultPlacements(ctx);
    const ps = await db.adPlacement.findMany({ orderBy: { sort: "asc" } });
    const occ = await occupancy(ctx, ps.map((p) => p.id), q.from, to);
    const days = daysBetween(q.from, to);
    const [camps, blocks] = await Promise.all([
      db.adCampaign.findMany({ where: { status: { in: [...HOLD] }, startDate: { lte: to }, endDate: { gte: q.from } }, include: { bookings: { include: { placement: { select: { key: true } } } } }, orderBy: { startDate: "asc" } }),
      db.adBlock.findMany({ where: { fromDate: { lte: to }, toDate: { gte: q.from } }, include: { placement: { select: { key: true } } } }),
    ]);
    res.json({
      from: q.from, to, days, today: todayCairo(),
      placements: ps.map((p) => ({
        ...placementView(p),
        cells: days.map((d) => { const o = occ.get(p.id, d); const used = o.booked + o.held; return { day: d, booked: o.booked, held: o.held, blocked: o.blocked, free: !p.active || o.blocked ? 0 : Math.max(0, p.slots - used) }; }),
        campaigns: camps.filter((c) => c.bookings.some((b) => b.placement.key === p.key)).map((c) => ({ id: c.id, advertiser: c.advertiser, start: c.startDate, end: c.endDate, status: c.status })),
        blocks: blocks.filter((b) => b.placement.key === p.key).map((b) => ({ id: b.id, from: b.fromDate, to: b.toDate, reason: b.reason })),
      })),
    });
  }));

  r.post("/admin/ads/quote", need("ads.view"), wrap(async (req, res) => {
    const b = z.object({ placements: z.array(Key).min(1).max(10), excludeId: z.string().optional(), giftCode: z.string().trim().max(30).optional() }).and(Range).parse(req.body);
    const ps = await placementsByKeys(b.placements);
    const conflicts = await findConflicts(ctx, ps, b.start, b.end, b.excludeId);
    const n = dayCount(b.start, b.end);
    const gross = priceOf(ps, b.start, b.end);
    let discount = 0, giftError: string | null = null, giftDays = 0;
    if (b.giftCode) {
      try { const g = await giftDiscount(b.giftCode, ps, b.start, b.end, b.excludeId); discount = g.discount; giftDays = g.coveredDays; }
      catch (e) { if (e instanceof HttpError) giftError = e.message; else throw e; }
    }
    res.json({
      days: n, gross, discount, giftDays, giftError, total: +(gross - discount).toFixed(2), ok: conflicts.length === 0, conflicts,
      lines: ps.map((p) => ({ key: p.key, name: p.name, pricePerDay: Number(p.pricePerDay), days: n, subtotal: +(Number(p.pricePerDay) * n).toFixed(2) })),
    });
  }));

  r.get("/admin/ads/campaigns", need("ads.view"), wrap(async (req, res) => {
    const q = z.object({ status: z.enum(["pending", "approved", "paused", "rejected", "cancelled"]).optional(), q: z.string().trim().max(60).optional() }).parse(req.query);
    const rows = await db.adCampaign.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ advertiser: { contains: q.q, mode: "insensitive" } }, { headline: { contains: q.q, mode: "insensitive" } }] } : {}) },
      include: { bookings: { include: { placement: true } } }, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], take: 200,
    });
    const tot = await totalsFor(rows.map((c) => c.id));
    res.json(rows.map((c) => campView(c, tot)));
  }));

  r.get("/admin/ads/campaigns/:id/stats", need("ads.view"), wrap(async (req, res) => {
    const id = String(req.params.id);
    if (!(await db.adCampaign.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    const rows = await db.adStat.findMany({ where: { campaignId: id }, orderBy: [{ day: "asc" }, { placement: "asc" }] });
    res.json(rows.map((s) => ({ day: s.day, placement: s.placement, shown: s.shown, clicked: s.clicked, closed: s.closed })));
  }));

  r.post("/admin/ads/campaigns", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req);
    const b = Content.and(Range).and(z.object({ placements: z.array(Key).min(1).max(10), approve: z.boolean().default(false), giftCode: z.string().trim().max(30).optional() })).parse(req.body);
    if (b.start < todayCairo()) throw bad("past_start", "تاريخ البداية فات");
    const ps = await placementsByKeys(b.placements);
    const id = await withAdsLock(ctx, async () => {
      const c = await findConflicts(ctx, ps, b.start, b.end);
      if (c.length) throw conflictError(c);
      const gross = priceOf(ps, b.start, b.end);
      const g = b.giftCode ? await giftDiscount(b.giftCode, ps, b.start, b.end) : null;
      const row = await db.adCampaign.create({
        data: {
          advertiser: b.advertiser, headline: b.headline, body: b.body, cta: b.cta, link: b.link, grad: b.grad, audience: b.audience, priority: b.priority, dailyCap: b.dailyCap, note: b.note,
          startDate: b.start, endDate: b.end, status: b.approve ? "approved" : "pending", total: (gross - (g?.discount ?? 0)).toFixed(2), discount: (g?.discount ?? 0).toFixed(2), giftCode: g?.gift.code ?? null, createdById: s.userId,
          bookings: { create: ps.map((p) => ({ placementId: p.id, pricePerDay: p.pricePerDay })) },
        },
      });
      if (g) {
        const u = await db.adGift.updateMany({ where: { id: g.gift.id, usedByCampaignId: null }, data: { usedAt: new Date(), usedByCampaignId: row.id } });
        if (u.count !== 1) throw bad("gift_used", "كود الهدية ده اتستخدم قبل كده");
      }
      return row.id;
    });
    const c = (await loadCampaign(id))!;
    await audit(s, b.approve ? "أنشأ واعتمد حملة" : "أنشأ حملة (بانتظار الموافقة)", c.advertiser, { id, start: b.start, end: b.end, total: Number(c.total), placements: b.placements });
    res.status(201).json(campView(c));
  }));

  r.patch("/admin/ads/campaigns/:id", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req); const id = String(req.params.id);
    const b = Content.partial().and(z.object({ start: Day.optional(), end: Day.optional(), placements: z.array(Key).min(1).max(10).optional(), giftCode: z.string().trim().max(30).optional() })).parse(req.body);
    const out = await withAdsLock(ctx, async () => {
      const cur = await loadCampaign(id);
      if (!cur) throw notFound();
      if (cur.status === "rejected" || cur.status === "cancelled") throw bad("closed", "الحملة دي مقفولة ومينفعش تتعدل");
      const start = b.start ?? cur.startDate, end = b.end ?? cur.endDate;
      if (end < start) throw bad("bad_range", "تاريخ النهاية قبل البداية");
      if (dayCount(start, end) > MAX_CAMPAIGN_DAYS) throw bad("bad_range", "أقصى مدة سنة");
      const keys = b.placements ?? cur.bookings.map((x) => x.placement.key);
      const slotsChanged = !!b.start || !!b.end || !!b.placements;
      if (slotsChanged) {
        if (cur.endDate < todayCairo()) throw bad("ended", "الحملة انتهت، مينفعش تغيّر مواعيدها");
        if (b.start && b.start !== cur.startDate && b.start < todayCairo() && cur.startDate >= todayCairo()) throw bad("past_start", "تاريخ البداية فات");
      }
      const ps = await placementsByKeys(keys);
      if (slotsChanged) { const c = await findConflicts(ctx, ps, start, end, id); if (c.length) throw conflictError(c); }
      const { start: _s, end: _e, placements: _p, giftCode: newCode, ...fields } = b;
      void _s; void _e; void _p;
      const code = cur.giftCode ?? newCode;
      const priceChanged = slotsChanged || (!!newCode && !cur.giftCode);
      const g = code && priceChanged ? await giftDiscount(code, ps, start, end, id) : null;
      const gross = priceOf(ps, start, end);
      await db.adCampaign.update({ where: { id }, data: { ...fields, startDate: start, endDate: end, ...(priceChanged ? { total: (gross - (g?.discount ?? 0)).toFixed(2), discount: (g?.discount ?? 0).toFixed(2), giftCode: g?.gift.code ?? cur.giftCode } : {}) } });
      if (g && !cur.giftCode) {
        const u = await db.adGift.updateMany({ where: { id: g.gift.id, usedByCampaignId: null }, data: { usedAt: new Date(), usedByCampaignId: id } });
        if (u.count !== 1) throw bad("gift_used", "كود الهدية ده اتستخدم قبل كده");
      }
      if (b.placements) {
        const keep = new Set(ps.map((p) => p.id));
        await db.adBooking.deleteMany({ where: { campaignId: id, placementId: { notIn: [...keep] } } });
        const have = new Set(cur.bookings.map((x) => x.placementId));
        const add = ps.filter((p) => !have.has(p.id));
        if (add.length) await db.adBooking.createMany({ data: add.map((p) => ({ campaignId: id, placementId: p.id, pricePerDay: p.pricePerDay })) });
      }
      return (await loadCampaign(id))!;
    });
    await audit(s, "عدّل حملة", out.advertiser, { id, start: out.startDate, end: out.endDate, total: Number(out.total) });
    res.json(campView(out));
  }));

  const ACTIONS: Record<string, { from: string[]; to: string; label: string }> = {
    approve: { from: ["pending"], to: "approved", label: "اعتمد حملة" },
    reject: { from: ["pending"], to: "rejected", label: "رفض حملة" },
    pause: { from: ["approved"], to: "paused", label: "أوقف حملة" },
    resume: { from: ["paused"], to: "approved", label: "استأنف حملة" },
    cancel: { from: ["pending", "approved", "paused"], to: "cancelled", label: "ألغى حملة" },
  };
  r.post("/admin/ads/campaigns/:id/:action", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req); const id = String(req.params.id); const act = ACTIONS[String(req.params.action)];
    if (!act) throw notFound();
    const b = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body ?? {});
    const out = await withAdsLock(ctx, async () => {
      const cur = await loadCampaign(id);
      if (!cur) throw notFound();
      if (!act.from.includes(cur.status)) throw bad("bad_state", `مينفعش — حالة الحملة دلوقتي: ${cur.status}`);
      if (cur.endDate < todayCairo() && (act.to === "approved")) throw bad("ended", "الحملة انتهت");
      if (act.to === "approved") { // اعتماد/استئناف: نتأكد إن المكان لسه متاح (ممكن موضع اتقفل/اتوقف بعد الحجز)
        const c = await findConflicts(ctx, cur.bookings.map((x) => x.placement), cur.startDate, cur.endDate, id);
        if (c.length) throw conflictError(c);
      }
      await db.adCampaign.update({ where: { id }, data: { status: act.to } });
      // الرفض أو إلغاء حملة لسه ما بدأتش بيرجّع كود الهدية يتستخدم تاني
      if (cur.giftCode && (act.to === "rejected" || (act.to === "cancelled" && cur.startDate > todayCairo()))) {
        await db.adGift.updateMany({ where: { usedByCampaignId: id }, data: { usedAt: null, usedByCampaignId: null } });
        await db.adCampaign.update({ where: { id }, data: { total: (Number(cur.total) + Number(cur.discount)).toFixed(2), discount: "0", giftCode: null } });
      }
      return (await loadCampaign(id))!;
    });
    await audit(s, act.label, out.advertiser, { id, ...(b.reason ? { reason: b.reason } : {}) });
    res.json(campView(out));
  }));


  // ---------- أكواد الهدايا الإعلانية
  const giftView = (g: { id: string; code: string; months: number; days: number; recipient: string | null; note: string | null; placements: string[]; expiresAt: string | null; usedAt: Date | null; usedByCampaignId: string | null; voidedAt: Date | null; createdAt: Date }) => ({
    id: g.id, code: g.code, months: g.months, days: g.days, recipient: g.recipient, note: g.note, placements: g.placements, expiresAt: g.expiresAt,
    status: g.voidedAt ? "void" : g.usedByCampaignId ? "used" : g.expiresAt && g.expiresAt < todayCairo() ? "expired" : "available",
    usedAt: g.usedAt?.toISOString() ?? null, campaignId: g.usedByCampaignId, createdAt: g.createdAt.toISOString(),
  });
  r.get("/admin/ads/gifts", need("ads.view"), wrap(async (_req, res) => {
    const rows = await db.adGift.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
    const ids = rows.map((g) => g.usedByCampaignId).filter((x): x is string => !!x);
    const camps = ids.length ? await db.adCampaign.findMany({ where: { id: { in: ids } }, select: { id: true, advertiser: true } }) : [];
    const name = new Map(camps.map((c) => [c.id, c.advertiser]));
    res.json(rows.map((g) => ({ ...giftView(g), usedBy: g.usedByCampaignId ? name.get(g.usedByCampaignId) ?? null : null })));
  }));
  r.post("/admin/ads/gifts", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({
      months: z.number().int().refine((m) => m in GIFT_MONTHS, "المدة لازم تكون ١ أو ٣ أو ٦ أو ١٢ شهر"), count: z.number().int().min(1).max(50).default(1),
      recipient: z.string().trim().max(80).optional(), note: z.string().trim().max(200).optional(), placements: z.array(Key).max(10).default([]),
      expiresAt: Day.optional(),
    }).parse(req.body);
    if (b.expiresAt && b.expiresAt < todayCairo()) throw bad("bad_expiry", "تاريخ الصلاحية فات");
    if (b.placements.length) await placementsByKeys(b.placements);
    const made = [];
    for (let i = 0; i < b.count; i++) {
      for (let tries = 0; ; tries++) {
        try {
          made.push(await db.adGift.create({ data: { code: newGiftCode(), months: b.months, days: GIFT_MONTHS[b.months], recipient: b.recipient, note: b.note, placements: b.placements, expiresAt: b.expiresAt, createdById: s.userId } }));
          break;
        } catch (e) { if ((e as { code?: string }).code !== "P2002" || tries > 4) throw e; }
      }
    }
    await audit(s, "أنشأ أكواد هدية إعلانية", b.recipient ?? `${made.length} كود`, { months: b.months, count: made.length });
    res.status(201).json(made.map(giftView));
  }));
  r.delete("/admin/ads/gifts/:id", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req);
    const g = await db.adGift.findUnique({ where: { id: String(req.params.id) } });
    if (!g) throw notFound();
    if (g.usedByCampaignId) throw new HttpError(409, "gift_used", "الكود ده اتستخدم في حملة — مينفعش يتلغي");
    await db.adGift.update({ where: { id: g.id }, data: { voidedAt: new Date() } });
    await audit(s, "ألغى كود هدية", g.code);
    res.status(204).end();
  }));

  r.post("/admin/ads/blocks", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ placement: Key, reason: z.string().trim().min(2).max(120) }).and(z.object({ from: Day, to: Day })).parse(req.body);
    if (b.to < b.from) throw bad("bad_range", "تاريخ النهاية قبل البداية");
    if (dayCount(b.from, b.to) > MAX_CAMPAIGN_DAYS) throw bad("bad_range", "أقصى مدة سنة");
    const [p] = await placementsByKeys([b.placement]);
    const blk = await withAdsLock(ctx, async () => {
      const occ = await occupancy(ctx, [p.id], b.from, b.to);
      const hit = daysBetween(b.from, b.to).find((d) => { const o = occ.get(p.id, d); return o.booked + o.held > 0; });
      if (hit) throw new HttpError(409, "has_bookings", `فيه حجز في ${hit} — الغي/انقل الحملة الأول`);
      return db.adBlock.create({ data: { placementId: p.id, fromDate: b.from, toDate: b.to, reason: b.reason, createdById: s.userId } });
    });
    await audit(s, "قفل موضع إعلاني", p.name, { from: b.from, to: b.to, reason: b.reason });
    res.status(201).json({ id: blk.id, placement: p.key, from: blk.fromDate, to: blk.toDate, reason: blk.reason });
  }));
  r.delete("/admin/ads/blocks/:id", need("ads.manage"), wrap(async (req, res) => {
    const s = S(req);
    const cur = await db.adBlock.findUnique({ where: { id: String(req.params.id) }, include: { placement: true } });
    if (!cur) throw notFound();
    await db.adBlock.delete({ where: { id: cur.id } });
    await audit(s, "فتح موضع إعلاني", cur.placement.name, { from: cur.fromDate, to: cur.toDate });
    res.status(204).end();
  }));

  // ---------- البلاغات والإشراف على المحتوى
  const reportView = (x: { id: string; kind: string; targetId: string; targetUserId: string | null; targetLabel: string; reason: string; note: string; snippet: string; place: string; status: string; resolution: string | null; resolvedAt: Date | null; createdAt: Date; reporter?: { name: string } | null }, count = 1) =>
    ({ id: x.id, kind: x.kind, targetId: x.targetId, targetUserId: x.targetUserId, target: x.targetLabel, reason: x.reason, note: x.note, text: x.snippet, where: x.place, reporter: x.reporter?.name ?? "", status: x.status, resolution: x.resolution, resolvedAt: x.resolvedAt?.toISOString() ?? null, at: x.createdAt.toISOString(), count });

  r.get("/admin/reports", need("content.view"), wrap(async (req, res) => {
    const q = z.object({ status: z.enum(["open", "resolved"]).default("open"), kind: z.enum(["message", "story", "room", "user", "thread"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const rows = await db.report.findMany({ where: { status: q.status, ...(q.kind ? { kind: q.kind } : {}) }, include: { reporter: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: q.limit });
    const counts = new Map<string, number>();
    if (rows.length) {
      const g = await db.report.groupBy({ by: ["kind", "targetId"], where: { OR: rows.map((x) => ({ kind: x.kind, targetId: x.targetId })), status: q.status }, _count: { _all: true } });
      for (const x of g) counts.set(`${x.kind}:${x.targetId}`, x._count._all);
    }
    const open = await db.report.count({ where: { status: "open" } });
    res.set("X-Open-Reports", String(open));
    res.json(rows.map((x) => reportView(x, counts.get(`${x.kind}:${x.targetId}`) ?? 1)));
  }));

  r.get("/admin/reports/summary", need("content.view"), wrap(async (_req, res) => {
    const [open, resolved] = await Promise.all([db.report.count({ where: { status: "open" } }), db.report.count({ where: { status: "resolved" } })]);
    res.json({ open, resolved });
  }));

  /** معالجة بلاغ = معالجة كل البلاغات المفتوحة عن نفس الهدف مرة واحدة. */
  r.post("/admin/reports/:id/resolve", need("content.moderate"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ action: z.enum(["delete", "delete_ban", "warn", "dismiss"]) }).parse(req.body);
    const rep = await db.report.findUnique({ where: { id: String(req.params.id) } });
    if (!rep) throw notFound("البلاغ مش موجود");
    if (rep.status !== "open") throw bad("already_resolved", "البلاغ ده اتعالج قبل كده");
    if (b.action === "delete_ban" && !s.perms.has("users.manage")) throw forbidden("الحظر محتاج صلاحية إدارة المستخدمين");
    if ((b.action === "delete" || b.action === "delete_ban") && (rep.kind === "user")) {
      if (b.action === "delete") throw bad("bad_action", "مفيش محتوى يتحذف في بلاغ عن مستخدم — استخدم حذف + حظر أو تحذير");
    }
    // 1) تنفيذ الحذف على الهدف (لو متاح)
    if (b.action === "delete" || b.action === "delete_ban") {
      if (rep.kind === "message") {
        const m = await db.message.findUnique({ where: { id: rep.targetId } });
        if (m && !m.deleted) {
          const u = await db.message.update({ where: { id: m.id }, data: { deleted: true, text: "" }, include: messageInclude });
          await db.attachment.deleteMany({ where: { messageId: m.id } });
          const mem = await db.membership.findMany({ where: { threadId: m.threadId }, select: { userId: true } });
          emitToUsers(ctx, mem.map((x) => x.userId), "message:deleted", messageView({ ...u, attachment: null }));
        }
      } else if (rep.kind === "story") {
        await db.story.deleteMany({ where: { id: rep.targetId } });
      } else if (rep.kind === "room") {
        const room = await db.room.findUnique({ where: { id: rep.targetId } });
        if (room && !room.closedAt) {
          await db.$transaction([db.roomParticipant.deleteMany({ where: { roomId: room.id } }), db.room.update({ where: { id: room.id }, data: { closedAt: new Date() } })]);
          ctx.io?.to("rooms").emit("room:changed", { id: room.id });
        }
      } else if (rep.kind === "thread" && b.action === "delete") {
        throw bad("bad_action", "الجروب مينفعش يتحذف من هنا — استخدم تحذير أو حظر صاحبه");
      }
    }
    // 2) الحظر
    if (b.action === "delete_ban") {
      if (!rep.targetUserId) throw bad("no_target_user", "مفيش صاحب محتوى معروف للحظر");
      await setUserStatus(s, rep.targetUserId, "banned", `بلاغ ${rep.id}`);
    }
    // 3) التحذير
    if (b.action === "warn" && rep.targetUserId) {
      await notifyPush(ctx, [rep.targetUserId], { kind: "notice", title: "تنبيه من إدارة رع شات", body: "وصلنا بلاغ عن محتوى منك ومخالف لقواعد الاستخدام. التزم بالقواعد لتفادي إيقاف الحساب.", tag: `warn-${rep.id}` });
    }
    const done = await db.report.updateMany({ where: { kind: rep.kind, targetId: rep.targetId, status: "open" }, data: { status: "resolved", resolution: b.action, resolvedById: s.userId, resolvedAt: new Date() } });
    await audit(s, ({ delete: "حذف محتوى مبلَّغ عنه", delete_ban: "حذف محتوى وحظر صاحبه", warn: "حذّر صاحب محتوى", dismiss: "تجاهل بلاغ" } as const)[b.action], rep.targetLabel, { report: rep.id, kind: rep.kind, reason: rep.reason, closed: done.count });
    res.json({ id: rep.id, resolved: done.count, action: b.action });
  }));

  // ---------- الـ Stories النشطة
  r.get("/admin/stories", need("content.view"), wrap(async (_req, res) => {
    const rows = await db.story.findMany({ where: { expiresAt: { gt: new Date() } }, include: { author: { select: { name: true } }, _count: { select: { seenBy: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    const g = rows.length ? await db.report.groupBy({ by: ["targetId"], where: { kind: "story", status: "open", targetId: { in: rows.map((x) => x.id) } }, _count: { _all: true } }) : [];
    const rc = new Map(g.map((x) => [x.targetId, x._count._all]));
    res.json(rows.map((x) => ({ id: x.id, user: x.author.name, caption: x.caption, views: x._count.seenBy, reports: rc.get(x.id) ?? 0, at: x.createdAt.toISOString() })));
  }));
  r.delete("/admin/stories/:id", need("content.moderate"), wrap(async (req, res) => {
    const s = S(req);
    const st = await db.story.findUnique({ where: { id: String(req.params.id) }, include: { author: { select: { name: true } } } });
    if (!st) throw notFound("الـ Story مش موجودة");
    await db.story.delete({ where: { id: st.id } });
    await audit(s, "حذف Story", st.author.name, { id: st.id });
    res.status(204).end();
  }));

  // ---------- الصفحة الرئيسية (أرقام حقيقية، والأقسام بتظهر حسب صلاحيات الموظف)
  r.get("/admin/overview", wrap(async (req, res) => {
    const s = await loadStaff((req as AuthedRequest).userId);
    const has = (p: string) => s.perms.has(p);
    const now = new Date();
    const startToday = startOfCairoDay(now); // بداية اليوم بتوقيت القاهرة (بيحسب التوقيت الصيفي)
    const d30 = new Date(now.getTime() - 30 * 86400_000);
    const out: Record<string, unknown> = {};
    if (has("users.view")) {
      const [activeToday, newUsers30, total] = await Promise.all([
        db.user.count({ where: { lastSeenAt: { gte: startToday } } }), db.user.count({ where: { createdAt: { gte: d30 } } }), db.user.count(),
      ]);
      const signups = await db.$queryRaw<{ d: string; c: bigint }[]>`SELECT to_char(("createdAt" AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD') AS d, count(*)::bigint AS c FROM "User" WHERE "createdAt" >= ${d30} GROUP BY 1 ORDER BY 1`;
      Object.assign(out, { activeToday, newUsers30, totalUsers: total, signups: signups.map((x) => ({ day: x.d, count: Number(x.c) })) });
    }
    if (has("content.view")) {
      const [messagesToday, liveRooms, listeners, openReports] = await Promise.all([
        db.message.count({ where: { createdAt: { gte: startToday } } }), db.room.count({ where: { closedAt: null } }), db.roomParticipant.count({ where: { room: { closedAt: null } } }), db.report.count({ where: { status: "open" } }),
      ]);
      const msgs = await db.$queryRaw<{ d: string; c: bigint }[]>`SELECT to_char(("createdAt" AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD') AS d, count(*)::bigint AS c FROM "Message" WHERE "createdAt" >= ${d30} GROUP BY 1 ORDER BY 1`;
      Object.assign(out, { messagesToday, liveRooms, listeners, openReports, messagesDaily: msgs.map((x) => ({ day: x.d, count: Number(x.c) })) });
    }
    if (has("finance.view")) {
      const g = await db.walletTx.aggregate({ where: { createdAt: { gte: d30 }, kind: "bill", refundedAt: null }, _sum: { amount: true }, _count: { _all: true } });
      Object.assign(out, { billsVolume30: Number(g._sum.amount ?? 0), billsCount30: g._count._all });
    }
    if (has("ads.view")) {
      const from = addDays(todayCairo(), -30);
      const adv = await db.adCampaign.aggregate({ where: { status: "approved", startDate: { gte: from } }, _sum: { total: true } });
      const pendingAds = await db.adCampaign.count({ where: { status: "pending" } });
      Object.assign(out, { adRevenue30: Number(adv._sum.total ?? 0), pendingAds });
    }
    res.json(out);
  }));

  // ---------- الجروبات والغرف
  r.get("/admin/spaces/groups", need("content.view"), wrap(async (_req, res) => {
    const rows = await db.thread.findMany({ where: { type: "group" }, include: { createdBy: { select: { name: true } }, _count: { select: { members: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    const g = rows.length ? await db.report.groupBy({ by: ["targetId"], where: { kind: "thread", status: "open", targetId: { in: rows.map((x) => x.id) } }, _count: { _all: true } }) : [];
    const rc = new Map(g.map((x) => [x.targetId, x._count._all]));
    res.json(rows.map((t) => ({ id: t.id, name: t.name ?? "", owner: t.createdBy?.name ?? "—", members: t._count.members, reports: rc.get(t.id) ?? 0, status: t.restrictedAt ? "restricted" : "active", createdAt: t.createdAt.toISOString() })));
  }));
  r.patch("/admin/spaces/groups/:id", need("content.moderate"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ restricted: z.boolean() }).parse(req.body);
    const t = await db.thread.findUnique({ where: { id: String(req.params.id) } });
    if (!t || t.type !== "group") throw notFound("الجروب مش موجود");
    await db.thread.update({ where: { id: t.id }, data: { restrictedAt: b.restricted ? new Date() : null } });
    await audit(s, b.restricted ? "قيّد جروب" : "رفع تقييد جروب", t.name ?? t.id);
    res.json({ id: t.id, status: b.restricted ? "restricted" : "active" });
  }));
  r.delete("/admin/spaces/groups/:id", need("content.moderate"), wrap(async (req, res) => {
    const s = S(req);
    const t = await db.thread.findUnique({ where: { id: String(req.params.id) }, include: { members: { select: { userId: true } } } });
    if (!t || t.type !== "group") throw notFound("الجروب مش موجود");
    await db.thread.delete({ where: { id: t.id } });
    emitToUsers(ctx, t.members.map((m) => m.userId), "thread:removed", { id: t.id });
    await audit(s, "حذف جروب", t.name ?? t.id, { members: t.members.length });
    res.status(204).end();
  }));
  r.get("/admin/spaces/rooms", need("content.view"), wrap(async (_req, res) => {
    const rows = await db.room.findMany({ where: { OR: [{ closedAt: null }, { closedAt: { gte: new Date(Date.now() - 7 * 86400_000) } }] }, include: { owner: { select: { name: true } }, participants: { select: { identity: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    res.json(rows.map((x) => ({ id: x.id, name: x.name, host: x.owner.name, live: x.closedAt ? 0 : x.participants.length, temp: x.participants.filter((p) => p.identity === "temp").length, status: x.closedAt ? "ended" : "live", createdAt: x.createdAt.toISOString() })));
  }));
  r.post("/admin/spaces/rooms/:id/close", need("content.moderate"), wrap(async (req, res) => {
    const s = S(req);
    const room = await db.room.findUnique({ where: { id: String(req.params.id) } });
    if (!room || room.closedAt) throw notFound("الغرفة مش موجودة أو مقفولة");
    await db.$transaction([db.roomParticipant.deleteMany({ where: { roomId: room.id } }), db.room.update({ where: { id: room.id }, data: { closedAt: new Date() } })]);
    ctx.io?.to("rooms").emit("room:changed", { id: room.id });
    await audit(s, "أقفل غرفة", room.name);
    res.status(204).end();
  }));

  // ---------- الإشعارات الجماعية
  const AUDIENCES = { all: "كل المستخدمين", active7: "نشطون آخر ٧ أيام", inactive30: "غير نشطين ٣٠ يوم", wallet: "مستخدمو المحفظة (عندهم معاملات)" } as const;
  r.get("/admin/notifications", need("notifications.send"), wrap(async (_req, res) => {
    const rows = await db.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    res.json({ audiences: AUDIENCES, history: rows.map((x) => ({ id: x.id, title: x.title, body: x.body, audience: x.audience, audienceLabel: AUDIENCES[x.audience as keyof typeof AUDIENCES] ?? x.audience, reach: x.reach, devices: x.devices, by: x.sentByName, at: x.createdAt.toISOString() })) });
  }));
  r.post("/admin/notifications", need("notifications.send"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ title: z.string().trim().min(2).max(60), body: z.string().trim().max(160).default(""), audience: z.enum(["all", "active7", "inactive30", "wallet"]) }).parse(req.body);
    const last = await db.broadcast.findFirst({ orderBy: { createdAt: "desc" } });
    if (last && Date.now() - last.createdAt.getTime() < 60_000) throw new HttpError(429, "too_many", "استني دقيقة بين كل إشعار جماعي والتاني");
    const d7 = new Date(Date.now() - 7 * 86400_000), d30 = new Date(Date.now() - 30 * 86400_000);
    const where = b.audience === "all" ? {} : b.audience === "active7" ? { lastSeenAt: { gte: d7 } } : b.audience === "inactive30" ? { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: d30 } }] } : { wallet: { txs: { some: {} } } };
    const users = await db.user.findMany({ where: { modStatus: "active", ...where }, select: { id: true } });
    const ids = users.map((u) => u.id);
    let devices = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      devices += await db.pushSub.count({ where: { userId: { in: chunk } } });
      await notifyPush(ctx, chunk, { kind: "notice", title: b.title, body: b.body, tag: "broadcast" });
      emitToUsers(ctx, chunk, "notice", { title: b.title, body: b.body });
    }
    const row = await db.broadcast.create({ data: { title: b.title, body: b.body, audience: b.audience, reach: ids.length, devices, sentById: s.userId, sentByName: s.name } });
    await audit(s, "أرسل إشعارًا جماعيًا", b.title, { audience: b.audience, reach: ids.length });
    res.status(201).json({ id: row.id, reach: ids.length, devices });
  }));

  // ---------- الإعدادات
  r.get("/admin/settings", need("settings.manage"), wrap(async (_req, res) => { res.json(await getSettings(ctx)); }));
  r.put("/admin/settings", need("settings.manage"), wrap(async (req, res) => {
    const s = S(req);
    const b = z.object({ maintenance: z.boolean().optional(), maintenanceMessage: z.string().trim().min(3).max(200).optional(), registrationOpen: z.boolean().optional() }).parse(req.body);
    const out = await saveSettings(ctx, b);
    await audit(s, "عدّل إعدادات التطبيق", undefined, b);
    res.json(out);
  }));

  void ALL_PERMS;
  return r;
}
