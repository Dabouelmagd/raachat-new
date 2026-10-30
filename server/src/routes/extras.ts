import { Router } from "express";
import { blockedByMe } from "../lib/blocks.js";
import { assertClean } from "../lib/contentFilter.js";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { isAdult } from "../lib/age.js";
import { todayCairo } from "../lib/cairo.js";
import type { Ctx } from "../context.js";
import { HttpError, notFound, wrap } from "../lib/errors.js";
import { assertMember } from "./threads.js";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * عدّاد حروف الترجمة في اليوم (بتوقيت القاهرة): الكل ولكل مستخدم.
 * **للمزوّد المدفوع (جوجل) بس** — LibreTranslate المجاني مش بيعدّي عليه.
 * في الذاكرة عن قصد — مفيش migration ومفيش حمل على القاعدة، والـ api كونتينر
 * واحد فالعدّاد عملـيًا عام. إعادة التشغيل بتصفّره، وده مقبول لأن السقف يومي
 * والمستخدم مش بيقدر يجبر إعادة تشغيل.
 * **الكاش مابيستهلكش من السقف** — النص المتكرر مش بيروح للمزوّد أصلًا.
 */
const chars = { day: "", total: 0, per: new Map<string, number>() };

/**
 * الحسابات اللي سنّها اتأكّد (في الذاكرة) — عشان مانعملش قراءة للقاعدة مع كل
 * نداء ترجمة. بيتصفّر كل يوم قاهرة، **وبنكاشّ النجاح بس**: الرفض بيتأكّد من
 * القاعدة في كل نداء، فالحساب اللي بيتحدّد تاريخ ميلاده (أو بيكمّل ١٨) بياخد
 * الترجمة فورًا مش بعد يوم.
 */
const adults = { day: "", ids: new Set<string>() };

