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

  /**
   * توكن الإشعارات الأصلي للتطبيق المثبَّت (FCM). منفصل عن `/push/subscribe`
   * لأن ده مش Web Push: مفيش `endpoint` ولا مفاتيح تشفير، والتوكن نفسه هو
   * العنوان. والاتنين بيعيشوا مع بعض — نفس المستخدم على متصفح وعلى APK.
   */
  r.post("/push/device", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({
      token: z.string().min(16).max(500),
      platform: z.enum(["android", "ios"]),
    }).parse(req.body);
    // نفس الجهاز لو دخل بحساب تاني: التوكن **ينتقل** للحساب الحالي. لو سبناه
    // على القديم، إشعارات صاحب الحساب الأول تروح لجهاز حد تاني — تسريب
    // محتوى رسائل في الإشعار نفسه.
    await ctx.db.deviceToken.upsert({
      where: { token: b.token },
      create: { userId: me, token: b.token, platform: b.platform },
      update: { userId: me, platform: b.platform },
    });
    const all = await ctx.db.deviceToken.findMany({ where: { userId: me }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (all.length > MAX_DEVICES) await ctx.db.deviceToken.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES).map((x) => x.id) } } });
    res.status(204).end();
  }));

  r.post("/push/device/remove", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ token: z.string().max(500) }).parse(req.body);
    await ctx.db.deviceToken.deleteMany({ where: { token: b.token, userId: me } });
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
