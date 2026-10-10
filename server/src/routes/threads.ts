import { Router } from "express";
import { assertNotBlocked } from "../lib/blocks.js";
import { assertClean } from "../lib/contentFilter.js";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { bad, forbidden, notFound, wrap } from "../lib/errors.js";
import { emitToUsers } from "../realtime.js";
import { loadThreadFor, threadView } from "../serialize.js";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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
    rows.sort((a, b) => (b.messages[0]?.createdAt ?? b.createdAt).getTime() - (a.messages[0]?.createdAt ?? a.createdAt).getTime());
    res.json(rows.map((t) => ({ ...threadView(t, me), lastActivity: (t.messages[0]?.createdAt ?? t.createdAt).toISOString() })));
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
    ]).parse(req.body);

    if (b.type === "group") assertClean(ctx, b.name);
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
    if (!t0 || t0.type !== "group") throw notFound();
    if (m.role === "member") throw forbidden("للمشرفين فقط");
    const b = z.object({
      name: z.string().trim().min(1).max(80).optional(),
      color: Color.nullable().optional(),
      icon: z.string().max(30).nullable().optional(),
      photoUrl: z.string().max(500).nullable().optional(),
    }).parse(req.body);
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
    const found = await ctx.db.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
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
    await ctx.db.membership.upsert({ where: { threadId_userId: { threadId: id, userId: me } }, update: {}, create: { threadId: id, userId: me } });
    const t = (await loadThreadFor(ctx.db, id))!;
    res.json(threadView(t, me));
  }));

  r.delete("/threads/:id/members/me", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    await assertMember(ctx, id, me);
    await ctx.db.membership.delete({ where: { threadId_userId: { threadId: id, userId: me } } });
    res.status(204).end();
  }));

  r.post("/threads/:id/read", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const id = String(req.params.id);
    await assertMember(ctx, id, me);
    await ctx.db.membership.update({ where: { threadId_userId: { threadId: id, userId: me } }, data: { lastReadAt: new Date() } });
    res.status(204).end();
  }));

  return r;
}
