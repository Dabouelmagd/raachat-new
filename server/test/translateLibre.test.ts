import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

/**
 * LibreTranslate — المزوّد **المجاني** للترجمة (self-hosted على سيرفرنا).
 *
 * الفحوص الحاسمة هنا على **مين اللي اتندّه فعلًا** (`env.fetched`) مش على رمز
 * الرد بس:
 *   - المجاني متضبط → **ولا نداء واحد لجوجل** مهما كان مفتاحها متضبط، وإلا
 *     بنحاسب على حروف مجانية في سكوت.
 *   - السقوف اليومية سقف **فاتورة** للمزوّد المدفوع — تطبيقها على المجاني كان
 *     هيخنق الميزة (٣٠٠٠ حرف/يوم ≈ ٣٠ رسالة)، وشيلها من المدفوع بيفتح الفاتورة.
 *     فالاختبار بيجرّب **الاتجاهين** بنفس السقف الصغير.
 *   - حارس السن بيفضل شغّالًا مع المجاني برضه (قرار سياسة موحَّد — شوفي التعليق
 *     في `extras.ts`).
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => {
  env = await startTestEnv();
  env.ctx.config.LIBRETRANSLATE_URL = "http://libretranslate:5000";
}, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const ltCalls = (e: typeof env) => e.fetched.filter((u) => u.includes("libretranslate")).length;
const gCalls = (e: typeof env) => e.fetched.filter((u) => u.includes("translation.googleapis.com")).length;

describe("الترجمة عبر LibreTranslate (المزوّد المجاني)", () => {
  it("بيترجم من LibreTranslate — ومفيش **ولا نداء** لجوجل رغم إن مفتاحها متضبط", async () => {
    const a = await env.login("01065100001", "مستخدمة المجاني");
    const g0 = gCalls(env); const l0 = ltCalls(env);
    const r = await request(env.app).post("/translate").set(a.auth)
      .send({ text: "نص للمزوّد المجاني", to: "fr" }).expect(200);
    // الأقواس () هي بصمة بديل LibreTranslate في helpers — لو جوجل اللي ترجم كانت []
    expect(r.body.text).toBe("(fr) نص للمزوّد المجاني");
    expect(ltCalls(env) - l0).toBe(1);
    expect(gCalls(env) - g0, "المجاني متضبط — ولا حرف يروح للمدفوع").toBe(0);
  });

  it("أكواد اللغات بتتبسّط لحرفين: zh-CN بتوصل للمزوّد zh", async () => {
    const a = await env.login("01065100002", "صينية");
    const r = await request(env.app).post("/translate").set(a.auth)
      .send({ text: "نص لاختبار كود اللغة", to: "zh-CN" }).expect(200);
    expect(r.body.text).toBe("(zh) نص لاختبار كود اللغة");
  });

  it("الكاش شغّال: تاني نداء بنفس النص cached ومن غير نداء جديد", async () => {
    const a = await env.login("01065100003", "كاش");
    const text = "نص بيدخل كاش المجاني";
    await request(env.app).post("/translate").set(a.auth).send({ text, to: "fr" }).expect(200);
    const l0 = ltCalls(env);
    const again = await request(env.app).post("/translate").set(a.auth).send({ text, to: "fr" }).expect(200);
    expect(again.body.cached).toBe(true);
    expect(ltCalls(env) - l0).toBe(0);
  });

  it("السقوف اليومية **مش** بتتطبق على المجاني — ونفس السقف بيرفض 429 مع المدفوع", async () => {
    const a = await env.login("01065100004", "سقوف");
    const cap0 = env.ctx.config.TRANSLATE_USER_DAILY_CHARS;
    const lt0 = env.ctx.config.LIBRETRANSLATE_URL;
    try {
      env.ctx.config.TRANSLATE_USER_DAILY_CHARS = 5; // أصغر من أي رسالة
      // المجاني: النص أطول من السقف بكتير وبرضه 200
      await request(env.app).post("/translate").set(a.auth)
        .send({ text: "نص أطول بكتير من سقف الخمس حروف — مجاني فمفيش فاتورة نحرسها", to: "fr" }).expect(200);
      // نفس السقف بالظبط مع جوجل: 429 — الحارس على المدفوع لسه موجود ومتشالش بالغلط
      env.ctx.config.LIBRETRANSLATE_URL = "";
      const r = await request(env.app).post("/translate").set(a.auth)
        .send({ text: "نص تاني مختلف أطول من خمس حروف للمدفوع", to: "fr" }).expect(429);
      expect(r.body.code).toBe("translate_quota_user");
    } finally {
      env.ctx.config.TRANSLATE_USER_DAILY_CHARS = cap0;
      env.ctx.config.LIBRETRANSLATE_URL = lt0;
    }
  });

  it("حارس السن شغّال مع المجاني برضه: 501 ومفيش أي نداء خارج", async () => {
    const a = await env.login("01065100005", "غير محدَّدة السن");
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });
    const l0 = ltCalls(env); const g0 = gCalls(env);
    const r = await request(env.app).post("/translate").set(a.auth)
      .send({ text: "نص حساب غير محدَّد السن للمجاني", to: "fr" }).expect(501);
    expect(r.body.code).toBe("translate_age_restricted");
    expect(ltCalls(env) - l0).toBe(0);
    expect(gCalls(env) - g0).toBe(0);
  });

  it("الخدمة واقعة أو لسه بتقوم → 502 translate_failed واضحة مش 500", async () => {
    const a = await env.login("01065100006", "خدمة واقعة");
    const lt0 = env.ctx.config.LIBRETRANSLATE_URL;
    try {
      // عنوان مش معروف لبديل fetch في helpers → النداء بيرمي = نفس شكل الخدمة الواقعة
      env.ctx.config.LIBRETRANSLATE_URL = "http://down-service:9";
      const r = await request(env.app).post("/translate").set(a.auth)
        .send({ text: "نص والخدمة واقعة", to: "fr" }).expect(502);
      expect(r.body.code).toBe("translate_failed");
    } finally {
      env.ctx.config.LIBRETRANSLATE_URL = lt0;
    }
  });

  it("ولا مزوّد متضبط → 501 translate_not_configured", async () => {
    const a = await env.login("01065100007", "بلا مزوّد");
    const lt0 = env.ctx.config.LIBRETRANSLATE_URL;
    const k0 = env.ctx.config.GOOGLE_TRANSLATE_KEY;
    try {
      env.ctx.config.LIBRETRANSLATE_URL = "";
      env.ctx.config.GOOGLE_TRANSLATE_KEY = undefined;
      const r = await request(env.app).post("/translate").set(a.auth)
        .send({ text: "نص بلا أي مزوّد", to: "fr" }).expect(501);
      expect(r.body.code).toBe("translate_not_configured");
    } finally {
      env.ctx.config.LIBRETRANSLATE_URL = lt0;
      env.ctx.config.GOOGLE_TRANSLATE_KEY = k0;
    }
  });
});
