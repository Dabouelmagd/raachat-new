import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv, testEmail } from "./helpers.js";
import { providerSender } from "../src/lib/senders.js";
import type { Config } from "../src/config.js";

/**
 * قنوات التحقق بعد تعديل ٥ نوفمبر ٢٠٢٦: **الكود بيتوصّل على الإيميل دايمًا**،
 * والرقم بقى **اسمًا بديلًا للدخول** بيترجم لإيميل صاحبه.
 *
 * قبل كده كان طلب كود على رقم بيرجّع 503 «استخدم الإيميل» لأن الـSMS موقوف —
 * فالدخول بالرقم كان طريقًا مسدودًا. ودلوقتي بقى شغّالًا بلا SMS وبلا فلوس.
 *
 * والاختبارات دي بتثبّت التلات خصائص اللي التصميم قايم عليها:
 *   ١) جاهزية الدخول بالرقم = جاهزية الإيميل (الخيار يرجع لوحده بلا نشر واجهة).
 *   ٢) رقم **مش مربوط** بحساب: نفس الرد بلا كتابة وبلا إرسال (مفيش كشف للأرقام).
 *   ٣) رقم **مربوط**: الكود بيروح على **إيميل الحساب** — مش على الرقم.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
let realSender: typeof env.ctx.sender;
beforeAll(async () => { env = await startTestEnv(); realSender = env.ctx.sender; }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

/** مُرسِل الاختبار الافتراضي مالوش `ready` — فالاتنين متاحين، وبيسجّل في `sent`. */
const useSender = (ready?: (ch: "phone" | "email") => boolean) => {
  env.ctx.sender = { ready, async send() { /* مش مهم هنا */ } };
};
/** يرجّع المُرسِل اللي بيسجّل في `env.sent` — لازم لأي اختبار بيفحص **وصل لمين**. */
const useRecordingSender = () => { env.ctx.sender = realSender; };

describe("قنوات التحقق", () => {
  it("‏/auth/channels: الدخول بالرقم متاح لما الإيميل متاح — لأن الكود بيروح للإيميل", async () => {
    useSender((ch) => ch === "email"); // زي الإنتاج: الإيميل شغّال والـSMS موقوف
    const r = await request(env.app).get("/auth/channels").expect(200);
    // 🔴 قبل التعديل كانت `{ phone: false }` — فخيار الرقم كان مقفولًا في شاشة
    // الدخول طول ما الـSMS موقوف (من ١٣ أكتوبر). دلوقتي بيرجع لوحده.
    expect(r.body).toEqual({ phone: true, email: true });
  });

  it("🔴 رقم مش مربوط بحساب: نفس الرد ٢٠٤ **بلا كتابة وبلا إرسال** — مفيش كشف للأرقام المسجَّلة", async () => {
    useRecordingSender();
    const before = await env.ctx.db.otpCode.count();
    const sentBefore = env.sent.length;
    await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: "01095000777" }).expect(204);
    expect(await env.ctx.db.otpCode.count(), "ولا صف كود اتكتب لرقم مش مربوط").toBe(before);
    expect(env.sent.length, "ولا رسالة اتبعتت").toBe(sentBefore);

    // والكود الغلط على الرقم ده بيرجّع **نفس خطأ الكود الغلط** مش «الرقم مش موجود»
    const v = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "phone", target: "01095000777", code: "123456" }).expect(401);
    expect(v.body.code).toBe("invalid_code");
  });

  it("🔴 رقم مربوط: الكود بيروح على **إيميل الحساب** مش على الرقم", async () => {
    useRecordingSender();
    const phone = "01095000100";
    await env.login(phone); // بيعمل الحساب بإيميل ويربط الرقم
    const sentBefore = env.sent.length;
    await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: phone }).expect(204);
    const last = env.sent.at(-1)!;
    expect(last.channel, "القناة اللي وصّلت لازم تكون الإيميل").toBe("email");
    expect(last.target, "الهدف لازم يكون إيميل الحساب مش الرقم").toBe(testEmail(phone));
    expect(env.sent.length).toBe(sentBefore + 1);

    // والكود ده بيدخّل فعلًا من مسار الرقم
    const v = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "phone", target: phone, code: last.code }).expect(200);
    expect(v.body.user.id).toBeTruthy();
  });

  it("🔴 الدخول بالرقم **عمره ما بيعمل حسابًا** — ودي اللي بتقفل الحسابات المكرّرة", async () => {
    useRecordingSender();
    const before = await env.ctx.db.user.count();
    await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: "01095000900" }).expect(204);
    await request(env.app).post("/auth/otp/verify")
      .send({ channel: "phone", target: "01095000900", code: "123456", birthDate: "1990-01-01" }).expect(401);
    expect(await env.ctx.db.user.count(), "مفيش حساب اتعمل من مسار الرقم").toBe(before);
  });

  it("قناة الإيميل الموقوفة بترفض **قبل** ما تكتب كود أو تستهلك حد الساعة", async () => {
    useSender((ch) => ch !== "email"); // الإيميل موقوف
    const before = await env.ctx.db.otpCode.count();
    const r = await request(env.app).post("/auth/otp/request").send({ channel: "email", target: "down@example.com" }).expect(503);
    expect(r.body.code).toBe("channel_unavailable");
    expect(await env.ctx.db.otpCode.count(), "ولا صف اتكتب").toBe(before);
    // وخمس محاولات على المسدود مابتستهلكش حد الساعة
    for (let i = 0; i < 5; i++) {
      await request(env.app).post("/auth/otp/request").send({ channel: "email", target: "down@example.com" }).expect(503);
    }
    useSender(() => true);
    await request(env.app).post("/auth/otp/request").send({ channel: "email", target: "down@example.com" }).expect(204);
  });

  it("حد الساعة مشترك بين الرقم والإيميل لنفس الحساب — حساب واحد وميزانية واحدة", async () => {
    useRecordingSender();
    const phone = "01095000200";
    await env.login(phone);
    // `login` استهلك واحدة، فباقي أربعة قبل الحد (٥/ساعة)
    for (let i = 0; i < 4; i++) {
      await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: phone }).expect(204);
    }
    const r = await request(env.app).post("/auth/otp/request").send({ channel: "email", target: testEmail(phone) }).expect(429);
    expect(r.body.code).toBe("too_many");
  });

  it("مُرسِل المزوّد بيحسب الجاهزية من المفاتيح الموجودة (أسماء بس، مفيش قيم حقيقية)", () => {
    const base = { TWILIO_SID: "", TWILIO_TOKEN: "", TWILIO_FROM: "", RESEND_KEY: "", EMAIL_FROM: "" } as unknown as Config;
    expect(providerSender(base).ready!("phone")).toBe(false);
    expect(providerSender(base).ready!("email")).toBe(false);
    const mail = { ...base, RESEND_KEY: "x", EMAIL_FROM: "a@b.c" } as Config;
    expect(providerSender(mail).ready!("email")).toBe(true);
    expect(providerSender(mail).ready!("phone")).toBe(false);
    const sms = { ...mail, TWILIO_SID: "s", TWILIO_TOKEN: "t", TWILIO_FROM: "f" } as Config;
    expect(providerSender(sms).ready!("phone")).toBe(true);
  });
});
