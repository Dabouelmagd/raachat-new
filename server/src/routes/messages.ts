import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { bad, forbidden, notFound, wrap } from "../lib/errors.js";
import { assertClean } from "../lib/contentFilter.js";
import { assertNotBlocked, blockedByMe, blockersOf } from "../lib/blocks.js";
import { emitToUsers } from "../realtime.js";
import { notifyPush, offlineOf } from "../lib/push.js";
import { messageInclude, messageView } from "../serialize.js";
import { assertMember } from "./threads.js";

const AttachmentIn = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(0).max(25 * 1024 * 1024),
  mime: z.string().max(100),
  // لازم يكون ملف مرفوع عندنا (/uploads/…) أو https
  url: z.string().max(500).refine((u) => u.startsWith("/uploads/") || /^https:\/\//.test(u), "رابط غير مسموح"),
  text: z.string().max(6000).optional(),
  voice: z.object({ duration: z.number().int().min(0).max(3600), waveform: z.array(z.number()).max(200) }).optional(),
});

async function memberIds(ctx: Ctx, threadId: string) {
  return (await ctx.db.membership.findMany({ where: { threadId }, select: { userId: true, lastReadAt: true } }));
}

/** إشعار Push للأعضاء الأوفلاين بس. المحتوى مقصوص، ومفيش إشعار لو مفيش اشتراكات. */
async function pushNewMessage(ctx: Ctx, threadId: string, authorId: string, members: string[], attachLabel: string, text: string) {
  try {
    const targets = await offlineOf(ctx, members.filter((m) => m !== authorId));
    if (targets.length === 0) return;
    const [author, th] = await Promise.all([
      ctx.db.user.findUnique({ where: { id: authorId }, select: { name: true } }),
      ctx.db.thread.findUnique({ where: { id: threadId }, select: { type: true, name: true } }),
    ]);
    const who = author?.name ?? "رع شات";
    const body = (text || attachLabel).slice(0, 120);
    const title = th?.type === "dm" || !th?.name ? who : th.name;
    await notifyPush(ctx, targets, { kind: "message", title, body: th?.type === "dm" || !th?.name ? body : `${who}: ${body}`, tag: `msg-${threadId}`, threadId });
  } catch (e) { console.error("push message failed", e); }
}

