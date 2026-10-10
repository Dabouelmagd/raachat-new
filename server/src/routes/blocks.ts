import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { bad, notFound, wrap } from "../lib/errors.js";
import { publicUser } from "../serialize.js";

/** حظر/إلغاء حظر مستخدم. الحظر بيمنع الرسائل الخاصة في الاتجاهين ويخفي رسائله وستوريزه عندي. */
export function blockRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));
  r.get("/blocks", wrap(async (req, res) => {
    const rows = await ctx.db.block.findMany({ where: { blockerId: (req as AuthedRequest).userId }, include: { blocked: true }, orderBy: { createdAt: "desc" } });
    res.json(rows.map((x) => ({ ...publicUser(x.blocked), blockedAt: x.createdAt.toISOString() })));
  }));
  r.post("/blocks", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const { userId } = z.object({ userId: z.string().min(1).max(60) }).parse(req.body);
    if (userId === me) throw bad("self_block", "مينفعش تحظر نفسك");
    const u = await ctx.db.user.findUnique({ where: { id: userId }, select: { id: true, modStatus: true } });
    if (!u || u.modStatus === "deleted") throw notFound("المستخدم مش موجود");
    await ctx.db.block.upsert({ where: { blockerId_blockedId: { blockerId: me, blockedId: userId } }, create: { blockerId: me, blockedId: userId }, update: {} });
    res.status(204).end();
  }));
  r.delete("/blocks/:userId", wrap(async (req, res) => {
    await ctx.db.block.deleteMany({ where: { blockerId: (req as AuthedRequest).userId, blockedId: String(req.params.userId) } });
    res.status(204).end();
  }));
  return r;
}
