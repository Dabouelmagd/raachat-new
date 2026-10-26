/**
 * **رع شات ١٨+ (قرار داليا ١٣ أكتوبر ٢٠٢٦)** — حارس السن على **كل** مسارات إنشاء الحساب.
 *
 * الأهم في الملف ده: فيه **مسارين** بيعملوا حساب — `/auth/register` (كلمة سر) و
 * `/auth/otp/verify` (كود لمرة واحدة لهدف مش موجود). حارس على واحد بس = القاعدة
 * تبان مطبّقة وهي متخطّاة بخطوة واحدة (نفس درس `groupsHardening`).
 *
 * وفيه تفصيلة مقصودة: الرفض بسبب تاريخ ميلاد ناقص **مابيستهلكش الكود** — غير كده
 * المستخدم يكتب الكود من الإيميل، يترفض لأنه نسي التاريخ، وبعدين يلاقي الكود بايظ.
 * وفي نفس الوقت الرفض **بعد** التحقق من الكود مش قبله، عشان الرد مايبقاش وسيلة
 * لمعرفة إن إيميل معيّن له حساب عندنا.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { ADULT_AGE, assertSignupAge } from "../src/lib/age.js";
import { todayCairo } from "../src/lib/cairo.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

/**
 * تاريخ ميلاد بعمر محدد بالظبط النهارده — **محسوب من يوم القاهرة** مش من UTC.
 *
 * الحساب من UTC كان بيخلّي الاختبار **يسقط ساعة واحدة كل يوم**: مصر +٠٣ صيفًا،
 * فمن ٢١:٠٠ UTC القاهرة بقت اليوم اللي بعده — فـ«النهارده» عند الاختبار بيبقى
 * «امبارح» عند السيرفر، وحالات الحدود تتقلب. (سقط فعلًا الساعة ٢١:٠٣ UTC.)
 * ودي بالظبط العلّة اللي `cairoDay.test.ts` و`cairoMonth.test.ts` موجودين عشانها.
 */
const birthFor = (years: number, days = 0) => {
  const [y, m, d] = todayCairo().split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCFullYear(base.getUTCFullYear() - years);
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
};

const codeFor = async (target: string, channel: "email" | "phone" = "email") => {
  await request(env.app).post("/auth/otp/request").send({ channel, target }).expect(204);
  return env.sent.filter((s) => s.target === target).at(-1)!.code;
};

