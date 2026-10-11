import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { wrap } from "../lib/errors.js";
import { todayCairo } from "../lib/adsInventory.js";
import { isAdult } from "../lib/age.js";

const Day = z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/);

/**
 * أقصى عمر لسجل إعلانات المستخدم الأقل من ١٨ سنة (بالأيام).
 * تحديد التكرار محتاج يوم واحد، فخلّيناها يومين تحوّطًا لفروق التوقيت، وأي أقدم بيتمسح.
 */
const MINOR_AD_DAYS = 2;

/**
 * الإعلانات: الكتالوج لسه في الواجهة (مفيش خادم إعلانات). السيرفر بيسجّل الأحداث
 * (شُوهد/ضُغط/أُغلق) وبيقول أنهي مواعيد اتعرضت النهارده عشان الجدول يبقى موحّد بين أجهزة المستخدم.
 *
 * **الأقل من ١٨ سنة (المادة ١٤/٥ من اللائحة التنفيذية ٨١٦/٢٠٢٥ — حظر المراقبة السلوكية للأطفال،
 * والبند ١٠ من سياسة الخصوصية المنشورة):**
 * - الكتالوج **مابياخدش أي بيانات عن المستخدم** ولا بيتغيّر من مستخدم لمستخدم — مفيش استهداف لحد
 *   أصلًا، والاختبار بيثبّت ده عشان أي تعديل جاي يضيف استهداف يفشل.
 * - النقر والإغلاق **مابيتخزنوش مربوطين بهوية** الأقل من ١٨؛ بيتعدّوا في الإحصاء المجمّع للحملة بس.
 * - الظهور بيتخزن لأنه لازم لتحديد التكرار (في مصلحة المستخدم)، وبيتمسح بعد يومين.
 */
export function adRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));

  const minorCutoff = () => new Date(Date.now() - MINOR_AD_DAYS * 86400_000);
  /** المعرّفات المستعارة بتتمسح بالعمر (مش بالمستخدم، لأنها مش مربوطة بحد) */
  const cleanupOldAnon = () =>
    ctx.db.adEvent.deleteMany({ where: { userId: { startsWith: "anon:" }, createdAt: { lt: minorCutoff() } } });

  /**
   * الإعلانات الشغالة النهارده (معتمدة وفي فترتها). التطبيق بيستخدمها بدل الكتالوج المحلي.
   * **ممنوع** يدخل في الاستعلام ده أي حاجة من بيانات المستخدم (سن، سلوك، جهات اتصال، سجل إعلانات):
   * النتيجة واحدة لكل المستخدمين. حقل `audience` في الحملة نص للمعلن بس ومابيستخدمش في الاختيار.
   */
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

    /** الإحصاء المجمّع للحملة (مفيش هوية مستخدم فيه) — للحملة الحقيقية بس، الإعلانات التجريبية مش في الجدول */
    const bumpStat = async () => {
      if (!(await ctx.db.adCampaign.findUnique({ where: { id: b.adId }, select: { id: true } }))) return;
      await ctx.db.$executeRaw`INSERT INTO "AdStat" ("campaignId","day","placement","shown","clicked","closed") VALUES (${b.adId}, ${b.day}, ${pl}, ${b.kind === "shown" ? 1 : 0}, ${b.kind === "clicked" ? 1 : 0}, ${b.kind === "closed" ? 1 : 0})
        ON CONFLICT ("campaignId","day","placement") DO UPDATE SET "shown" = "AdStat"."shown" + EXCLUDED."shown", "clicked" = "AdStat"."clicked" + EXCLUDED."clicked", "closed" = "AdStat"."closed" + EXCLUDED."closed"`;
    };

    const u = await ctx.db.user.findUnique({ where: { id: me }, select: { birthDate: true } });
    const minor = !isAdult(u?.birthDate); // تاريخ ميلاد غير محدد = نتعامل معاه كأقل من ١٨ (الأحوط)

    /**
     * نقر/إغلاق الأقل من ١٨: مابنخزّنش هويته، لكن محتاجين نمنع العدّ المكرر عشان أرقام
     * المعلن تفضل صح. فبنخزّن **مُعرَّف مستعار ليوم واحد** (HMAC بسر السيرفر): مابيرجعش
     * للمستخدم، ومابيربطش يومين بنفس الشخص، وبيتمسح بعد يومين.
     */
    if (minor && b.kind !== "shown") {
      const anon = "anon:" + crypto.createHmac("sha256", ctx.config.JWT_SECRET).update(`${me}|${b.day}`).digest("base64url").slice(0, 24);
      const key = `${b.day}|${b.kind}:${b.adId}`;
      if (!(await ctx.db.adEvent.findFirst({ where: { userId: anon, adKey: key, kind: b.kind } }))) {
        await ctx.db.adEvent.create({ data: { userId: anon, adKey: key, kind: b.kind } });
        await bumpStat();
      }
      await cleanupOldAnon();
      res.status(204).end();
      return;
    }

    // مفتاح منع التكرار: نافذة الإعلان بالموعد، والبانر بالإعلان/الموضع/اليوم، والباقي بالإعلان/اليوم
    const key = b.kind === "shown" ? (b.slot !== undefined ? `${b.day}|slot:${b.slot}` : `${b.day}|shown:${pl}:${b.adId}`) : `${b.day}|${b.kind}:${b.adId}`;
    const dup = await ctx.db.adEvent.findFirst({ where: { userId: me, adKey: key, kind: b.kind } });
    if (!dup) {
      await ctx.db.adEvent.create({ data: { userId: me, adKey: key, kind: b.kind } });
      await bumpStat();
    }
    // سجل الأقل من ١٨ لتحديد التكرار بس، فما بيتراكمش
    if (minor) {
      await ctx.db.adEvent.deleteMany({ where: { userId: me, createdAt: { lt: minorCutoff() } } });
    }
    res.status(204).end();
  }));
  return r;
}
