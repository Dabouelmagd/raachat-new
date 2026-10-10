import { Router } from "express";
import { blockedByMe } from "../lib/blocks.js";
import { assertClean } from "../lib/contentFilter.js";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { HttpError, notFound, wrap } from "../lib/errors.js";
import { assertMember } from "./threads.js";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export function extraRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));

  // ---- القصص (24 ساعة) — بتظهر لأي شخص بيشاركك محادثة
  r.get("/stories", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const peers = await ctx.db.membership.findMany({
      where: { thread: { members: { some: { userId: me } } } }, select: { userId: true }, distinct: ["userId"],
    });
    const hidden = new Set(await blockedByMe(ctx, me));
    const rows = await ctx.db.story.findMany({
      where: { expiresAt: { gt: new Date() }, authorId: { in: [me, ...peers.map((p) => p.userId)].filter((id) => !hidden.has(id)) } },
      include: { author: true, seenBy: { where: { userId: me } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows.map((s) => ({
      id: s.id, authorId: s.authorId, authorName: s.author.name, caption: s.caption, colorFrom: s.colorFrom, colorTo: s.colorTo,
      image: s.imageUrl ?? undefined, seen: s.authorId === me || s.seenBy.length > 0, time: s.createdAt.toISOString(),
    })));
  }));
  r.post("/stories", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({
      caption: z.string().max(300).default(""), colorFrom: Color, colorTo: Color,
      imageUrl: z.string().max(500).refine((u) => u.startsWith("/uploads/") || /^https:\/\//.test(u)).optional(),
    }).refine((v) => v.caption.trim() || v.imageUrl, "اكتب نص أو أضف صورة").parse(req.body);
    assertClean(ctx, b.caption);
    const s = await ctx.db.story.create({ data: { ...b, authorId: me, expiresAt: new Date(Date.now() + 24 * 3600_000) }, include: { author: true } });
    res.status(201).json({ id: s.id, authorId: me, authorName: s.author.name, caption: s.caption, colorFrom: s.colorFrom, colorTo: s.colorTo, image: s.imageUrl ?? undefined, seen: true, time: s.createdAt.toISOString() });
  }));
  r.post("/stories/:id/seen", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const s = await ctx.db.story.findUnique({ where: { id: String(req.params.id) } });
    if (!s) throw notFound();
    await ctx.db.storySeen.upsert({ where: { storyId_userId: { storyId: s.id, userId: me } }, update: {}, create: { storyId: s.id, userId: me } });
    res.status(204).end();
  }));

  // ---- سجل المكالمات
  r.get("/calls", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const rows = await ctx.db.callLog.findMany({ where: { userId: me }, orderBy: { at: "desc" }, take: 100 });
    res.json(rows.map((c) => ({ id: c.id, threadId: c.threadId, mode: c.mode, dir: c.dir, at: c.at.getTime(), dur: c.dur })));
  }));
  r.post("/calls", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({
      threadId: z.string(), mode: z.enum(["voice", "video"]), dir: z.enum(["in", "out", "missed"]),
      at: z.number().int().positive(), dur: z.number().int().min(0).max(24 * 3600),
    }).parse(req.body);
    await assertMember(ctx, b.threadId, me);
    const c = await ctx.db.callLog.create({ data: { userId: me, threadId: b.threadId, mode: b.mode, dir: b.dir, at: new Date(b.at), dur: b.dur } });
    res.status(201).json({ id: c.id, threadId: c.threadId, mode: c.mode, dir: c.dir, at: c.at.getTime(), dur: c.dur });
  }));

  // ---- الترجمة (Google Cloud Translation v2). بدون GOOGLE_TRANSLATE_KEY بيرجّع 501.
  r.post("/translate", wrap(async (req, res) => {
    const b = z.object({ text: z.string().min(1).max(5000), to: z.string().min(2).max(10), from: z.string().min(2).max(10).optional() }).parse(req.body);
    const key = ctx.config.GOOGLE_TRANSLATE_KEY;
    if (!key) throw new HttpError(501, "translate_not_configured", "محرك الترجمة غير مُفعّل (GOOGLE_TRANSLATE_KEY)");
    const r2 = await ctx.fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: b.text, target: b.to, source: b.from, format: "text" }),
    });
    if (!r2.ok) throw new HttpError(502, "translate_failed", "فشلت الترجمة");
    const j = (await r2.json()) as { data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] } };
    const t = j.data?.translations?.[0];
    if (!t) throw new HttpError(502, "translate_failed", "رد غير متوقع");
    res.json({ text: t.translatedText, from: b.from ?? t.detectedSourceLanguage ?? "" });
  }));
  return r;
}
