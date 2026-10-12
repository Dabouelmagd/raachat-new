import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as client } from "socket.io-client";
import { startTestEnv } from "./helpers.js";

/**
 * تلات حالات للرسالة اللي بعتها: **اتبعتت** (✓) · **وصلت** لجهاز الطرف التاني
 * (✓✓ رمادي) · **اتقرت** (✓✓ أزرق). قبل كده كان فيه حالتين بس.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const mine = async (a: { auth: Record<string, string> }, threadId: string, id: string) =>
  ((await request(env.app).get(`/threads/${threadId}/messages`).set(a.auth).expect(200)).body as { id: string; delivered?: boolean; read?: boolean }[])
    .find((m) => m.id === id)!;

describe("علامات الوصول والقراءة", () => {
  it("اتبعتت → وصلت لما يتصل → اتقرت لما يفتح", async () => {
    const a = await env.login("01095000001", "أ");
    const b = await env.login("01095000002", "ب");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    const m = (await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "وصلت؟" }).expect(201)).body;

    // ب لسه ما اتصلش ولا فتح: اتبعتت بس
    let v = await mine(a, th.id, m.id);
    expect(v.delivered).toBe(false);
    expect(v.read).toBe(false);

    // جهاز ب اتصل → وصلت
    const sock = client(`http://localhost:${env.port}`, { auth: { token: b.token } });
    await new Promise<void>((r) => sock.on("connect", () => r()));
    await new Promise((r) => setTimeout(r, 300));
    v = await mine(a, th.id, m.id);
    expect(v.delivered).toBe(true);
    expect(v.read).toBe(false); // وصلت بس لسه ما اتقرتش

    // ب فتح المحادثة وعلّمها مقروءة → اتقرت
    await request(env.app).post(`/threads/${th.id}/read`).set(b.auth).expect(204);
    v = await mine(a, th.id, m.id);
    expect(v.read).toBe(true);
    expect(v.delivered).toBe(true); // اللي اتقرت وصلت بالضرورة
    sock.close();
  }, 20_000);

  it("الطرف التاني بيتبلّغ على السوكت إن الرسايل وصلت", async () => {
    const a = await env.login("01095000003", "ج");
    const b = await env.login("01095000004", "د");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "استنى العلامة" }).expect(201);

    const watcher = client(`http://localhost:${env.port}`, { auth: { token: a.token } });
    await new Promise<void>((r) => watcher.on("connect", () => r()));
    const ev = new Promise<{ threadId: string }>((r) => watcher.once("delivered", r));

    const bSock = client(`http://localhost:${env.port}`, { auth: { token: b.token } });
    await new Promise<void>((r) => bSock.on("connect", () => r()));
    expect((await ev).threadId).toBe(th.id);
    watcher.close();
    bSock.close();
  }, 20_000);

  it("فتح المحادثة لوحده بيخلّيها «وصلت» حتى من غير سوكت", async () => {
    const a = await env.login("01095000005", "هـ");
    const b = await env.login("01095000006", "و");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    const m = (await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "من غير سوكت" }).expect(201)).body;
    expect((await mine(a, th.id, m.id)).delivered).toBe(false);

    await request(env.app).get(`/threads/${th.id}/messages`).set(b.auth).expect(200);
    expect((await mine(a, th.id, m.id)).delivered).toBe(true);
  });

  it("في الجروب: لازم **كل** الباقيين تكون وصلتهم", async () => {
    const a = await env.login("01095000007", "صاحب");
    const b = await env.login("01095000008", "عضو١");
    const c = await env.login("01095000009", "عضو٢");
    const g = (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name: "جروب الوصول", memberIds: [b.user.id, c.user.id] }).expect(201)).body;
    const m = (await request(env.app).post(`/threads/${g.id}/messages`).set(a.auth).send({ text: "للكل" }).expect(201)).body;

    await request(env.app).get(`/threads/${g.id}/messages`).set(b.auth).expect(200);
    expect((await mine(a, g.id, m.id)).delivered).toBe(false); // واحد بس

    await request(env.app).get(`/threads/${g.id}/messages`).set(c.auth).expect(200);
    expect((await mine(a, g.id, m.id)).delivered).toBe(true); // الاتنين
  });
});

describe("عدّاد غير المقروء", () => {
  it("بيعد رسايل الطرف التاني بس، وبيصفّر بعد القراية", async () => {
    const a = await env.login("01095000020", "ح");
    const b = await env.login("01095000021", "ط");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    const unreadFor = async (who: { auth: Record<string, string> }) =>
      ((await request(env.app).get("/threads").set(who.auth).expect(200)).body as { id: string; unread: number }[]).find((t) => t.id === th.id)!.unread;

    expect(await unreadFor(a)).toBe(0);
    await request(env.app).post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "١" }).expect(201);
    await request(env.app).post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "٢" }).expect(201);
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "رسالتي أنا" }).expect(201);

    expect(await unreadFor(a)).toBe(2); // رسالتي مش محسوبة
    expect(await unreadFor(b)).toBe(1); // اللي بعتهالها أ

    await request(env.app).post(`/threads/${th.id}/read`).set(a.auth).expect(204);
    expect(await unreadFor(a)).toBe(0);
    expect(await unreadFor(b)).toBe(1); // قراءتي مابتأثرش عليها
  });

  it("رسايل اللي حظرته مش محسوبة في غير المقروء", async () => {
    const a = await env.login("01095000022", "ي");
    const b = await env.login("01095000023", "ك");
    const g = (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name: "جروب الحظر", memberIds: [b.user.id] }).expect(201)).body;
    await request(env.app).post(`/threads/${g.id}/messages`).set(b.auth).send({ text: "قبل الحظر" }).expect(201);
    const unreadA = async () => ((await request(env.app).get("/threads").set(a.auth).expect(200)).body as { id: string; unread: number }[]).find((t) => t.id === g.id)!.unread;
    expect(await unreadA()).toBe(1);
    await request(env.app).post("/blocks").set(a.auth).send({ userId: b.user.id }).expect(204);
    expect(await unreadA()).toBe(0);
  });
});
