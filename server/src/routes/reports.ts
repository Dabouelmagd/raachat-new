import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { HttpError, bad, notFound, wrap } from "../lib/errors.js";

/**
 * **`child_safety` سبب منفصل عن قصد** (١٥ أكتوبر ٢٠٢٦): قبل كده اللي يشوف
 * محتوى اعتداء على طفل مكان أمامه غير «غير لائق» أو «سبب آخر» — فالبلاغ يقع
 * في نفس طابور السبام ومحدش يعرف إنه حالة طارئة. وبلاي بتطلب مسار إبلاغ
 * **صريح** لـ CSAE من أي تطبيق اجتماعي، و`community.html` بيوعد بـ«الإجراء
 * من أول بلاغ وبأقصى درجة» — ووعد بلا سبب مخصّص يبقى بلا طريق.
 */
export const REPORT_REASONS = ["child_safety", "abuse", "spam", "inappropriate", "impersonation", "scam", "other"] as const;

/**
 * الحد اليومي للبلاغات العادية. و**بلاغات سلامة الأطفال ليها حد لوحدها وأوسع**:
 * لو حد عمل ٢٠ بلاغًا على سبام النهاردة، مينفعش يكون ده السبب اللي يمنعه من
 * الإبلاغ عن اعتداء على طفل. ومش بلا حد خالص عشان مايبقاش طريقًا للإزعاج —
 * والتكرار على نفس الهدف بيتجمّع في صف واحد بـ `upsert` أصلًا.
 */
const MAX_PER_DAY = 20;
const MAX_CHILD_SAFETY_PER_DAY = 50;

/** إبلاغ المستخدم عن رسالة/ستوري/غرفة/مستخدم/جروب. بيحفظ نسخة من النص وقت البلاغ. */
export function reportRoutes(ctx: Ctx) {
  const r = Router();
  const db = ctx.db;
  r.use(requireAuth(ctx));

  r.post("/reports", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({
      kind: z.enum(["message", "story", "room", "user", "thread"]), targetId: z.string().min(1).max(60),
      reason: z.enum(REPORT_REASONS), note: z.string().trim().max(300).default(""),
    }).parse(req.body);

    const since = new Date(Date.now() - 24 * 3600_000);
    const child = b.reason === "child_safety";
    // الحد بيتحسب **على نفس نوع البلاغ**: بلاغات سلامة الأطفال عندها عدّادها
    // وحدها، فامتلاء الحد العادي مابيقفلش الطريق عليها (ولا العكس).
    const used = await db.report.count({
      where: { reporterId: me, createdAt: { gte: since }, ...(child ? { reason: "child_safety" } : { reason: { not: "child_safety" } }) },
    });
    if (used >= (child ? MAX_CHILD_SAFETY_PER_DAY : MAX_PER_DAY))
      throw new HttpError(429, "too_many", "وصلت للحد اليومي للبلاغات");

    let targetUserId: string | null = null, targetLabel = "", snippet = "", place = "";
    if (b.kind === "message") {
      const m = await db.message.findUnique({ where: { id: b.targetId }, include: { author: { select: { id: true, name: true } }, thread: { select: { type: true, name: true } } } });
      if (!m || m.deleted) throw notFound("الرسالة مش موجودة");
      if (!(await db.membership.findUnique({ where: { threadId_userId: { threadId: m.threadId, userId: me } } }))) throw notFound("الرسالة مش موجودة"); // مش بنكشف وجودها لغير الأعضاء
      targetUserId = m.authorId; targetLabel = m.author.name; snippet = m.text.slice(0, 500);
      place = m.thread.type === "group" ? `جروب: ${m.thread.name ?? ""}` : "محادثة خاصة";
    } else if (b.kind === "story") {
      const s = await db.story.findUnique({ where: { id: b.targetId }, include: { author: { select: { name: true } } } });
      if (!s || s.expiresAt < new Date()) throw notFound("الـ Story مش موجودة");
      targetUserId = s.authorId; targetLabel = s.author.name; snippet = s.caption.slice(0, 500); place = "Stories";
    } else if (b.kind === "room") {
      const rm = await db.room.findUnique({ where: { id: b.targetId }, include: { owner: { select: { name: true } } } });
      if (!rm || rm.closedAt) throw notFound("الغرفة مش موجودة");
      targetUserId = rm.ownerId; targetLabel = `غرفة: ${rm.name}`; place = "غرفة صوتية";
    } else if (b.kind === "user") {
      const u = await db.user.findUnique({ where: { id: b.targetId }, select: { id: true, name: true, status: true } });
      if (!u) throw notFound("المستخدم مش موجود");
      targetUserId = u.id; targetLabel = u.name; snippet = u.status.slice(0, 200); place = "ملف شخصي";
    } else {
      const t = await db.thread.findUnique({ where: { id: b.targetId }, select: { id: true, type: true, name: true, isPublic: true, createdById: true } });
      if (!t || t.type !== "group") throw notFound("الجروب مش موجود");
      const member = await db.membership.findUnique({ where: { threadId_userId: { threadId: t.id, userId: me } } });
      if (!member && !t.isPublic) throw notFound("الجروب مش موجود");
      targetUserId = t.createdById; targetLabel = `جروب: ${t.name ?? ""}`; place = "جروب";
    }
    if (targetUserId === me) throw bad("self_report", "مينفعش تبلّغ عن نفسك");

    // تكرار نفس البلاغ من نفس الشخص = نفس السجل (من غير ما نكشف إنه موجود)
    const rep = await db.report.upsert({
      where: { reporterId_kind_targetId: { reporterId: me, kind: b.kind, targetId: b.targetId } },
      create: { reporterId: me, kind: b.kind, targetId: b.targetId, targetUserId, targetLabel, reason: b.reason, note: b.note, snippet, place },
      update: {},
      select: { id: true },
    });
    res.status(201).json({ id: rep.id });
  }));
  return r;
}