describe("التسجيل بكلمة سر ١٨+", () => {
  it("من غير تاريخ ميلاد = مرفوض، ومفيش حساب اتعمل", async () => {
    const target = "noage@example.com";
    const code = await codeFor(target);
    const r = await request(env.app).post("/auth/register")
      .send({ target, code, name: "بدون سن", password: "password-123" }).expect(400);
    expect(r.body.code).toBe("birth_date_required");
    expect(await env.ctx.db.user.count({ where: { email: target } })).toBe(0);
  });

  it("أقل من ١٨ = مرفوض ٤٠٣، ومفيش حساب", async () => {
    const target = "kid@example.com";
    const code = await codeFor(target);
    const r = await request(env.app).post("/auth/register")
      .send({ target, code, name: "صغير", password: "password-123", birthDate: birthFor(14) }).expect(403);
    expect(r.body.code).toBe("under_age");
    expect(r.body.message).toMatch(/١٨/);
    expect(await env.ctx.db.user.count({ where: { email: target } })).toBe(0);
  });

  it("**الرفض مابيضيّعش الكود** — نفس الكود بيشتغل بعد ما يكتب تاريخه", async () => {
    const target = "retry@example.com";
    const code = await codeFor(target);
    await request(env.app).post("/auth/register")
      .send({ target, code, name: "محمد", password: "password-123" }).expect(400);
    // نفس الكود بالظبط
    const r = await request(env.app).post("/auth/register")
      .send({ target, code, name: "محمد", password: "password-123", birthDate: birthFor(30) }).expect(201);
    expect(r.body.user.name).toBe("محمد");
  });

  it("تاريخ ميلاد غير منطقي (المستقبل) = مرفوض", async () => {
    const target = "future@example.com";
    const code = await codeFor(target);
    // ٣ أيام قدّام: بعيد عن حدود اليوم فمايتأثرش بفرق القاهرة/UTC
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const r = await request(env.app).post("/auth/register")
      .send({ target, code, name: "من المستقبل", password: "password-123", birthDate: soon }).expect(400);
    expect(r.body.code).toBe("invalid_birth_date");
  });

  it("١٨ بالظبط بيوم القاهرة = مقبول", async () => {
    const ok = "exactly18@example.com";
    await request(env.app).post("/auth/register")
      .send({ target: ok, code: await codeFor(ok), name: "تمام ١٨", password: "password-123", birthDate: birthFor(18) })
      .expect(201);
  });

  it("لسه ناقص سنة = مرفوض", async () => {
    const no = "almost18@example.com";
    const r = await request(env.app).post("/auth/register")
      .send({ target: no, code: await codeFor(no), name: "ناقص سنة", password: "password-123", birthDate: birthFor(17) });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("under_age");
  });

  it("تاريخ الميلاد بيتخزّن فعلًا (فخدمات ١٨+ تفتح من غير ما يتسأل تاني)", async () => {
    const target = "stored@example.com";
    await request(env.app).post("/auth/register")
      .send({ target, code: await codeFor(target), name: "متخزّن", password: "password-123", birthDate: "1990-05-20" })
      .expect(201);
    const u = await env.ctx.db.user.findUnique({ where: { email: target }, select: { birthDate: true } });
    expect(u!.birthDate!.toISOString().slice(0, 10)).toBe("1990-05-20");
  });
});

describe("الدخول بكود — المسار التاني لإنشاء الحساب", () => {
  it("حساب جديد بكود من غير تاريخ ميلاد = مرفوض، **والكود لسه صالح**", async () => {
    const target = "otpnew@example.com";
    const code = await codeFor(target);
    const r = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "email", target, code }).expect(400);
    expect(r.body.code).toBe("birth_date_required");
    expect(await env.ctx.db.user.count({ where: { email: target } })).toBe(0);

    // نفس الكود + تاريخ الميلاد = دخول وحساب جديد
    const ok = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "email", target, code, birthDate: birthFor(25) }).expect(200);
    expect(ok.body.user.id).toBeTruthy();
    const u = await env.ctx.db.user.findUnique({ where: { email: target }, select: { birthDate: true } });
    expect(u!.birthDate).toBeTruthy();
  });

  it("حساب جديد بكود وسنّه أقل من ١٨ = مرفوض ومفيش حساب", async () => {
    const target = "otpkid@example.com";
    const code = await codeFor(target);
    const r = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "email", target, code, birthDate: birthFor(12) }).expect(403);
    expect(r.body.code).toBe("under_age");
    expect(await env.ctx.db.user.count({ where: { email: target } })).toBe(0);
  });

  it("الحساب **الموجود** بيدخل بكود من غير تاريخ ميلاد — الحسابات القديمة مش بتتقفل", async () => {
    // الحسابات الـ ٨ في الإنتاج مالهاش `birthDate` (كان اختياري). فبنحاكي الحالة دي
    // بالظبط: نعمل حساب وبعدين نفضّي العمود، وبعدين ندخل بكود من غير أي تاريخ.
    const a = await env.login("01097000001", "قديم");
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });

    const code = await codeFor("01097000001", "phone");
    const r = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "phone", target: "01097000001", code }).expect(200);
    expect(r.body.user.id).toBe(a.user.id);
    const u = await env.ctx.db.user.findUnique({ where: { id: a.user.id }, select: { birthDate: true } });
    expect(u!.birthDate).toBeNull(); // ومابنكتبش له تاريخ من ورا ظهره
  });

  it("الكود الغلط بيرجّع `invalid_code` حتى للهدف اللي **مالوش** حساب (الرد مايكشفش الحسابات)", async () => {
    const unknown = "probe@example.com";
    await codeFor(unknown);
    const bad = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "email", target: unknown, code: "000000" }).expect(401);
    expect(bad.body.code).toBe("invalid_code");

    // ونفس الرد بالظبط لهدف **له** حساب
    const known = "exactly18@example.com";
    await codeFor(known);
    const bad2 = await request(env.app).post("/auth/otp/verify")
      .send({ channel: "email", target: known, code: "000000" }).expect(401);
    expect(bad2.body.code).toBe(bad.body.code);
  });
});

