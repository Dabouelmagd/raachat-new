import { Router } from "express";
import { assertNotBlocked, blockedByMe } from "../lib/blocks.js";
import { assertClean } from "../lib/contentFilter.js";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { bad, forbidden, notFound, wrap } from "../lib/errors.js";
import { emitToUsers } from "../realtime.js";
import { loadThreadFor, threadView } from "../serialize.js";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const MAX_PINNED = 3;

/**
 * الجروب المتقيّد من الإدارة لازم يبقى **متجمّد بالكامل**.
 * كان التقييد متفحوص في مسار إرسال الرسالة الجديد بس — فالعضو يقدر يعدّل رسالة
 * قديمة لمحتوى جديد، أو يتفاعل (والتفاعل بيعيد بث الرسالة كلها للكل)، أو يمسح،
 * والمالك يقدر يغيّر الاسم ويضيف أعضاء. يعني «متقيّد» كانت معناها «ممنوع نص
 * جديد» بس.
 */
export async function assertNotRestricted(ctx: Ctx, threadId: string) {
  const t = await ctx.db.thread.findUnique({ where: { id: threadId }, select: { restrictedAt: true } });
  if (t?.restrictedAt) throw forbidden("الجروب ده متقيّد من إدارة التطبيق");
}

/**
 * **النشر في القناة للمالك والمشرفين بس.** القناة بث مش جروب: المشترك بيقرا
 * ويتفاعل، إنما مابيكتبش. الحارس ده لازم يبقى على **كل** مسار بيعمل رسالة
 * جديدة (نص · مرفق · استطلاع) مش على مسار واحد — نفس درس مراجعة الجروبات.
 */
export async function assertCanPost(ctx: Ctx, threadId: string, userId: string) {
  const t = await ctx.db.thread.findUnique({ where: { id: threadId }, select: { type: true } });
  if (t?.type !== "channel") return;
  const m = await ctx.db.membership.findUnique({ where: { threadId_userId: { threadId, userId } }, select: { role: true } });
  if (m?.role !== "owner" && m?.role !== "admin") throw forbidden("القناة دي للقراءة بس — النشر لصاحب القناة والمشرفين");
}

export async function assertMember(ctx: Ctx, threadId: string, userId: string) {
  const m = await ctx.db.membership.findUnique({ where: { threadId_userId: { threadId, userId } } });
  if (!m) throw forbidden("مش عضو في المحادثة دي");
  return m;
}

