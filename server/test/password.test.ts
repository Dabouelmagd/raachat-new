import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

/**
 * حساب بكلمة سر: الطلب كان «لما أكون مسجّلة حساب، مش كل مرة أدخل بـ OTP».
 * الكود بيتطلب **مرة واحدة** عند التسجيل لتأكيد الإيميل، وبعدها الدخول بكلمة
 * السر. ودخول الكود لمرة واحدة فاضل موجود للحسابات القديمة ولدخول الرقم.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const code = (target: string) => env.sent.filter((s) => s.target === target).at(-1)!.code;
const ask = (target: string) => request(env.app).post("/auth/otp/request").send({ channel: "email", target }).expect(204);

async function signUp(target: string, name: string, password: string) {
  await ask(target);
  return (await request(env.app).post("/auth/register").send({ target, code: code(target), name, password, birthDate: "1990-01-01" }).expect(201)).body;
}

describe("التسجيل", () => {
  it("اسم + إيميل + كلمة سر + كود مرة واحدة = حساب جاهز بالاسم اللي كتبه", async () => {
    const r = await signUp("dalia@example.com", "داليا", "سر-طويل-كفاية");
    expect(r.user.name).toBe("داليا"); // مش «مستخدم ####» المولّد
    expect(r.accessToken).toBeTruthy();
    // والتوكن شغّال فعلًا
    expect((await request(env.app).get("/me").set({ Authorization: `Bearer ${r.accessToken}` }).expect(200)).body.name).toBe("داليا");
  });

  it("كلمة سر أقصر من ٨ حروف بترفض **والكود يفضل صالح**", async () => {
    const target = "short@example.com";
    await ask(target);
    await request(env.app).post("/auth/register").send({ target, code: code(target), name: "قصير", password: "1234", birthDate: "1990-01-01" }).expect(400);
    // نفس الكود لسه ينفع — مانضيّعش على المستخدم كود بسبب كلمة سر مرفوضة
    await request(env.app).post("/auth/register").send({ target, code: code(target), name: "قصير", password: "كلمة-سر-كفاية", birthDate: "1990-01-01" }).expect(201);
  });

  it("الكود الغلط بيرفض التسجيل", async () => {
    const target = "wrongcode@example.com";
    await ask(target);
    await request(env.app).post("/auth/register").send({ target, code: "000000", name: "حد", password: "كلمة-سر-كفاية", birthDate: "1990-01-01" }).expect(401);
  });

  it("إيميل مسجّل بالفعل بيرجّع ٤٠٩ برسالة توجّهه للدخول", async () => {
    await signUp("dup@example.com", "أول", "كلمة-سر-كفاية");
    await ask("dup@example.com");
    const r = await request(env.app).post("/auth/register").send({ target: "dup@example.com", code: code("dup@example.com"), name: "تاني", password: "كلمة-سر-تانية", birthDate: "1990-01-01" }).expect(409);
    expect(r.body.code).toBe("already_registered");
  });

  it("الحساب القديم (بكود بس) بيتوجّه لعمل كلمة سر مش لتسجيل جديد", async () => {
    const target = "old@example.com";
    await ask(target);
    await request(env.app).post("/auth/otp/verify").send({ channel: "email", target, code: code(target), birthDate: "1990-01-01" }).expect(200);
    await ask(target);
    const r = await request(env.app).post("/auth/register").send({ target, code: code(target), name: "قديم", password: "كلمة-سر-كفاية", birthDate: "1990-01-01" }).expect(409);
    expect(r.body.code).toBe("needs_password_setup");
  });
});

describe("الدخول بكلمة السر", () => {
  it("إيميل + كلمة سر = جلسة، من غير أي كود", async () => {
    await signUp("login@example.com", "دخول", "كلمة-سر-كفاية");
    const before = env.sent.length;
    const r = await request(env.app).post("/auth/login").send({ target: "LOGIN@Example.com ", password: "كلمة-سر-كفاية" }).expect(200);
    expect(r.body.accessToken).toBeTruthy();
    expect(env.sent.length).toBe(before); // مفيش ولا كود اتبعت
  });

  it("كلمة سر غلط · حساب مش موجود · حساب بلا كلمة سر = نفس الرد ونفس الكود", async () => {
    await signUp("real@example.com", "حقيقي", "كلمة-سر-كفاية");
    const noPass = "nopass@example.com";
    await ask(noPass);
    await request(env.app).post("/auth/otp/verify").send({ channel: "email", target: noPass, code: code(noPass), birthDate: "1990-01-01" }).expect(200);
    for (const body of [
      { target: "real@example.com", password: "غلط-خالص" },
      { target: "ghost@example.com", password: "أي-حاجة" },
      { target: noPass, password: "أي-حاجة" },
    ]) {
      const r = await request(env.app).post("/auth/login").send(body).expect(401);
      expect(r.body.code).toBe("bad_credentials"); // مفيش فرق يكشف الحسابات الموجودة
    }
  });

  it("الحساب الموقوف مايدخلش بكلمة السر", async () => {
    const r = await signUp("susp@example.com", "موقوف", "كلمة-سر-كفاية");
    await env.ctx.db.user.update({ where: { id: r.user.id }, data: { modStatus: "suspended" } });
    expect((await request(env.app).post("/auth/login").send({ target: "susp@example.com", password: "كلمة-سر-كفاية", birthDate: "1990-01-01" }).expect(403)).body.code).toBe("account_suspended");
  });
});

describe("تغيير كلمة السر ونسيانها", () => {
  it("الحساب القديم يعمل كلمة سر من جوه الحساب وبعدها يدخل بيها", async () => {
    const target = "setup@example.com";
    await ask(target);
    const v = (await request(env.app).post("/auth/otp/verify").send({ channel: "email", target, code: code(target), birthDate: "1990-01-01" }).expect(200)).body;
    const auth = { Authorization: `Bearer ${v.accessToken}` };
    await request(env.app).post("/me/password").set(auth).send({ password: "كلمة-سر-جديدة" }).expect(204);
    await request(env.app).post("/auth/login").send({ target, password: "كلمة-سر-جديدة", birthDate: "1990-01-01" }).expect(200);
  });

  it("تغيير كلمة السر لازم كلمة السر الحالية، وبيطلّع الجلسات التانية", async () => {
    const first = await signUp("chg@example.com", "تغيير", "كلمة-سر-قديمة");
    const second = (await request(env.app).post("/auth/login").send({ target: "chg@example.com", password: "كلمة-سر-قديمة", birthDate: "1990-01-01" }).expect(200)).body;
    const a2 = { Authorization: `Bearer ${second.accessToken}` };
    expect((await request(env.app).post("/me/password").set(a2).send({ password: "كلمة-سر-جديدة" }).expect(401)).body.code).toBe("bad_current");
    await request(env.app).post("/me/password").set(a2).send({ current: "كلمة-سر-قديمة", password: "كلمة-سر-جديدة" }).expect(204);
    // الجلسة التانية (الأولى) اتلغت: الـ refresh بتاعها مابيشتغلش
    await request(env.app).post("/auth/refresh").send({ refreshToken: first.refreshToken }).expect(401);
    // وجلسة اللي غيّر فاضلة شغّالة
    await request(env.app).get("/me").set(a2).expect(200);
    await request(env.app).post("/auth/login").send({ target: "chg@example.com", password: "كلمة-سر-جديدة", birthDate: "1990-01-01" }).expect(200);
  });

  it("نسيت كلمة السر: كود على الإيميل → كلمة سر جديدة → القديمة مابتشتغلش", async () => {
    const target = "forgot@example.com";
    const old = await signUp(target, "ناسي", "كلمة-سر-قديمة");
    await ask(target);
    const r = await request(env.app).post("/auth/password/reset").send({ target, code: code(target), password: "كلمة-سر-بعد-النسيان", birthDate: "1990-01-01" }).expect(200);
    expect(r.body.accessToken).toBeTruthy();
    await request(env.app).post("/auth/login").send({ target, password: "كلمة-سر-قديمة", birthDate: "1990-01-01" }).expect(401);
    await request(env.app).post("/auth/login").send({ target, password: "كلمة-سر-بعد-النسيان", birthDate: "1990-01-01" }).expect(200);
    // وجلسات قبل الاسترجاع اتلغت كلها
    await request(env.app).post("/auth/refresh").send({ refreshToken: old.refreshToken }).expect(401);
  });

  it("الاسترجاع بكود غلط بيترفض وكلمة السر مابتتغيّرش", async () => {
    const target = "badreset@example.com";
    await signUp(target, "كود غلط", "كلمة-سر-قديمة");
    await ask(target);
    await request(env.app).post("/auth/password/reset").send({ target, code: "000000", password: "كلمة-سر-مسروقة", birthDate: "1990-01-01" }).expect(401);
    await request(env.app).post("/auth/login").send({ target, password: "كلمة-سر-قديمة", birthDate: "1990-01-01" }).expect(200);
  });
});