describe("الحارس نفسه", () => {
  it("مصدر واحد: `assertSignupAge` بيرمي نفس الأكواد لكل الحالات", () => {
    expect(() => assertSignupAge(undefined)).toThrow(/تاريخ ميلادك/);
    expect(() => assertSignupAge("")).toThrow(/تاريخ ميلادك/);
    expect(() => assertSignupAge("مش تاريخ")).toThrow(/غير صحيح/);
    expect(() => assertSignupAge(birthFor(17))).toThrow(/١٨/);
    expect(assertSignupAge(birthFor(ADULT_AGE)).getUTCFullYear()).toBeGreaterThan(1900);
  });

  it("بساعة مثبّتة: اللي بيكمّل ١٨ النهارده بتوقيت القاهرة مقبول من أول ثانية في اليوم", () => {
    // ١ يناير ٢٠٢٦ الساعة ٠٠:٣٠ بتوقيت القاهرة = ٣١ ديسمبر ٢٠٢٥ الساعة ٢٢:٣٠ UTC
    const cairoJustAfterMidnight = new Date("2025-12-31T22:30:00Z");
    const birth = new Date("2008-01-01T00:00:00Z"); // بيكمّل ١٨ في ١ يناير ٢٠٢٦
    expect(() => assertSignupAge("2008-01-01", cairoJustAfterMidnight)).not.toThrow();
    expect(birth.getUTCFullYear()).toBe(2008);
    // ولسه ١٧ قبل منتصف ليل القاهرة بساعة
    expect(() => assertSignupAge("2008-01-01", new Date("2025-12-31T21:30:00Z"))).toThrow(/١٨/);
    // و«١٨ ناقص يوم» مرفوض: عيد ميلاده بكرة بتوقيت القاهرة
    expect(() => assertSignupAge("2008-01-02", cairoJustAfterMidnight)).toThrow(/١٨/);
    // والتاريخ اللي في المستقبل بيوم القاهرة مرفوض كتاريخ مش كسن
    expect(() => assertSignupAge("2026-01-05", cairoJustAfterMidnight)).toThrow(/غير صحيح/);
  });
});

/**
 * محو بيانات حساب من اللوحة — الوفاء بوعد منشور.
 *
 * `terms.html` بند ٢ و`privacy.html` بند ١٠ بيقولوا للعميل: «متى تبيّن لنا أنّ
 * حسابًا يخصّ من هو دون ١٨ سنة أغلقناه ومحونا بياناته **فورًا**». والمراجعة
 * القانونية (١٤ أكتوبر ٢٠٢٦) طلبت ده صراحةً. وقبل الإصلاح `admin.ts` كان بيعرف
 * `active/suspended/banned` بس، والمحو الكامل في `me.ts` **لصاحب الحساب وحده** —
 * يعني وعد للعميل بلا آلية تنفّذه.
 */