/** كاش الترجمة: سقف للفاتورة مش تحسين سرعة (المزوّد بيحاسب بالحرف) */
const TR_MAX = 2000;
const TR_TTL = 7 * 86_400_000;
const trCache = new Map<string, { text: string; from: string; at: number }>();

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

  /**
   * الترجمة — مزوّدان، والمجاني له الأولوية:
   *   ١) **LibreTranslate** (`LIBRETRANSLATE_URL`) — self-hosted على سيرفرنا:
   *      مجاني مهما كان الحجم، والنص **مابيخرجش من السيرفر خالص**.
   *   ٢) **Google Cloud Translation v2** (`GOOGLE_TRANSLATE_KEY`) — مدفوع بالحرف،
   *      بيشتغل بس لو LibreTranslate مش متضبط.
   * ولا واحد متضبط → 501 والواجهة بترجع للقاموس المحلي لوحدها.
   *
   * **المزوّد المدفوع بيحاسب بالحرف**، والشات بطبيعته فيه تكرار رهيب («تمام»،
   * «ماشي»، «شكرًا»، نفس الرسالة بتتترجم لكل واحد في الجروب، والواجهة بتعيد
   * النداء مع كل إعادة رسم). فالكاش هنا مع جوجل **سقف للفاتورة** مش تحسين سرعة
   * — ومع LibreTranslate بيوفّر وقت معالجة على سيرفر مشترك: نفس النص لنفس
   * اللغة بيتحسب مرة واحدة كل أسبوع لكل المستخدمين.
   */
  r.post("/translate", wrap(async (req, res) => {
    const b = z.object({ text: z.string().min(1).max(5000), to: z.string().min(2).max(10), from: z.string().min(2).max(10).optional() }).parse(req.body);
    const lt = (ctx.config.LIBRETRANSLATE_URL ?? "").replace(/\/+$/, "");
    const key = ctx.config.GOOGLE_TRANSLATE_KEY;
    if (!lt && !key) throw new HttpError(501, "translate_not_configured", "محرك الترجمة غير مُفعّل (LIBRETRANSLATE_URL أو GOOGLE_TRANSLATE_KEY)");

    /**
     * ⚠️ حارس السن **قبل الكاش وقبل أي نداء للمزوّد**: مع جوجل نصّ الرسالة نفسه
     * بيطلع لطرف تالت، وبيانات الأطفال «بيانات حساسة» في القانون ١٥١/٢٠٢٠.
     * فالحسابات **غير محدَّدة السن** (المنشأة قبل ١٣ أكتوبر ٢٠٢٦) بتفضل على
     * القاموس المحلي — زي ما `ads.ts` بيعاملها بـ `!isAdult(birthDate)`.
     *
     * ومع LibreTranslate النص **مابيخرجش من السيرفر**، فالسند القانوني للحارس
     * مش قايم هناك — وبرضه سايبينه على المزوّدين: أثره العملي **صفر** (كل حسابات
     * الإنتاج سنّها محدَّد من ١٨ أكتوبر، والفرع فشل مقفول على مجموعة فاضية)،
     * وتخفيفه قرار سياسة/قانوني مش تقني. شيله هنا كان هيعمل مسارين بسلوكين
     * مختلفين حسب مفتاح إعداد — والسلوك الأضيق الموحَّد أأمن وأوضح.
     *
     * و**501 مقصود مش 403**: الواجهة بتفهم 501 على إنه «الترجمة المدفوعة مش
     * مفعّلة» فبتبطّل تنادي وترجع للقاموس لوحدها — يعني **مفيش تغيير ولا نشر
     * واجهة**، نفس نمط `ready()` + `/auth/channels` في الـ SMS.
     *
     * وقبل الكاش عن قصد: ضربة الكاش مش بتبعت حاجة لجوجل فعلًا، بس لو سمحناها
     * الواجهة تاخد ٢٠٠ مرة و501 مرة — رسالتين متضاربتين، وبتبطّل تنادي عند أول
     * ضربة فاشلة أصلًا. فالرفض من أول نداء أوضح وأصدق.
     */
    const me = (req as AuthedRequest).userId;
    const day = todayCairo();
    if (adults.day !== day) { adults.day = day; adults.ids.clear(); }
    if (!adults.ids.has(me)) {
      const u = await ctx.db.user.findUnique({ where: { id: me }, select: { birthDate: true } });
      if (!isAdult(u?.birthDate ?? null)) {
        throw new HttpError(501, "translate_age_restricted", "الترجمة عبر المزوّد متاحة للحسابات المحدَّدة السن (١٨+) — الترجمة المحلية شغّالة");
      }
      adults.ids.add(me);
    }

    const ck = `${b.to}|${b.from ?? ""}|${b.text}`;
    const hit = trCache.get(ck);
    if (hit && hit.at > Date.now() - TR_TTL) {
      trCache.delete(ck); trCache.set(ck, hit); // آخر استخدام = آخر الطابور
      res.json({ text: hit.text, from: hit.from, cached: true });
      return;
    }
    let out: { text: string; from: string };
    if (lt) {
      /**
       * LibreTranslate: **بلا سقوف يومية عن قصد** — السقوف تحت سقف فاتورة
       * للمزوّد المدفوع مش حماية أداء، وتطبيقها هنا كان هيخنق ميزة مجانية
       * (٣٠٠٠ حرف/يوم ≈ ٣٠ رسالة وبس). الحماية الفعلية للسيرفر المشترك هي
       * `mem_limit` على الخدمة في compose + الكاش اللي فوق.
       *
       * وأكواد اللغات عنده **حرفان** («zh» مش «zh-CN») — فبنبسّط قبل النداء.
       * و`source: "auto"` بيرجّع `detectedLanguage` في الرد.
       */
      const r2 = await ctx.fetch(`${lt}/translate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: b.text, source: b.from?.slice(0, 2).toLowerCase() ?? "auto", target: b.to.slice(0, 2).toLowerCase(), format: "text" }),
        // الخدمة لسه بتقوم (أول تشغيل بينزّل الموديلات) أو واقعة → 502 واضحة مش 500
      }).catch(() => null);
      if (!r2 || !r2.ok) throw new HttpError(502, "translate_failed", "فشلت الترجمة");
      const j = (await r2.json()) as { translatedText?: string; detectedLanguage?: { language?: string } };
      if (!j.translatedText) throw new HttpError(502, "translate_failed", "رد غير متوقع");
      out = { text: j.translatedText, from: b.from ?? j.detectedLanguage?.language ?? "" };
    } else {
      // السقوف: **للمزوّد المدفوع بس**، وبتتحسب على النص اللي هيروح له فعلًا (بعد الكاش)
      if (chars.day !== day) { chars.day = day; chars.total = 0; chars.per.clear(); }
      const n = b.text.length;
      const cap = ctx.config.TRANSLATE_DAILY_CHARS;
      const ucap = ctx.config.TRANSLATE_USER_DAILY_CHARS;
      const mine = chars.per.get(me) ?? 0;
      if (ucap > 0 && mine + n > ucap) {
        throw new HttpError(429, "translate_quota_user", "خلص حدّك اليومي من الترجمة — جرّبي بكرة");
      }
      if (cap > 0 && chars.total + n > cap) {
        console.warn(`⚠️ سقف الترجمة اليومي خلص (${cap} حرف) — الترجمة متوقفة لباقي اليوم`);
        throw new HttpError(429, "translate_quota", "سقف الترجمة اليومي خلص — الترجمة هترجع بكرة");
      }
      const r2 = await ctx.fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key!)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: b.text, target: b.to, source: b.from, format: "text" }),
      });
      if (!r2.ok) throw new HttpError(502, "translate_failed", "فشلت الترجمة");
      const j = (await r2.json()) as { data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] } };
      const t = j.data?.translations?.[0];
      if (!t) throw new HttpError(502, "translate_failed", "رد غير متوقع");
      chars.total += n; chars.per.set(me, mine + n);
      out = { text: t.translatedText, from: b.from ?? t.detectedSourceLanguage ?? "" };
    }
    trCache.set(ck, { ...out, at: Date.now() });
    // Map بيحفظ ترتيب الإدخال، فأول مفتاح = الأقدم استخدامًا
    while (trCache.size > TR_MAX) trCache.delete(trCache.keys().next().value as string);
    res.json(out);
  }));
  return r;
}