export function threadRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));

  r.get("/threads", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const rows = await ctx.db.thread.findMany({
      where: { members: { some: { userId: me } } },
      include: { members: { include: { user: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
    });
    const pinnedAt = (t: (typeof rows)[number]) => t.members.find((m) => m.userId === me)?.pinnedAt ?? null;
    const activity = (t: (typeof rows)[number]) => (t.messages[0]?.createdAt ?? t.createdAt).getTime();
    // المثبّتة فوق (الأحدث تثبيتًا الأول)، والباقي بترتيب آخر نشاط
    rows.sort((a, b) => {
      const pa = pinnedAt(a), pb = pinnedAt(b);
      if (pa && !pb) return -1;
      if (pb && !pa) return 1;
      if (pa && pb) return pb.getTime() - pa.getTime();
      return activity(b) - activity(a);
    });
    // عدد الرسايل اللي لسه ما اتقرتش في كل محادثة — **استعلام واحد** لكل القايمة
    // مش واحد لكل محادثة. رسايلي أنا ورسايل اللي حاظرهم مش محسوبين.
    const hidden = await blockedByMe(ctx, me);
    const counts = await ctx.db.message.groupBy({
      by: ["threadId"],
      where: {
        threadId: { in: rows.map((t) => t.id) },
        authorId: { not: me, ...(hidden.length ? { notIn: hidden } : {}) },
        deleted: false,
        OR: rows.map((t) => {
          const seen = t.members.find((m) => m.userId === me)?.lastReadAt;
          return { threadId: t.id, ...(seen ? { createdAt: { gt: seen } } : {}) };
        }),
      },
      _count: { _all: true },
    });
    const unread = new Map(counts.map((c) => [c.threadId, c._count._all]));
    res.json(rows.map((t) => ({
      ...threadView(t, me),
      lastActivity: (t.messages[0]?.createdAt ?? t.createdAt).toISOString(),
      unread: unread.get(t.id) ?? 0,
      pinned: !!pinnedAt(t),
    })));
  }));

  // جروبات عامة للاكتشاف
  r.get("/threads/public", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const rows = await ctx.db.thread.findMany({
      where: { type: "group", isPublic: true },
      include: { members: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(rows.map((t) => ({ ...threadView(t, me), joined: t.members.some((m) => m.userId === me) })));
  }));

  /** اكتشاف القنوات العامة — العدد بس، مفيش أسماء مشتركين. */
  r.get("/channels", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const rows = await ctx.db.thread.findMany({
      where: { type: "channel", isPublic: true },
      include: { members: { include: { user: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(rows.map((t) => ({
      ...threadView(t, me),
      subscribed: t.members.some((m) => m.userId === me),
      lastActivity: (t.messages[0]?.createdAt ?? t.createdAt).toISOString(),
    })));
  }));

  /**
   * الاشتراك في قناة عامة. صاحب القناة اللي بيرجع يرجع **مالك** مش مشترك عادي
   * (نفس درس الجروب العام: الـ create كان بيحطّه عضو عادي للأبد).
   */
  r.post("/threads/:id/subscribe", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    const t0 = await ctx.db.thread.findUnique({ where: { id } });
    if (!t0 || t0.type !== "channel" || !t0.isPublic) throw notFound("قناة غير موجودة");
    const role = t0.createdById === me ? "owner" : "member";
    await ctx.db.membership.upsert({ where: { threadId_userId: { threadId: id, userId: me } }, update: {}, create: { threadId: id, userId: me, role } });
    const t = (await loadThreadFor(ctx.db, id))!;
    emitToUsers(ctx, [me], "thread:updated", threadView(t, me));
    res.json(threadView(t, me));
  }));

  /** إلغاء الاشتراك — والمالك مايقدرش يسيب قناته (تفضل بلا صاحب للأبد). */
  r.delete("/threads/:id/subscribe", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    const m = await assertMember(ctx, id, me);
    const t0 = await ctx.db.thread.findUnique({ where: { id }, select: { type: true } });
    if (t0?.type !== "channel") throw bad("not_channel", "المسار ده للقنوات بس");
    if (m.role === "owner") throw bad("channel_owner", "إنت صاحب القناة — مينفعش تلغي اشتراكك فيها");
    await ctx.db.membership.delete({ where: { threadId_userId: { threadId: id, userId: me } } });
    emitToUsers(ctx, [me], "thread:removed", { id });
    res.status(204).end();
  }));

  r.post("/threads", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.discriminatedUnion("type", [
      z.object({ type: z.literal("dm"), memberIds: z.array(z.string()).length(1) }),
      z.object({
        type: z.literal("group"),
        name: z.string().trim().min(1).max(80),
        // لا يوجد حد أقصى لعدد أعضاء الجروب
        memberIds: z.array(z.string()).default([]),
        color: Color.optional(),
        icon: z.string().max(30).optional(),
        photoUrl: z.string().max(500).optional(),
        isPublic: z.boolean().default(false),
      }),
      z.object({
        type: z.literal("channel"),
        name: z.string().trim().min(1).max(80),
        about: z.string().trim().max(300).optional(),
        color: Color.optional(),
        icon: z.string().max(30).optional(),
        photoUrl: z.string().max(500).optional(),
        // القناة عامة افتراضيًا — معناها إنها تتلاقى في الاكتشاف
        isPublic: z.boolean().default(true),
      }),
    ]).parse(req.body);

    if (b.type === "group") assertClean(ctx, b.name);
    // اسم القناة ووصفها بيبانوا لكل الناس في الاكتشاف — الاتنين متفلترين
    if (b.type === "channel") assertClean(ctx, b.name, b.about);
    if (b.type === "channel") {
      const created = await ctx.db.thread.create({
        data: {
          type: "channel", name: b.name, about: b.about, color: b.color, icon: b.icon, photoUrl: b.photoUrl,
          isPublic: b.isPublic, createdById: me, members: { create: [{ userId: me, role: "owner" }] },
        },
      });
      const t = (await loadThreadFor(ctx.db, created.id))!;
      emitToUsers(ctx, [me], "thread:new", threadView(t, me));
      res.status(201).json(threadView(t, me));
      return;
    }
    const others = [...new Set(b.memberIds)].filter((id) => id !== me);
    const found = await ctx.db.user.findMany({ where: { id: { in: others }, modStatus: { not: "deleted" } }, select: { id: true } });
    if (found.length !== others.length) throw bad("unknown_member", "في عضو غير موجود");

    if (b.type === "dm") {
      if (others.length !== 1) throw bad("invalid_dm", "الدردشة الفردية لازم يكون فيها شخص واحد غيرك");
      await assertNotBlocked(ctx, me, others[0]!);
      const dmKey = [me, others[0]].sort().join(":");
      const existing = await ctx.db.thread.findUnique({ where: { dmKey } });
      if (existing) {
        const t = await loadThreadFor(ctx.db, existing.id);
        res.status(200).json(threadView(t!, me));
        return;
      }
      const created = await ctx.db.thread.create({
        data: { type: "dm", dmKey, createdById: me, members: { create: [{ userId: me }, { userId: others[0] }] } },
      });
      const t = (await loadThreadFor(ctx.db, created.id))!;
      for (const m of t.members) emitToUsers(ctx, [m.userId], "thread:new", threadView(t, m.userId));
      res.status(201).json(threadView(t, me));
      return;
    }

    const created = await ctx.db.thread.create({
      data: {
        type: "group", name: b.name, color: b.color, icon: b.icon, photoUrl: b.photoUrl, isPublic: b.isPublic, createdById: me,
        members: { create: [{ userId: me, role: "owner" }, ...others.map((userId) => ({ userId }))] },
      },
    });
    const t = (await loadThreadFor(ctx.db, created.id))!;
    for (const m of t.members) emitToUsers(ctx, [m.userId], "thread:new", threadView(t, m.userId));
    res.status(201).json(threadView(t, me));
  }));

  // تعديل شكل الجروب (اسم/صورة/لون/أيقونة) — للمالك والمشرفين
  r.patch("/threads/:id", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    const m = await assertMember(ctx, id, me);
    const t0 = await ctx.db.thread.findUnique({ where: { id } });
    if (!t0 || (t0.type !== "group" && t0.type !== "channel")) throw notFound();
    if (m.role === "member") throw forbidden("للمشرفين فقط");
    const b = z.object({
      name: z.string().trim().min(1).max(80).optional(),
      about: z.string().trim().max(300).nullable().optional(),
      color: Color.nullable().optional(),
      icon: z.string().max(30).nullable().optional(),
      photoUrl: z.string().max(500).nullable().optional(),
    }).parse(req.body);
    assertClean(ctx, b.name, b.about); // كان على الإنشاء بس — فالتغيير كان بيعدّي
    await assertNotRestricted(ctx, id);
    await ctx.db.thread.update({ where: { id }, data: b });
    const t = (await loadThreadFor(ctx.db, id))!;
    for (const mm of t.members) emitToUsers(ctx, [mm.userId], "thread:updated", threadView(t, mm.userId));
    res.json(threadView(t, me));
  }));

  // إضافة أعضاء (بدون حد أقصى)
  r.post("/threads/:id/members", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    const m = await assertMember(ctx, id, me);
    const t0 = await ctx.db.thread.findUnique({ where: { id } });
    if (!t0 || t0.type !== "group") throw notFound();
    if (m.role === "member") throw forbidden("للمشرفين فقط");
    const b = z.object({ memberIds: z.array(z.string()).min(1) }).parse(req.body);
    const ids = [...new Set(b.memberIds)];
    await assertNotRestricted(ctx, id);
    // الحساب المحذوف كان ممكن يترجّع للجروب (الصف باقي بـ modStatus=deleted)،
    // والمعرّف المجهول كان بيتبلع في سكوت والرد 200 كإن كله تمام — زي مسار الإنشاء بالظبط.
    const found = await ctx.db.user.findMany({ where: { id: { in: ids }, modStatus: { not: "deleted" } }, select: { id: true } });
    if (found.length !== ids.length) throw bad("unknown_member", "فيه حساب مش موجود أو محذوف");
    await ctx.db.membership.createMany({ data: found.map((u) => ({ threadId: id, userId: u.id })), skipDuplicates: true });
    const t = (await loadThreadFor(ctx.db, id))!;
    for (const mm of t.members) emitToUsers(ctx, [mm.userId], "thread:updated", threadView(t, mm.userId));
    res.json(threadView(t, me));
  }));

  r.post("/threads/:id/join", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    const t0 = await ctx.db.thread.findUnique({ where: { id } });
    if (!t0 || t0.type !== "group" || !t0.isPublic) throw notFound("جروب عام غير موجود");
    // الدور بيتحدد من منشئ الجروب: المالك اللي خرج ورجع كان بيرجع **عضو عادي**
    // للأبد (الـ create بيحط الافتراضي)، فيتقفل عليه تغيير الاسم وإضافة الأعضاء
    // بينما الواجهة لسه بتعامله كمالك.
    const role = t0.createdById === me ? "owner" : "member";
    await ctx.db.membership.upsert({ where: { threadId_userId: { threadId: id, userId: me } }, update: {}, create: { threadId: id, userId: me, role } });
    const t = (await loadThreadFor(ctx.db, id))!;
    for (const mm of t.members) emitToUsers(ctx, [mm.userId], "thread:updated", threadView(t, mm.userId));
    res.json(threadView(t, me));
  }));

  r.delete("/threads/:id/members/me", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    const m = await assertMember(ctx, id, me);
    const t0 = await ctx.db.thread.findUnique({ where: { id }, select: { type: true } });
    // الخروج من محادثة فردية كان بيعدّي، والطرف التاني يشوف بعدها «الحساب ده
    // اتحذف ومينفعش تبعتله» — رسالة غلط تمامًا عن حساب شغّال.
    if (t0?.type === "channel") throw bad("use_unsubscribe", "القناة بتتسيب بإلغاء الاشتراك");
    if (t0?.type !== "group") throw bad("not_group", "المحادثة الفردية مالهاش خروج");
    if (m.role !== "member") {
      const owners = await ctx.db.membership.count({ where: { threadId: id, role: { not: "member" } } });
      // آخر مالك لو خرج، الجروب يفضل بلا مالك للأبد: مفيش مسار لترقية حد تاني.
      if (owners <= 1) throw bad("last_owner", "إنت آخر مشرف في الجروب — رقّي حد تاني قبل ما تخرج أو اقفل الجروب");
    }
    await ctx.db.membership.delete({ where: { threadId_userId: { threadId: id, userId: me } } });
    const t = await loadThreadFor(ctx.db, id);
    // الباقيين كانوا بيفضلوا شايفين اللي خرج في عدد الأعضاء لحد ما يقفلوا التطبيق
    if (t) for (const mm of t.members) emitToUsers(ctx, [mm.userId], "thread:updated", threadView(t, mm.userId));
    res.status(204).end();
  }));

  /**
   * تثبيت المحادثة فوق القايمة. **خاص بصاحبه** — الطرف التاني مايعرفش.
   * الحد ٣ زي واتساب: فوق كده القايمة بتبقى كلها «مثبّتة» ويروح معناها.
   */
  r.put("/threads/:id/pin", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    await assertMember(ctx, id, me);
    const already = await ctx.db.membership.count({ where: { userId: me, pinnedAt: { not: null }, threadId: { not: id } } });
    if (already >= MAX_PINNED) throw bad("too_many_pinned", `تقدر تثبّت ${MAX_PINNED} محادثات بس — شيل واحدة الأول`);
    await ctx.db.membership.update({ where: { threadId_userId: { threadId: id, userId: me } }, data: { pinnedAt: new Date() } });
    res.status(204).end();
  }));
  r.delete("/threads/:id/pin", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    await ctx.db.membership.updateMany({ where: { threadId: String(req.params.id), userId: me }, data: { pinnedAt: null } });
    res.status(204).end();
  }));

  r.post("/threads/:id/read", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    await assertMember(ctx, id, me);
    const at = new Date();
    await ctx.db.membership.update({ where: { threadId_userId: { threadId: id, userId: me } }, data: { lastReadAt: at } });
    /**
     * 🔴 البثّ ده كان **ناقص خالص**: القراءة بتتسجّل في القاعدة والطرف التاني
     * علامته بتفضل ✓ لحد ما يعمل تحديث للصفحة. يعني تبعت، الطرف التاني يقرا
     * قدامك، وانت شايف إن الرسالة لسه ما وصلتش — ومفيش أي خطأ في أي مكان.
     * (اتكشف بتجربة حقيقية بمتصفحين في ١٨ أكتوبر ٢٠٢٦.)
     *
     * ولباقي الأعضاء بس — صاحب القراءة مش محتاج يعرف إنه قرا بنفسه.
     */
    const others = await ctx.db.membership.findMany({ where: { threadId: id, userId: { not: me } }, select: { userId: true } });
    if (others.length) emitToUsers(ctx, others.map((o) => o.userId), "read", { threadId: id, at: at.toISOString() });
    res.status(204).end();
  }));

  return r;
}