describe("محو بيانات حساب من اللوحة", () => {
  const erase = (auth: Record<string, string>, id: string, body: object = { reason: "تبيّن أنه دون ١٨ سنة", confirm: true }) =>
    request(env.app).post(`/admin/users/${id}/erase`).set(auth).send(body);

  it("بيمحو البيانات الشخصية فعلًا — مش بيوقف الحساب بس", async () => {
    const owner = await env.login("01099000001", "داليا");
    const victim = await env.login("01099100001", "حساب لقاصر");
    await request(env.app).post("/push/subscribe").set(victim.auth)
      .send({ endpoint: "https://push.example/erase-me", keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) } }).expect(204);

    await erase(owner.auth, victim.user.id).expect(200);

    const after = await env.ctx.db.user.findUnique({ where: { id: victim.user.id } });
    expect(after!.modStatus).toBe("deleted");
    expect(after!.phone).toBeNull();
    expect(after!.email).toBeNull();
    expect(after!.name).toBe("حساب محذوف");
    expect(after!.deletedAt).toBeTruthy();
    // البيانات التابعة اتمسحت فعلًا — مش الصف الرئيسي بس
    expect(await env.ctx.db.pushSub.count({ where: { userId: victim.user.id } })).toBe(0);
    expect(await env.ctx.db.session.count({ where: { userId: victim.user.id, revokedAt: null } })).toBe(0);
    // وفيه أثر في سجل الإجراءات بالسبب
    const log = await env.ctx.db.auditLog.findFirst({ where: { target: victim.user.id, action: "محو بيانات حساب" } });
    expect(log).toBeTruthy();
    expect(JSON.stringify(log!.meta)).toContain("دون ١٨");
  });

  it("**الصلاحية مش في أي دور جاهز** — المحو لا رجعة فيه", async () => {
    const { CATALOG, PRESET_ROLES } = await import("../src/lib/permissions.js");
    expect(CATALOG.some((p) => p.key === "users.erase")).toBe(true);
    for (const role of PRESET_ROLES) {
      expect(role.permissions, `الدور «${role.name}» بياخد users.erase من غير قرار صريح`).not.toContain("users.erase");
    }
  });

  it("بيرفض بلا تأكيد صريح أو بلا سبب، وبيرفض عضو الفريق والحساب الممحو", async () => {
    const owner = await env.login("01099000001", "داليا");
    const victim = await env.login("01099100002", "حساب تاني");
    await erase(owner.auth, victim.user.id, { reason: "تبيّن أنه دون ١٨ سنة" }).expect(400); // مفيش confirm
    await erase(owner.auth, victim.user.id, { confirm: true }).expect(400);                   // مفيش سبب
    await erase(owner.auth, owner.user.id).expect(403);                                       // نفسه
    await erase(owner.auth, victim.user.id).expect(200);
    await erase(owner.auth, victim.user.id).expect(409);                                      // ممحو بالفعل
  });
});

/**
 * **تعديل تاريخ الميلاد لحساب موجود — `PATCH /me` (قرار داليا ٢٦ أكتوبر ٢٠٢٦).**
 *
 * المسار كان `validBirthDate` وحده: أي تاريخ صالح يُحفَظ، بما فيه تاريخ أقلّ من ١٨.
 * فالمستخدم يقرّ بنفسه إنه دون السن، والخادم يسجّلها ويكمّل — والسياسة المنشورة
 * (البند ١٠) تقول إنّ الحساب في هذه الحالة «أغلقناه ومحونا بياناته فورًا». القرار:
 * **نرفض التاريخ ولا نحذف شيئًا** (الحذف لا يرجع، والرفض يمنع الحالة من أصلها).
 */
