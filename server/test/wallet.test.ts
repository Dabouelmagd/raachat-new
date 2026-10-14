import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { createApp } from "../src/app.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const pay = (a: any, body: any) => request(env.app).post("/wallet/pay").set(a.auth).send(body);

/** المحفظة خدمة ١٨+، فكل اختباراتها محتاجة حساب حدّد تاريخ ميلاد بالغ */
const setBirth = (a: any, birthDate: string) => request(env.app).patch("/me").set(a.auth).send({ birthDate });
const login = async (phone: string, name?: string) => {
  const a = await env.login(phone, name);
  await setBirth(a, "1990-05-20").expect(200);
  return a;
};

describe("wallet", () => {
  it("محفظة جديدة صفر + شحن تجريبي + ضبط PIN + دفع", async () => {
    const a = await login("01070000001", "ليلى");
    let w = await request(env.app).get("/wallet").set(a.auth).expect(200);
    expect(w.body).toMatchObject({ balance: 0, hasPin: false, txns: [] });
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: 500 }).expect(201);
    // من غير PIN ما ينفعش الدفع
    await pay(a, { service: "elec", account: "123456", amount: 100, pin: "1234", idempotencyKey: "key-00000001" }).expect(403);
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "1234" }).expect(204);
    const r = await pay(a, { service: "elec", account: "123456", amount: 100, pin: "1234", idempotencyKey: "key-00000001" }).expect(201);
    expect(r.body).toMatchObject({ amount: 100, balance: 400, kind: "bill" });
    w = await request(env.app).get("/wallet").set(a.auth);
    expect(w.body.balance).toBe(400);
    expect(w.body.txns).toHaveLength(2);
  });

  it("idempotency: نفس المفتاح مرتين = خصم مرة واحدة", async () => {
    const a = await login("01070000002");
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: 300 });
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "4321" });
    const body = { service: "net", account: "998877", amount: 100, pin: "4321", idempotencyKey: "same-key-0001" };
    const [x, y] = await Promise.all([pay(a, body), pay(a, body)]);
    expect([200, 201]).toContain(x.status);
    expect([200, 201]).toContain(y.status);
    expect(x.body.id).toBe(y.body.id);
    const w = await request(env.app).get("/wallet").set(a.auth);
    expect(w.body.balance).toBe(200);
  });

  it("رصيد غير كافي = 402 ولا يتغير الرصيد، وطلبين متوازيين ما يعمّقوش الرصيد تحت الصفر", async () => {
    const a = await login("01070000003");
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: 150 });
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "1111" });
    await pay(a, { service: "gas", account: "555555", amount: 500, pin: "1111", idempotencyKey: "big-key-0001" }).expect(402);
    const rs = await Promise.all([1, 2, 3].map((i) => pay(a, { service: "gas", account: "555555", amount: 100, pin: "1111", idempotencyKey: "par-key-000" + i })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    const w = await request(env.app).get("/wallet").set(a.auth);
    expect(w.body.balance).toBe(50);
  });

  it("PIN غلط 5 مرات يقفل المحفظة مؤقتًا حتى مع PIN صحيح", async () => {
    const a = await login("01070000004");
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: 500 });
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "2222" });
    for (let i = 0; i < 5; i++) await pay(a, { service: "elec", account: "123456", amount: 10, pin: "0000", idempotencyKey: "bad-key-000" + i }).expect(403);
    await pay(a, { service: "elec", account: "123456", amount: 10, pin: "2222", idempotencyKey: "good-key-001" }).expect(429);
  });

  it("الخصم بيتحسب على السيرفر: كود سليم، كود لخدمة تانية، كود غلط", async () => {
    const a = await login("01070000005");
    await env.ctx.db.offer.upsert({ where: { code: "RA10" }, update: {}, create: { code: "RA10", service: "elec,water", percent: 10, maxOff: "30" } });
    const q = await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "elec", amount: 200, code: "ra10" }).expect(200);
    expect(q.body).toEqual({ amount: 200, discount: 20, total: 180 });
    const cap = await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "water", amount: 1000, code: "RA10" });
    expect(cap.body.discount).toBe(30); // سقف الخصم
    await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "net", amount: 200, code: "RA10" }).expect(400);
    await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "elec", amount: 200, code: "NOPE" }).expect(400);
  });

  it("تغيير PIN يتطلب الحالي، ومفيش وصول من غير توكن، وإدخال سالب مرفوض", async () => {
    const a = await login("01070000006");
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "1234" }).expect(204);
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "9999" }).expect(403);
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "9999", currentPin: "1234" }).expect(204);
    await request(env.app).get("/wallet").expect(401);
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: -5 }).expect(400);
  });

  it("خدمة ١٨+: من غير تاريخ ميلاد مقفولة، القاصر مقفول، البالغ مفتوح، وباقي التطبيق مايتأثرش", async () => {
    const a = await env.login("01070000007", "كريم");
    // بنفضّي العمود عن قصد: التطبيق بقى ١٨+ وكل حساب جديد لازم تاريخ ميلاد، إنما
    // الحسابات القديمة (الـ ٨ في الإنتاج) مالهاش — وحارس المحفظة لازم يفضل يقفل عليها.
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });
    // تاريخ الميلاد غير محدد = مقفول (الأحوط)، والكود بيقول للمستخدم يعمل إيه
    const no = await request(env.app).get("/wallet").set(a.auth).expect(403);
    expect(no.body.code).toBe("birth_date_required");
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: 100 }).expect(403);

    // قاصر (١٢ سنة) = مقفول بكود مختلف
    const y = new Date().getUTCFullYear() - 12;
    await setBirth(a, `${y}-01-01`).expect(200);
    const minor = await request(env.app).get("/wallet").set(a.auth).expect(403);
    expect(minor.body.code).toBe("age_restricted");
    await request(env.app).post("/wallet/pay").set(a.auth).send({ service: "elec", account: "1", amount: 10, pin: "1234", idempotencyKey: "minor-key-01" }).expect(403);
    // لكن باقي التطبيق مفتوح للقاصر — الشات مش ١٨+
    await request(env.app).get("/threads").set(a.auth).expect(200);
    await request(env.app).get("/me").set(a.auth).expect(200);

    // بلغ ١٨ النهارده بالظبط = مفتوح
    const t = new Date();
    await setBirth(a, `${t.getUTCFullYear() - 18}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`).expect(200);
    const ok = await request(env.app).get("/wallet").set(a.auth).expect(200);
    expect(ok.body).toMatchObject({ balance: 0, hasPin: false });

    // تاريخ مستقبلي أو مستحيل مرفوض من /me نفسها
    await setBirth(a, `${t.getUTCFullYear() + 1}-01-01`).expect(400);
    await setBirth(a, "1850-01-01").expect(400);
  });

  it("الفئة ١٨–٢١: سقف العملية والرصيد ومجموع الشهر، و٢١+ بلا سقوف", async () => {
    const a = await env.login("01070000009", "شاب");
    await setBirth(a, `${new Date().getUTCFullYear() - 19}-03-15`).expect(200); // ١٩ سنة
    const auth = a.auth;
    const wallet = () => request(env.app).get("/wallet").set(auth);
    const topup = (amount: number) => request(env.app).post("/wallet/topup").set(auth).send({ amount });

    const w = await wallet().expect(200);
    expect(w.body.limits).toMatchObject({ tx: 500, balance: 1000, month: 2000, monthUsed: 0 });

    // سقف العملية الواحدة على الشحن
    expect((await topup(600).expect(403)).body.code).toBe("young_tx_limit");
    await topup(500).expect(201);
    await topup(500).expect(201); // الرصيد بقى ١٠٠٠ = السقف
    expect((await topup(100).expect(403)).body.code).toBe("young_balance_limit");

    // سقف العملية الواحدة على الدفع (على المبلغ بعد الخصم)
    await request(env.app).put("/wallet/pin").set(auth).send({ pin: "3333" }).expect(204);
    const p = (amount: number, key: string) => pay(a, { service: "elec", account: "123456", amount, pin: "3333", idempotencyKey: key });
    expect((await p(700, "young-key-001").expect(403)).body.code).toBe("young_tx_limit");
    await p(500, "young-key-002").expect(201);
    expect((await wallet()).body.limits.monthUsed).toBe(500);

    // مجموع الشهر: ٥٠٠ × ٤ = ٢٠٠٠، واللي بعدها مرفوض
    for (const i of [1, 2, 3]) { await topup(500).expect(201); await p(500, "young-month-00" + i).expect(201); }
    await topup(500).expect(201); // فيه رصيد كفاية، فالرفض سببه سقف الشهر مش الرصيد
    const over = await p(100, "young-month-004").expect(403);
    expect(over.body.code).toBe("young_month_limit");
    expect((await wallet()).body.limits.monthUsed).toBe(2000);
    expect((await wallet()).body.balance).toBe(1000); // الرصيد ما اتخصمش في العملية المرفوضة

    // ٢١+ مفيش سقوف خالص
    const old = await login("01070000010");
    const wo = await request(env.app).get("/wallet").set(old.auth).expect(200);
    expect(wo.body.limits).toBeNull();
    await request(env.app).post("/wallet/topup").set(old.auth).send({ amount: 5000 }).expect(201);
  });

  it("‏/me بيرجّع birthDate وisAdult", async () => {
    const a = await env.login("01070000008");
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } }); // حساب قديم
    const before = await request(env.app).get("/me").set(a.auth).expect(200);
    expect(before.body).toMatchObject({ birthDate: null, isAdult: false });
    const after = await setBirth(a, "1988-03-04").expect(200);
    expect(after.body).toMatchObject({ birthDate: "1988-03-04", isAdult: true });
  });

  /**
   * العطل: مجموع فواتير الشهر كان بيتحسب على **الشهر العالمي**، والقاهرة +02/+03.
   * فالفاتورة اللي بتتدفع بين ١٢ و٢–٣ الفجر أول الشهر بتخرج من الحساب بعد ساعتين،
   * والسقف ينفتح من جديد → ٤٠٠٠ جنيه في شهر سقفه ٢٠٠٠.
   */
  it("سقف الشهر بشهر القاهرة: فاتورة ١٢:٣٠ بالليل أول الشهر تفضل محسوبة الصبح", async () => {
    const a = await env.login("01070000011");
    await setBirth(a, "2007-03-15").expect(200); // ١٩ سنة → عليه سقوف
    await request(env.app).get("/wallet").set(a.auth).expect(200); // المحفظة اتعملت
    await env.ctx.db.walletTx.create({
      data: {
        userId: a.user.id, kind: "bill", service: "elec", amount: 500, ref: "cairo-month-bill",
        createdAt: new Date("2026-09-30T21:30:00Z"), // ١٢:٣٠ بالليل أول أكتوبر بتوقيت القاهرة
      },
    });

    // الساعة ٩ الصبح أول أكتوبر بالقاهرة: الشهر العالمي بدأ خلاص، وشهر القاهرة لسه هو هو
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T06:00:00Z") });
    try {
      const w = await request(env.app).get("/wallet").set(a.auth).expect(200);
      expect(w.body.limits.monthUsed).toBe(500); // بالحساب القديم كان بيطلع صفر
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * **مفيش أي مسار دفع مفتوح في الإنتاج — وده التزام منشور، مش تفصيلة.**
 *
 * `terms.html` (الإصدار ٢٫٣، بعد مراجعة المحامي) بيقول بالحرف إن أي **شراء رقمي
 * داخل التطبيق** يمرّ على **Google Play Billing** و**Apple In-App Purchase**، وإن
 * **«لا يوجد في التطبيق اليوم أي شراء رقمي داخلي»**. والشيء الوحيد اللي بيخلّي
 * الجملة دي صحيحة هو سطر واحد: `NODE_ENV === "production"` → 501 `no_gateway`.
 *
 * **والسطر ده مكانش متفحوصًا خالص** — كل اختبارات المحفظة بتشتغل بـ `NODE_ENV=test`
 * واللي فيه الشحن بيرجّع 201، فلو السطر اتشال أو اتغيّر شرطه، الطقم كله يفضل أخضر
 * والإنتاج يفتح شحنًا بلا بوابة: **مخالفة لشروطنا المنشورة ولسياسة مدفوعات بلاي**
 * (والعقوبة عندهم إزالة التطبيق مش تحذير)، ومعاها قانون ١٩٤/٢٠٢٠ لخدمات الدفع.
 *
 * فالاختبار ده **حارس مقصود** لحالة «مؤجّلة» (قرار داليا ١٥ أكتوبر ٢٠٢٦: تأجيل
 * ميزة الدفع). لو اتوصلت بوابة مرخّصة فعلًا، الاختبار ده هو المكان اللي بيتغيّر
 * فيه القرار — عن قصد، مش بالسهو.
 */
describe("الإنتاج: مفيش شحن محفظة بلا بوابة دفع مرخّصة", () => {
  const prodApp = () => createApp({ ...env.ctx, config: { ...env.ctx.config, NODE_ENV: "production" } });

  it("`POST /wallet/topup` بيرجّع 501 no_gateway في الإنتاج", async () => {
    const a = await login("01070000020", "منى");
    const r = await request(prodApp()).post("/wallet/topup").set(a.auth).send({ amount: 500 }).expect(501);
    expect(r.body.code).toBe("no_gateway");
  });

  it("ومابيضيفش ولا جنيه على الرصيد", async () => {
    const a = await login("01070000021");
    await request(prodApp()).post("/wallet/topup").set(a.auth).send({ amount: 999 }).expect(501);
    // الرفض قبل أي كتابة: الرصيد صفر ومفيش أي حركة
    const w = await request(env.app).get("/wallet").set(a.auth).expect(200);
    expect(w.body.balance).toBe(0);
    expect(w.body.txns).toHaveLength(0);
  });
});
