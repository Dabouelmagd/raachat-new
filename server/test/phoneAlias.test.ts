import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv, testEmail } from "./helpers.js";

/**
 * 🔴 **الرقم اسم بديل للدخول — مش هوية متحقَّقة** (٣ نوفمبر ٢٠٢٦).
 *
 * الـSMS موقوف، فمفيش طريق نتحقق بيه إن الرقم فعلًا بتاع صاحب الحساب. والرقم
 * المكتوب بالإيد لو دخل **مطابقة جهات الاتصال**، أي حد يدّعي رقم حد تاني ويظهر
 * **باسمه وصورته** عند كل اللي عندهم الرقم ده في تليفوناتهم — تمثّل شخصية.
 *
 * فالقاعدة: الدخول بالرقم للكل، و**الاكتشاف بالرقم للمتحقَّق بـSMS بس**
 * (`phoneVerifiedAt`). والاختبارات دي هي اللي بتثبّت الخط ده.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const api = () => request(env.app);

/** كود على إيميل الحساب — ده اللي بيحمي ربط رقم جديد. */
async function emailCode(email: string) {
  await api().post("/auth/otp/request").send({ channel: "email", target: email }).expect(204);
  return env.sent.filter((s) => s.target === email).at(-1)!.code;
}

/** حساب بإيميل **وبلا رقم** — `login` بيربط رقمًا متحقَّقًا فمش مناسب هنا. */
async function emailOnlyUser(email: string) {
  const code = await emailCode(email);
  const r = await api().post("/auth/otp/verify")
    .send({ channel: "email", target: email, code, birthDate: "1990-01-01" }).expect(200);
  return { token: r.body.accessToken as string, user: r.body.user as { id: string }, auth: { Authorization: `Bearer ${r.body.accessToken}` } };
}