describe("تعديل تاريخ الميلاد لحساب موجود", () => {
  const patch = (auth: Record<string, string>, body: Record<string, unknown>) =>
    request(env.app).patch("/me").set(auth).send(body);

  it("🔴 أقلّ من ١٨ مرفوض — والتاريخ المخزَّن ما اتغيّرش", async () => {
    const a = await env.login("01099200001", "حساب قديم");
    await patch(a.auth, { birthDate: birthFor(30) }).expect(200);

    const r = await patch(a.auth, { birthDate: birthFor(12) }).expect(403);
    expect(r.body.code).toBe("under_age");
    // 🔴 الفحص الحاسم: الرفض **مش بيكتب نصّ الطريق** — لو كتب التاريخ وبعدين رفض،
    // الحساب يبقى مسجَّلًا دون ١٨ والرد يقول «مرفوض»، وهي أسوأ من القبول الصريح.
    const row = await env.ctx.db.user.findUnique({ where: { id: a.user.id }, select: { birthDate: true } });
    expect(row!.birthDate!.toISOString().slice(0, 10)).toBe(birthFor(30));
    expect((await request(env.app).get("/me").set(a.auth).expect(200)).body.isAdult).toBe(true);
  });

  it("🔴 ومرفوض كذلك لحساب غير محدَّد السن — فلا طريق يُنشئ تاريخًا دون ١٨", async () => {
    const a = await env.login("01099200002", "غير محدَّد");
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });

    expect((await patch(a.auth, { birthDate: birthFor(17) }).expect(403)).body.code).toBe("under_age");
    const row = await env.ctx.db.user.findUnique({ where: { id: a.user.id }, select: { birthDate: true } });
    expect(row!.birthDate, "فضل غير محدَّد — ولا اتسجّل قاصرًا").toBeNull();
  });

  it("١٨ بالظبط النهاردة مقبول، و١٨ ناقص يوم مرفوض (بتقويم القاهرة)", async () => {
    const a = await env.login("01099200003", "على الحدّ");
    await patch(a.auth, { birthDate: birthFor(ADULT_AGE) }).expect(200);
    // ‏`days` بالسالب = مولود **بعد** التاريخ ده، يعني أصغر بيوم (الموجب بيكبّره —
    // وأول نسخة من الاختبار ده استخدمت `1` فعدّى بـ٢٠٠ على كود سليم)
    expect((await patch(a.auth, { birthDate: birthFor(ADULT_AGE, -1) }).expect(403)).body.code).toBe("under_age");
    // ومن غير تاريخ ميلاد خالص: الحساب القديم لسه يقدر يعدّل اسمه
    const r = await patch(a.auth, { name: "اسم جديد" }).expect(200);
    expect(r.body.name).toBe("اسم جديد");
  });

  /**
   * 🔴 الحالة اللي كسرها إصلاحي نفسه قبل الـcommit: صاحب صفٍّ مخزَّن دون ١٨ (مصدره
   * الواقعي الوحيد استرجاع نسخة أو تعديل مباشر) يفتح الملف الشخصي فتاريخه في الحقل،
   * والواجهة ترسله مع **كل** حفظ — فالرفض على القيمة كان بيقفل عليه تعديل اسمه
   * وصورته إلى الأبد. والقرار كان «ارفض تاريخًا أقلّ من ١٨ بدون حذف»، لا «اقفل الحساب».
   */
  it("🔴 صاحب تاريخ مخزَّن دون ١٨ لسه يقدر يعدّل اسمه (الرفض على التغيير مش على القيمة)", async () => {
    const a = await env.login("01099200005", "صفّ قديم");
    const kid = birthFor(12);
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: new Date(`${kid}T00:00:00Z`) } });

    // بيبعت نفس التاريخ المخزَّن مع الاسم — زي ما الواجهة بتعمل بالظبط
    const r = await patch(a.auth, { name: "اسمه الجديد", birthDate: kid }).expect(200);
    expect(r.body.name).toBe("اسمه الجديد");
    // والتاريخ ما اتغيّرش ولا اتمسح — مفيش حذف، ده كان شرط القرار
    const row = await env.ctx.db.user.findUnique({ where: { id: a.user.id }, select: { birthDate: true } });
    expect(row!.birthDate!.toISOString().slice(0, 10)).toBe(kid);
    // إنما **تاريخ دون ١٨ مختلف** لسه مرفوض — الحارس مش بيتفتح بالحيلة دي
    expect((await patch(a.auth, { birthDate: birthFor(13) }).expect(403)).body.code).toBe("under_age");
  });

  it("التاريخ غير الصالح لسه مرفوض بنفس الكود القديم", async () => {
    const a = await env.login("01099200004", "تواريخ غلط");
    expect((await patch(a.auth, { birthDate: birthFor(-1) }).expect(400)).body.code).toBe("invalid_birth_date");
    expect((await patch(a.auth, { birthDate: "1850-01-01" }).expect(400)).body.code).toBe("invalid_birth_date");
  });
});
