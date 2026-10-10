import { Router } from "express";
import { assertClean } from "../lib/contentFilter.js";
import { z } from "zod";
import { consumeOtp, normalizeTarget, requestOtp, requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { HttpError, notFound, wrap } from "../lib/errors.js";
import { meUser, publicUser } from "../serialize.js";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export function meRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));
  r.get("/me", wrap(async (req, res) => {
    const u = await ctx.db.user.findUnique({ where: { id: (req as AuthedRequest).userId } });
    if (!u) throw notFound();
    res.json(meUser(u));
  }));
  r.patch("/me", wrap(async (req, res) => {
    const b = z.object({
      name: z.string().trim().min(1).max(60).optional(),
      status: z.string().max(60).optional(),
      color: Color.optional(),
      photoUrl: z.string().max(500).nullable().optional(),
      lang: z.enum(["ar", "en", "zh", "fr"]).optional(),
    }).parse(req.body);
    assertClean(ctx, b.name, b.status);
    const u = await ctx.db.user.update({ where: { id: (req as AuthedRequest).userId }, data: b });
    res.json(meUser(u));
  }));
  // بحث في المستخدمين (لبدء دردشة/إضافة أعضاء)
  r.get("/users", wrap(async (req, res) => {
    const q = z.string().trim().max(100).default("").parse(req.query.q ?? "");
    const me = (req as AuthedRequest).userId;
    const users = await ctx.db.user.findMany({
      where: { id: { not: me }, modStatus: { not: "deleted" }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q.toLowerCase() } }] } : {}) },
      orderBy: { name: "asc" },
      take: 50,
    });
    res.json(users.map(publicUser));
  }));

  /** حق الاطلاع والحصول على نسخة (قانون حماية البيانات الشخصية ١٥١/٢٠٢٠): كل بيانات المستخدم بصيغة JSON */
  r.get("/me/export", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const db = ctx.db;
    const u = await db.user.findUnique({ where: { id: me } });
    if (!u) throw notFound();
    const [sessions, messages, stories, calls, wallet, txs, reports, blocks, pushSubs, memberships, adEvents] = await Promise.all([
      db.session.findMany({ where: { userId: me }, select: { device: true, createdAt: true, lastUsed: true, revokedAt: true } }),
      db.message.findMany({ where: { authorId: me }, orderBy: { createdAt: "asc" }, take: 50000, select: { id: true, threadId: true, text: true, edited: true, deleted: true, createdAt: true, attachment: { select: { name: true, size: true, mime: true, url: true } } } }),
      db.story.findMany({ where: { authorId: me }, select: { id: true, caption: true, imageUrl: true, createdAt: true, expiresAt: true } }),
      db.callLog.findMany({ where: { userId: me }, orderBy: { at: "asc" }, select: { threadId: true, mode: true, dir: true, at: true, dur: true } }),
      db.wallet.findUnique({ where: { userId: me }, select: { balance: true, currency: true } }),
      db.walletTx.findMany({ where: { userId: me }, orderBy: { createdAt: "asc" }, select: { kind: true, service: true, amount: true, discount: true, ref: true, refundedAt: true, createdAt: true } }),
      db.report.findMany({ where: { reporterId: me }, select: { kind: true, reason: true, note: true, status: true, createdAt: true } }),
      db.block.findMany({ where: { blockerId: me }, select: { blockedId: true, createdAt: true } }),
      db.pushSub.count({ where: { userId: me } }),
      db.membership.findMany({ where: { userId: me }, select: { threadId: true, role: true, joinedAt: true } }),
      db.adEvent.findMany({ where: { userId: me }, select: { adKey: true, kind: true, createdAt: true } }),
    ]);
    res.setHeader("Content-Disposition", 'attachment; filename="rachat-my-data.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      notice: "نسخة من بياناتك الشخصية لدى رع شات بناءً على طلبك (قانون حماية البيانات الشخصية رقم 151 لسنة 2020).",
      profile: { id: u.id, name: u.name, phone: u.phone, email: u.email, status: u.status, color: u.color, photoUrl: u.photoUrl, lang: u.lang, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt },
      sessions, memberships, messages, stories, calls,
      wallet: wallet ? { balance: Number(wallet.balance), currency: wallet.currency } : null,
      walletTransactions: txs.map((t) => ({ ...t, amount: Number(t.amount), discount: Number(t.discount) })),
      reportsFiled: reports, blockedUsers: blocks, pushSubscriptions: pushSubs, adEvents,
    });
  }));

  /* ---------- حذف الحساب (في أي وقت) ----------
     1) POST /me/delete/otp  → كود تأكيد على رقم/إيميل الحساب نفسه
     2) DELETE /me {code, forfeitBalance?} → إخفاء هوية نهائي. الرصيد لو موجود لازم يتأكد التنازل عنه صراحة. */
  const contactOf = (u: { phone: string | null; email: string | null }) => (u.phone ? ({ channel: "phone", target: u.phone } as const) : u.email ? ({ channel: "email", target: u.email } as const) : null);
  const mask = (t: string) => (t.includes("@") ? t.replace(/^(.).*(@.*)$/, "$1•••$2") : t.slice(0, 3) + "•••••" + t.slice(-2));

  r.post("/me/delete/otp", wrap(async (req, res) => {
    const u = await ctx.db.user.findUnique({ where: { id: (req as AuthedRequest).userId }, include: { wallet: { select: { balance: true } } } });
    const c = u && contactOf(u);
    if (!u || !c) throw notFound();
    await requestOtp(ctx, c.channel, c.target);
    res.json({ channel: c.channel, hint: mask(c.target), balance: Number(u.wallet?.balance ?? 0) });
  }));

  r.delete("/me", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ code: z.string().min(4).max(10), forfeitBalance: z.boolean().default(false) }).parse(req.body ?? {});
    const db = ctx.db;
    const u = await db.user.findUnique({ where: { id: me }, include: { wallet: { select: { balance: true } }, staff: true } });
    const c = u && contactOf(u);
    if (!u || !c) throw notFound();
    const owners = ctx.config.OWNER_CONTACTS.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (x.includes("@") ? x.toLowerCase() : normalizeTarget("phone", x)));
    if (u.staff || owners.includes(c.target)) throw new HttpError(409, "staff_member", "الحساب ده من فريق الإدارة. اطلب من المالك يشيلك من الفريق الأول.");
    const balance = Number(u.wallet?.balance ?? 0);
    if (balance > 0 && !b.forfeitBalance) throw new HttpError(409, "wallet_balance", `في محفظتك رصيد ${balance} ج.م هيضيع مع حذف الحساب. اصرفه الأول أو أكّد التنازل عنه.`);
    await consumeOtp(ctx, c.channel, c.target, b.code); // بعد فحص الشروط عشان الكود ما يتحرقش على خطأ

    const ownedRooms = await db.room.findMany({ where: { ownerId: me, closedAt: null }, select: { id: true } });
    const joined = await db.roomParticipant.findMany({ where: { userId: me }, select: { roomId: true } });
    const now = new Date();
    await db.$transaction([
      db.session.updateMany({ where: { userId: me, revokedAt: null }, data: { revokedAt: now } }),
      db.pushSub.deleteMany({ where: { userId: me } }),
      db.adminHandoff.deleteMany({ where: { userId: me } }),
      db.attachment.deleteMany({ where: { message: { authorId: me } } }),
      db.message.updateMany({ where: { authorId: me }, data: { deleted: true, text: "" } }),
      db.story.deleteMany({ where: { authorId: me } }),
      db.callLog.deleteMany({ where: { userId: me } }),
      db.adEvent.deleteMany({ where: { userId: me } }),
      db.block.deleteMany({ where: { OR: [{ blockerId: me }, { blockedId: me }] } }),
      db.roomParticipant.deleteMany({ where: { userId: me } }),
      db.room.updateMany({ where: { ownerId: me, closedAt: null }, data: { closedAt: now } }),
      db.membership.deleteMany({ where: { userId: me } }),
      db.otpCode.deleteMany({ where: { channel: c.channel, target: c.target } }),
      db.wallet.updateMany({ where: { userId: me }, data: { balance: 0, pinHash: null } }),
      db.user.update({ where: { id: me }, data: { name: "حساب محذوف", phone: null, email: null, photoUrl: null, status: "", modStatus: "deleted", deletedAt: now } }),
      db.auditLog.create({ data: { actorId: me, actorName: "المستخدم (حذف ذاتي)", action: "حذف حساب", target: me, meta: { forfeited: balance } } }),
    ]);
    ctx.io?.in(`user:${me}`).disconnectSockets(true);
    for (const x of new Set([...ownedRooms.map((r) => r.id), ...joined.map((r) => r.roomId)])) ctx.io?.to("rooms").emit("room:changed", { id: x });
    res.status(204).end();
  }));
  return r;
}