describe("الرقم اسم بديل للدخول", () => {
  it("🔴 رقم مكتوب بالإيد **مابيظهرش** في مطابقة جهات الاتصال — ده الحارس ضد تمثّل الشخصية", async () => {
    const victimPhone = "01097000001";
    const squatter = await emailOnlyUser("squatter@example.com");

    // المدّعي بيربط رقم حد تاني بحسابه — مسموح كاسم دخول، ومرفوض كهوية
    const code = await emailCode("squatter@example.com");
    await api().post("/me/phone").set(squatter.auth).send({ phone: victimPhone, code }).expect(200);

    // وصاحب تليفون فيه الرقم ده **مايشوفوش** في «الأصدقاء»
    const seeker = await env.login("01097000500", "باحث");
    const m = (await api().post("/contacts/match").set(seeker.auth).send({ phones: [victimPhone] }).expect(200)).body;
    expect(m.onApp, "الرقم المكتوب بالإيد ممنوع يظهر في المطابقة").toHaveLength(0);
    expect(m.notOnApp).toContain(victimPhone);
  });

  it("والرقم **المتحقَّق بـSMS** بيظهر زي ما كان — الميزة ما اتكسرتش", async () => {
    const real = await env.login("01097000010", "صاحب الرقم"); // `login` بيربطه متحقَّقًا
    const seeker = await env.login("01097000501", "باحث٢");
    const m = (await api().post("/contacts/match").set(seeker.auth).send({ phones: ["01097000010"] }).expect(200)).body;
    expect(m.onApp).toHaveLength(1);
    expect(m.onApp[0].id).toBe(real.user.id);
  });

  it("والبحث عن المستخدمين بالرقم كذلك — المتحقَّق بيتلاقى والمكتوب بالإيد لأ", async () => {
    const hidden = await emailOnlyUser("hidden@example.com");
    const code = await emailCode("hidden@example.com");
    await api().post("/me/phone").set(hidden.auth).send({ phone: "01097000020", code }).expect(200);
    const seeker = await env.login("01097000502", "باحث٣");

    const r1 = (await api().get("/users?q=01097000020").set(seeker.auth).expect(200)).body;
    expect(r1.some((u: { id: string }) => u.id === hidden.user.id), "المكتوب بالإيد ممنوع يتلاقى بالرقم").toBe(false);

    const shown = await env.login("01097000021", "ظاهر");
    const r2 = (await api().get("/users?q=01097000021").set(seeker.auth).expect(200)).body;
    expect(r2.some((u: { id: string }) => u.id === shown.user.id), "المتحقَّق لازم يتلاقى").toBe(true);
  });

  it("ربط الرقم محتاج كود على إيميل الحساب — الكود الغلط بيترفض وولا حاجة بتتكتب", async () => {
    const u = await emailOnlyUser("needcode@example.com");
    await api().post("/me/phone").set(u.auth).send({ phone: "01097000030", code: "000000" }).expect(401);
    const row = await env.ctx.db.user.findUnique({ where: { id: u.user.id }, select: { phone: true } });
    expect(row!.phone, "الرقم مايتربطش بكود غلط").toBeNull();
  });

  it("🔴 رقم على حساب تاني: ٤٠٩ و**مابيتنقلش** من صاحبه", async () => {
    const owner = await env.login("01097000040", "صاحب الرقم");
    const other = await emailOnlyUser("other@example.com");
    const code = await emailCode("other@example.com");
    const r = await api().post("/me/phone").set(other.auth).send({ phone: "01097000040", code }).expect(409);
    expect(r.body.code).toBe("phone_taken");
    const still = await env.ctx.db.user.findUnique({ where: { phone: "01097000040" }, select: { id: true } });
    expect(still!.id, "الرقم فضل مع صاحبه").toBe(owner.user.id);
  });

  it("فكّ الرقم بيحرّره، والربط تاني بيرجّعه غير متحقَّق", async () => {
    const u = await emailOnlyUser("unlink@example.com");
    let code = await emailCode("unlink@example.com");
    await api().post("/me/phone").set(u.auth).send({ phone: "01097000050", code }).expect(200);
    await api().delete("/me/phone").set(u.auth).expect(200);
    expect(await env.ctx.db.user.findUnique({ where: { phone: "01097000050" } })).toBeNull();

    code = await emailCode("unlink@example.com");
    await api().post("/me/phone").set(u.auth).send({ phone: "01097000050", code }).expect(200);
    const row = await env.ctx.db.user.findUnique({ where: { id: u.user.id }, select: { phoneVerifiedAt: true } });
    expect(row!.phoneVerifiedAt, "الربط بالإيد عمره ما بيطلّع رقمًا متحقَّقًا").toBeNull();
  });

  it("إضافة إيميل للحساب اللي مالوش إيميل بتفكّ حبسته، وتغيير إيميل موجود مرفوض", async () => {
    // حساب قديم بالرقم وبس — دي الحالة اللي كانت محبوسة من ١٣ أكتوبر (الـSMS
    // موقوف فمفيش طريق دخول)، ومن غير إيميل مفيش مكان نبعت له كود.
    const legacy = await env.ctx.db.user.create({
      data: { phone: "01097000060", phoneVerifiedAt: new Date(), name: "قديم", wallet: { create: {} } },
    });
    const auth = { Authorization: `Bearer ${await legacyToken(legacy.id)}` };

    const code = await emailCode("newmail@example.com");
    const r = await api().post("/me/email").set(auth).send({ email: "newmail@example.com", code }).expect(200);
    expect(r.body.email).toBe("newmail@example.com");

    // وبقى يقدر يدخل بالرقم — الكود بيروح للإيميل الجديد
    await api().post("/auth/otp/request").send({ channel: "phone", target: "01097000060" }).expect(204);
    expect(env.sent.at(-1)!.target).toBe("newmail@example.com");

    // وتغيير إيميل موجود مرفوض — ده مسار سيطرة على الحساب
    const again = await emailCode("newmail2@example.com");
    const r2 = await api().post("/me/email").set(auth).send({ email: "newmail2@example.com", code: again }).expect(409);
    expect(r2.body.code).toBe("email_set");
  });
});

/** توكن لحساب موجود في القاعدة مباشرةً — الحساب القديم مالوش طريق دخول. */
async function legacyToken(userId: string) {
  const { newSession } = await import("../src/auth.js");
  const s = await newSession(env.ctx, userId, "test");
  return s.accessToken as string;
}
