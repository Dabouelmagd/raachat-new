import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { wrap } from "../lib/errors.js";

const MAX_DEVICES = 10;

export function pushRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));

  r.get("/push/key", (_req, res) => res.json({ publicKey: ctx.push?.publicKey ?? null }));

  r.post("/push/subscribe", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }).parse(req.body);
    // نفس الجهاز لو دخل بحساب تاني: الاشتراك ينتقل للحساب الحالي
    await ctx.db.pushSub.upsert({
      where: { endpoint: b.endpoint },
      create: { userId: me, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth },
      update: { userId: me, p256dh: b.keys.p256dh, auth: b.keys.auth },
    });
    const all = await ctx.db.pushSub.findMany({ where: { userId: me }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (all.length > MAX_DEVICES) await ctx.db.pushSub.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES).map((x) => x.id) } } });
    res.status(204).end();
  }));

  r.post("/push/unsubscribe", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
    await ctx.db.pushSub.deleteMany({ where: { endpoint: b.endpoint, userId: me } });
    res.status(204).end();
  }));
  return r;
}
