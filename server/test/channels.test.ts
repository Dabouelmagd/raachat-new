import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { providerSender } from "../src/lib/senders.js";
import type { Config } from "../src/config.js";

/**
 * قنوات التحقق المتاحة. **SMS مش شغّال في الإنتاج**، وقبل كده كان طلب كود على
 * رقم بيعمل الآتي: يكتب صف كود في القاعدة، يستهلك واحدة من حد الـ ٥/ساعة،
 * وبعدين الإرسال يفشل فيرجّع «تعذّر إرسال الكود الآن» — المستخدم مايعرفش إن
 * الطريق مسدود أصلًا، ولو حاول ٥ مرات يتقفل عليه ساعة على لا شيء.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

/** مُرسِل الاختبار الافتراضي مالوش `ready` — فالاتنين متاحين */
const useSender = (ready?: (ch: "phone" | "email") => boolean) => {
  env.ctx.sender = { ready, async send() { /* مش مهم هنا */ } };
};

describe("قنوات التحقق", () => {
  it("‏/auth/channels بيقول المتاح، وبلا توكن", async () => {
    useSender((ch) => ch === "email"); // زي الإنتاج: إيميل بس
    const r = await request(env.app).get("/auth/channels").expect(200);
    expect(r.body).toEqual({ phone: false, email: true });
  });

  it("القناة الموقوفة بترفض **قبل** ما تكتب كود أو تستهلك حد الساعة", async () => {
    useSender((ch) => ch === "email");
    const before = await env.ctx.db.otpCode.count();
    const r = await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: "01095000001" }).expect(503);
    expect(r.body.code).toBe("channel_unavailable");
    expect(r.body.message).toMatch(/استخدم الإيميل/);
    // ولا صف اتكتب — ولا محاولة اتحسبت
    expect(await env.ctx.db.otpCode.count()).toBe(before);

    // وخمس محاولات على المسدود مابتقفلش الإيميل بعدها
    for (let i = 0; i < 5; i++) await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: "01095000001" }).expect(503);
    await request(env.app).post("/auth/otp/request").send({ channel: "email", target: "ok@example.com" }).expect(204);
  });

  it("القناة المتاحة شغّالة زي ما هي", async () => {
    useSender(() => true);
    await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: "01095000002" }).expect(204);
    const r = await request(env.app).get("/auth/channels").expect(200);
    expect(r.body).toEqual({ phone: true, email: true });
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