export function messageRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));

  r.get("/threads/:id/messages", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const threadId = String(req.params.id);
    await assertMember(ctx, threadId, me);
    const q = z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    let cursor: Date | undefined;
    if (q.before) {
      const b = await ctx.db.message.findFirst({ where: { id: q.before, threadId }, select: { createdAt: true } });
      if (!b) throw bad("bad_cursor", "before غير صحيح");
      cursor = b.createdAt;
    }
    const hidden = await blockedByMe(ctx, me);
    const rows = await ctx.db.message.findMany({
      where: { threadId, ...(hidden.length ? { authorId: { notIn: hidden } } : {}), ...(cursor ? { createdAt: { lt: cursor } } : {}) },
      include: messageInclude, orderBy: { createdAt: "desc" }, take: q.limit,
    });
    const members = (await memberIds(ctx, threadId)).filter((m) => m.userId !== me);
    const readBy = (at: Date) => members.length > 0 && members.every((m) => m.lastReadAt && m.lastReadAt >= at);
    res.json(rows.reverse().map((m) => messageView(m, m.authorId === me && readBy(m.createdAt))));
  }));

  r.post("/threads/:id/messages", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const threadId = String(req.params.id);
    await assertMember(ctx, threadId, me);
    const th = await ctx.db.thread.findUnique({ where: { id: threadId }, select: { restrictedAt: true, type: true, _count: { select: { members: true } } } });
    if (th?.type === "dm" && th._count.members < 2) throw forbidden("الحساب ده اتحذف ومينفعش تبعتله");
    if (th?.restrictedAt) throw forbidden("الجروب ده متقيّد من إدارة التطبيق ومينفعش تبعت فيه");
    const b = z.object({
      text: z.string().max(5000).default(""),
      replyToId: z.string().optional(),
      attachment: AttachmentIn.optional(),
    }).parse(req.body);
    if (!b.text.trim() && !b.attachment) throw bad("empty", "الرسالة فاضية");
    assertClean(ctx, b.text, b.attachment?.name);
    if (th?.type === "dm") {
      const other = (await memberIds(ctx, threadId)).find((m) => m.userId !== me);
      if (other) await assertNotBlocked(ctx, me, other.userId);
    }
    if (b.replyToId) {
      const rep = await ctx.db.message.findFirst({ where: { id: b.replyToId, threadId } });
      if (!rep) throw bad("bad_reply", "الرسالة اللي بترد عليها مش موجودة");
    }
    const created = await ctx.db.message.create({
      data: {
        threadId, authorId: me, text: b.text.trim(), replyToId: b.replyToId,
        attachment: b.attachment
          ? { create: { name: b.attachment.name, size: b.attachment.size, mime: b.attachment.mime, url: b.attachment.url, text: b.attachment.text, voiceDuration: b.attachment.voice?.duration, voiceWave: b.attachment.voice?.waveform } }
          : undefined,
      },
      include: messageInclude,
    });
    const view = messageView(created);
    const blockers = new Set(await blockersOf(ctx, me)); // اللي حاظريني ما يوصلهمش
    const members = (await memberIds(ctx, threadId)).map((m) => m.userId).filter((id) => id === me || !blockers.has(id));
    emitToUsers(ctx, members, "message:new", view);
    res.status(201).json(view);
    if (ctx.push) void pushNewMessage(ctx, threadId, me, members, created.attachment ? (created.attachment.voiceDuration != null ? "🎤" : "📎 " + created.attachment.name) : "", b.text.trim());
  }));

  async function ownMessage(id: string, me: string) {
    const m = await ctx.db.message.findUnique({ where: { id }, include: messageInclude });
    if (!m) throw notFound();
    await assertMember(ctx, m.threadId, me);
    return m;
  }

  r.patch("/messages/:id", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const m = await ownMessage(String(req.params.id), me);
    if (m.authorId !== me) throw forbidden("تقدر تعدّل رسائلك بس");
    if (m.deleted) throw bad("deleted", "الرسالة محذوفة");
    const b = z.object({ text: z.string().trim().min(1).max(5000) }).parse(req.body);
    const u = await ctx.db.message.update({ where: { id: m.id }, data: { text: b.text, edited: true }, include: messageInclude });
    const view = messageView(u);
    emitToUsers(ctx, (await memberIds(ctx, m.threadId)).map((x) => x.userId), "message:updated", view);
    res.json(view);
  }));

  r.delete("/messages/:id", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const m = await ownMessage(String(req.params.id), me);
    if (m.authorId !== me) throw forbidden("تقدر تحذف رسائلك بس");
    const u = await ctx.db.message.update({ where: { id: m.id }, data: { deleted: true, text: "" }, include: messageInclude });
    await ctx.db.attachment.deleteMany({ where: { messageId: m.id } });
    emitToUsers(ctx, (await memberIds(ctx, m.threadId)).map((x) => x.userId), "message:deleted", messageView({ ...u, attachment: null }));
    res.status(204).end();
  }));

  // تبديل تفاعل
  r.put("/messages/:id/reactions/:emoji", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const m = await ownMessage(String(req.params.id), me);
    const emoji = decodeURIComponent(String(req.params.emoji));
    if (!emoji || emoji.length > 16) throw bad("bad_emoji");
    const key = { messageId_userId_emoji: { messageId: m.id, userId: me, emoji } };
    const ex = await ctx.db.reaction.findUnique({ where: key });
    if (ex) await ctx.db.reaction.delete({ where: key });
    else await ctx.db.reaction.create({ data: { messageId: m.id, userId: me, emoji } });
    const u = await ctx.db.message.findUniqueOrThrow({ where: { id: m.id }, include: messageInclude });
    const view = messageView(u);
    emitToUsers(ctx, (await memberIds(ctx, m.threadId)).map((x) => x.userId), "message:updated", view);
    res.json(view);
  }));

  return r;
}
