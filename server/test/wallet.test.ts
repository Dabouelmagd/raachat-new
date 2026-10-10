import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const pay = (a: any, body: any) => request(env.app).post("/wallet/pay").set(a.auth).send(body);

describe("wallet", () => {
  it("محفظة جديدة صفر + شحن تجريبي + ضبط PIN + دفع", async () => {
    const a = await env.login("01070000001", "ليلى");
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
    const a = await env.login("01070000002");
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
    const a = await env.login("01070000003");
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: 150 });
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "1111" });
    await pay(a, { service: "gas", account: "555555", amount: 500, pin: "1111", idempotencyKey: "big-key-0001" }).expect(402);
    const rs = await Promise.all([1, 2, 3].map((i) => pay(a, { service: "gas", account: "555555", amount: 100, pin: "1111", idempotencyKey: "par-key-000" + i })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    const w = await request(env.app).get("/wallet").set(a.auth);
    expect(w.body.balance).toBe(50);
  });

  it("PIN غلط 5 مرات يقفل المحفظة مؤقتًا حتى مع PIN صحيح", async () => {
    const a = await env.login("01070000004");
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: 500 });
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "2222" });
    for (let i = 0; i < 5; i++) await pay(a, { service: "elec", account: "123456", amount: 10, pin: "0000", idempotencyKey: "bad-key-000" + i }).expect(403);
    await pay(a, { service: "elec", account: "123456", amount: 10, pin: "2222", idempotencyKey: "good-key-001" }).expect(429);
  });

  it("الخصم بيتحسب على السيرفر: كود سليم، كود لخدمة تانية، كود غلط", async () => {
    const a = await env.login("01070000005");
    await env.ctx.db.offer.upsert({ where: { code: "RA10" }, update: {}, create: { code: "RA10", service: "elec,water", percent: 10, maxOff: "30" } });
    const q = await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "elec", amount: 200, code: "ra10" }).expect(200);
    expect(q.body).toEqual({ amount: 200, discount: 20, total: 180 });
    const cap = await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "water", amount: 1000, code: "RA10" });
    expect(cap.body.discount).toBe(30); // سقف الخصم
    await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "net", amount: 200, code: "RA10" }).expect(400);
    await request(env.app).post("/wallet/quote").set(a.auth).send({ service: "elec", amount: 200, code: "NOPE" }).expect(400);
  });

  it("تغيير PIN يتطلب الحالي، ومفيش وصول من غير توكن، وإدخال سالب مرفوض", async () => {
    const a = await env.login("01070000006");
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "1234" }).expect(204);
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "9999" }).expect(403);
    await request(env.app).put("/wallet/pin").set(a.auth).send({ pin: "9999", currentPin: "1234" }).expect(204);
    await request(env.app).get("/wallet").expect(401);
    await request(env.app).post("/wallet/topup").set(a.auth).send({ amount: -5 }).expect(400);
  });
});
