import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as client, type Socket } from "socket.io-client";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const connect = async (token: string) => {
  const s = client(`http://localhost:${env.port}`, { auth: { token } });
  await new Promise<void>((r) => s.on("connect", () => r()));
  return s;
};
const emit = <T = any>(s: Socket, ev: string, p: unknown) => new Promise<T>((r) => s.emit(ev, p, r));
const sub = (n: string) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("web push", () => {
  it("مفتاح VAPID العام + اشتراك + إلغاء + حد الأجهزة", async () => {
    const a = await env.login("01096000001", "دالية");
    expect((await request(env.app).get("/push/key").set(a.auth)).body.publicKey).toBe("test-public-key");
    await request(env.app).get("/push/key").expect(401);
    await request(env.app).post("/push/subscribe").set(a.auth).send({ endpoint: "bad", keys: {} }).expect(400);
    await request(env.app).post("/push/subscribe").set(a.auth).send(sub("x1")).expect(204);
    await request(env.app).post("/push/subscribe").set(a.auth).send(sub("x1")).expect(204); // idempotent
    expect(await env.ctx.db.pushSub.count({ where: { userId: a.user.id } })).toBe(1);
    await request(env.app).post("/push/unsubscribe").set(a.auth).send({ endpoint: sub("x1").endpoint }).expect(204);
    expect(await env.ctx.db.pushSub.count({ where: { userId: a.user.id } })).toBe(0);
    for (let i = 0; i < 12; i++) { await request(env.app).post("/push/subscribe").set(a.auth).send(sub(`d${i}`)).expect(204); await wait(5); }
    expect(await env.ctx.db.pushSub.count({ where: { userId: a.user.id } })).toBe(10);
  });

  it("رسالة لمستخدم أوفلاين = إشعار؛ أونلاين = مفيش؛ المؤلف مبيستلمش", async () => {
    const a = await env.login("01096000011", "المرسلة"); const b = await env.login("01096000012", "المستقبل");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await request(env.app).post("/push/subscribe").set(b.auth).send(sub("b-phone")).expect(204);
    await request(env.app).post("/push/subscribe").set(a.auth).send(sub("a-phone")).expect(204);
    env.pushed.length = 0;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "أهلا يا باشا" }).expect(201);
    await wait(300);
    expect(env.pushed).toHaveLength(1);
    expect(env.pushed[0].sub.endpoint).toBe(sub("b-phone").endpoint);
    expect(env.pushed[0].payload).toMatchObject({ kind: "message", title: "المرسلة", body: "أهلا يا باشا", threadId: th.id });
    // b أونلاين → مفيش push
    const sb = await connect(b.token);
    env.pushed.length = 0;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "تاني" }).expect(201);
    await wait(300);
    expect(env.pushed).toHaveLength(0);
    sb.close();
  });

  it("جروب: العنوان اسم الجروب والجسم 'الاسم: النص'", async () => {
    const a = await env.login("01096000021", "منى"); const b = await env.login("01096000022", "كريم");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name: "الشغل", memberIds: [b.user.id] })).body;
    await request(env.app).post("/push/subscribe").set(b.auth).send(sub("k1")).expect(204);
    env.pushed.length = 0;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "اجتماع بكرة" }).expect(201);
    await wait(300);
    expect(env.pushed[0].payload).toMatchObject({ title: "الشغل", body: "منى: اجتماع بكرة" });
  });

  it("اشتراك ميت (410) بيتمسح", async () => {
    const a = await env.login("01096000031", "أ"); const b = await env.login("01096000032", "ب");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await request(env.app).post("/push/subscribe").set(b.auth).send(sub("dead1")).expect(204);
    env.dead.add(sub("dead1").endpoint);
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "x" }).expect(201);
    await wait(300);
    expect(await env.ctx.db.pushSub.count({ where: { userId: b.user.id } })).toBe(0);
  });

  it("مكالمة لأوفلاين: من غير اشتراك = offline؛ باشتراك = push + call:pending عند الاتصال + فائتة", async () => {
    const a = await env.login("01096000041", "المتصلة"); const b = await env.login("01096000042", "المتلقي");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    const sa = await connect(a.token);
    expect((await emit(sa, "call:invite", { threadId: th.id, mode: "voice" })).error).toBe("offline");
    await request(env.app).post("/push/subscribe").set(b.auth).send(sub("callee")).expect(204);
    env.pushed.length = 0;
    const inv = await emit(sa, "call:invite", { threadId: th.id, mode: "video" });
    expect(inv.callId).toBeTruthy();
    await wait(300);
    expect(env.pushed[0].payload).toMatchObject({ kind: "call", title: "المتصلة", body: "مكالمة فيديو واردة", callId: inv.callId });
    // المتلقي فتح التطبيق من الإشعار
    const sb = await connect(b.token);
    const pend = await emit(sb, "call:pending", {});
    expect(pend.call).toMatchObject({ callId: inv.callId, mode: "video", fromName: "المتصلة" });
    const acc = new Promise((r) => sa.once("call:accepted", r));
    await emit(sb, "call:answer", { callId: inv.callId, accept: true });
    await acc;
    expect((await emit(sb, "call:pending", {})).call).toBeNull();
    sa.emit("call:end", { callId: inv.callId });
    await wait(200);
    // مكالمة تانية تفوت: المتلقي مقفل التطبيق
    sb.close(); await wait(200);
    env.pushed.length = 0;
    const inv2 = await emit(sa, "call:invite", { threadId: th.id, mode: "voice" });
    await wait(200);
    sa.emit("call:end", { callId: inv2.callId }); // المتصل قفل قبل الرد
    await wait(400);
    expect(env.pushed.map((p) => p.payload.kind)).toEqual(["call", "missed"]);
    expect(env.pushed[1].payload.tag).toBe(env.pushed[0].payload.tag); // بيستبدل إشعار الرنين
    sa.close();
  });
});
