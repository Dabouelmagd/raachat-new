import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { wrap } from "../lib/errors.js";
import { todayCairo } from "../lib/adsInventory.js";

const Day = z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/);

/**
 * الإعلانات: الكتالوج لسه في الواجهة (مفيش خادم إعلانات). السيرفر بيسجّل الأحداث
 * (شُوهد/ضُغط/أُغلق) وبيقول أنهي مواعيد اتعرضت النهارده عشان الجدول يبقى موحّد بين أجهزة المستخدم.
 */
export function adRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));

  /** الإعلانات الشغالة النهارده (معتمدة وفي فترتها). التطبيق بيستخدمها بدل الكتالوج المحلي. */
  r.get("/ads/catalog", wrap(async (_req, res) => {
    const t = todayCairo();
    const rows = await ctx.db.adCampaign.findMany({ where: { status: "approved", startDate: { lte: t }, endDate: { gte: t } }, include: { bookings: { include: { placement: { select: { key: true, active: true } } } } }, orderBy: [{ priority: "desc" }, { startDate: "asc" }] });
    res.json(rows.map((c) => ({ id: c.id, advertiser: c.advertiser, headline: c.headline, body: c.body, cta: c.cta, link: c.link, grad: c.grad, priority: c.priority, dailyCap: c.dailyCap, placements: c.bookings.filter((b) => b.placement.active).map((b) => b.placement.key) })));
  }));

  r.get("/ads/today", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const day = Day.parse(req.query.day);
    const rows = await ctx.db.adEvent.findMany({ where: { userId: me, kind: "shown", adKey: { startsWith: `${day}|slot:` } }, select: { adKey: true } });
    res.json({ shown: rows.map((x) => Number(x.adKey.split("slot:")[1])).filter((n) => Number.isInteger(n)) });
  }));

  r.post("/ads/events", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({
      day: Day, slot: z.number().int().min(0).max(23).optional(), adId: z.string().max(40), kind: z.enum(["shown", "clicked", "closed"]),
      placement: z.enum(["modal", "banner", "services", "story"]).optional(),
    }).parse(req.body);
    const pl = b.placement ?? "modal";
    // مفتاح منع التكرار: نافذة الإعلان بالموعد، والبانر بالإعلان/الموضع/اليوم، والباقي بالإعلان/اليوم
    const key = b.kind === "shown" ? (b.slot !== undefined ? `${b.day}|slot:${b.slot}` : `${b.day}|shown:${pl}:${b.adId}`) : `${b.day}|${b.kind}:${b.adId}`;
    const dup = await ctx.db.adEvent.findFirst({ where: { userId: me, adKey: key, kind: b.kind } });
    if (!dup) {
      await ctx.db.adEvent.create({ data: { userId: me, adKey: key, kind: b.kind } });
      // نجمّع للحملة الحقيقية بس (id الإعلانات التجريبية مش في الجدول)
      if (await ctx.db.adCampaign.findUnique({ where: { id: b.adId }, select: { id: true } })) {
        await ctx.db.$executeRaw`INSERT INTO "AdStat" ("campaignId","day","placement","shown","clicked","closed") VALUES (${b.adId}, ${b.day}, ${pl}, ${b.kind === "shown" ? 1 : 0}, ${b.kind === "clicked" ? 1 : 0}, ${b.kind === "closed" ? 1 : 0})
          ON CONFLICT ("campaignId","day","placement") DO UPDATE SET "shown" = "AdStat"."shown" + EXCLUDED."shown", "clicked" = "AdStat"."clicked" + EXCLUDED."clicked", "closed" = "AdStat"."closed" + EXCLUDED."closed"`;
      }
    }
    res.status(204).end();
  }));
  return r;
}
