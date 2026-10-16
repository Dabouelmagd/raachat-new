import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

/**
 * الترجمة عبر المزوّد بتبعت **نصّ الرسالة نفسه** لجوجل (طرف تالت). وبيانات
 * الأطفال «بيانات حساسة» في القانون المصري ١٥١/٢٠٢٠، فالحسابات اللي سنّها
 * **مش محدَّد** مابيتبعتش نصّها — بتفضل على القاموس المحلي في الواجهة.
 *
 * الفحص الحاسم هنا مش على رمز الرد، هو على **إن نداء جوجل ماحصلش خالص**
 * (`env.fetched`) — ده الضمان الحقيقي إن النص ما خرجش.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const calls = (e: typeof env) => e.fetched.filter((u) => u.includes("translation.googleapis.com")).length;

describe("حارس السن على الترجمة", () => {
  it("حساب غير محدَّد السن: 501 و**مفيش** نداء للمزوّد", async () => {
    const a = await env.login("01064100001", "قديم");
    // حالة الحسابات القديمة في الإنتاج فعلًا: العمود فاضي (التسجيل الجديد ١٨+)
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });

    const before = calls(env);
    const r = await request(env.app).post("/translate").set(a.auth)
      .send({ text: "نص لحساب غير محدَّد السن", to: "fr" }).expect(501);
    expect(r.body.code).toBe("translate_age_restricted");
    expect(calls(env) - before, "نصّ حساب غير محدَّد السن ماينفعش يروح لجوجل").toBe(0);
  });

  it("الرفض بيحصل **قبل الكاش**: نص مترجَم قبل كده مابيرجعش له", async () => {
    const adult = await env.login("01064100002", "بالغة");
    const text = "نص بيدخل الكاش من حساب بالغ";
    await request(env.app).post("/translate").set(adult.auth).send({ text, to: "fr" }).expect(200);
    // تأكيد إن النص فعلًا في الكاش (وإلا الاختبار بيعدّي بلا معنى)
    const again = await request(env.app).post("/translate").set(adult.auth).send({ text, to: "fr" }).expect(200);
    expect(again.body.cached, "النص المفروض بقى في الكاش").toBe(true);

    const young = await env.login("01064100003", "غير محدَّد");
    await env.ctx.db.user.update({ where: { id: young.user.id }, data: { birthDate: null } });
    const r = await request(env.app).post("/translate").set(young.auth).send({ text, to: "fr" }).expect(501);
    expect(r.body.code).toBe("translate_age_restricted");
  });

  it("حساب بالغ: الترجمة شغّالة زي ما هي", async () => {
    const a = await env.login("01064100004", "بالغ");
    const before = calls(env);
    const r = await request(env.app).post("/translate").set(a.auth)
      .send({ text: "نص لحساب بالغ مش مكرر", to: "zh-CN" }).expect(200);
    expect(r.body.text).toBe("[zh-CN] نص لحساب بالغ مش مكرر");
    expect(calls(env) - before).toBe(1);
  });

  /**
   * الكاش بيكاشّ **النجاح بس**: الحساب اللي بيتحدّد تاريخ ميلاده بياخد الترجمة
   * فورًا، مش بعد ما العدّاد يتصفّر بكرة. (ولو كاشّينا الرفض كان هيستنى يوم.)
   */
  it("تحديد تاريخ الميلاد بيفتح الترجمة فورًا من غير إعادة تشغيل", async () => {
    const a = await env.login("01064100005", "اتحدّد سنّها");
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });
    await request(env.app).post("/translate").set(a.auth).send({ text: "قبل التحديد", to: "fr" }).expect(501);

    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: new Date("1990-05-05") } });
    await request(env.app).post("/translate").set(a.auth).send({ text: "بعد التحديد", to: "fr" }).expect(200);
  });
});
