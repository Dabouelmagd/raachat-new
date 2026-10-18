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

/**
 * 🔴 **البثّ اللحظي لحالات الرسالة — العطل اللي الأعمدة وحدها مابتكشفوش.**
 *
 * الاختبارات اللي فوق بتفحص الأعمدة والردود، فكانت كلها خضراء و**العلامة عند
 * الباعت مابتتحرّكش**: السيرفر بيبثّ `delivered` و**الواجهة مش سامعاه**،
 * والقراءة **مكانش لها بثّ خالص**. يعني تبعت، الطرف التاني يقرا قدامك، وانت
 * شايف ✓ لحد ما تعمل تحديث — ومفيش أي خطأ في أي مكان.
 *
 * اتكشف بتجربة حقيقية بمتصفحين (`test/manual/message-states.ts`، في الـ CI)
 * في ١٨ أكتوبر ٢٠٢٦. والاختبار ده بيثبّت جهة السيرفر **على السوكت نفسه** —
 * مش على عمود في القاعدة، لأن العمود كان صح والبثّ هو اللي ناقص.
 */
describe("بثّ حالات الرسالة على السوكت", () => {
  it("🔴 فتح المحادثة بيبثّ `read` للباعت — وصاحب القراءة مابيوصلوش", async () => {
    const a = await env.login("01099000041", "داليا");
    const b = await env.login("01099000042", "مريم");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "علامة" }).expect(201);

    const socks = await Promise.all([a, b].map(async (who) => {
      const sk = client(`http://localhost:${env.port}`, { auth: { token: who.token } });
      await new Promise<void>((r) => sk.on("connect", () => r()));
      return sk;
    }));
    const got: Record<string, { threadId: string; at: string }[]> = { a: [], b: [] };
    socks[0]!.on("read", (p: { threadId: string; at: string }) => got.a.push(p));
    socks[1]!.on("read", (p: { threadId: string; at: string }) => got.b.push(p));

    await request(env.app).post(`/threads/${th.id}/read`).set(b.auth).expect(204);
    await new Promise<void>((r) => {
      const t = setInterval(() => { if (got.a.length) { clearInterval(t); r(); } }, 20);
      setTimeout(() => { clearInterval(t); r(); }, 4000); // مايعلّقش الطقم لو البثّ مش موجود
    });
    socks.forEach((sk) => sk.close());

    expect(got.a.length, "القراءة مابتتبثّش للباعت — علامته هتفضل ✓ لحد التحديث").toBeGreaterThan(0);
    expect(got.a[0]!.threadId).toBe(th.id);
    expect(Date.parse(got.a[0]!.at)).toBeGreaterThan(0);
    expect(got.b.length, "صاحب القراءة مش محتاج يعرف إنه قرا بنفسه").toBe(0);
  });
});
