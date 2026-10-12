import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

/** تمييز الرسائل بنجمة — خاص بصاحبه تمامًا. */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const dm = async (a: { auth: Record<string, string> }, bId: string) =>
  (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [bId] }).expect(201)).body;
const say = async (a: { auth: Record<string, string> }, threadId: string, text: string) =>
  (await request(env.app).post(`/threads/${threadId}/messages`).set(a.auth).send({ text }).expect(201)).body;

describe("النجمة", () => {
  it("بتتحط وبتتشال وبتظهر في قايمة «المميّزة» وفي رسايل المحادثة", async () => {
    const a = await env.login("01093000001", "أ");
    const b = await env.login("01093000002", "ب");
    const th = await dm(a, b.user.id);
    const m = await say(b, th.id, "رسالة تستاهل نجمة");

    expect((await request(env.app).get("/me/starred").set(a.auth).expect(200)).body).toEqual([]);
    await request(env.app).put(`/messages/${m.id}/star`).set(a.auth).expect(204);
    await request(env.app).put(`/messages/${m.id}/star`).set(a.auth).expect(204); // التكرار مايكسرش

    const list = (await request(env.app).get("/me/starred").set(a.auth).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(m.id);
    expect(list[0].threadName).toBe("ب"); // اسم المحادثة عشان تعرف جاية منين
    // وبتبان على الرسالة نفسها في المحادثة
    const inThread = (await request(env.app).get(`/threads/${th.id}/messages`).set(a.auth).expect(200)).body;
    expect(inThread.find((x: { id: string }) => x.id === m.id).starred).toBe(true);

    await request(env.app).delete(`/messages/${m.id}/star`).set(a.auth).expect(204);
    expect((await request(env.app).get("/me/starred").set(a.auth).expect(200)).body).toEqual([]);
  });

  it("نجمتي مش بتبان لحد تاني — ولا لصاحب الرسالة", async () => {
    const a = await env.login("01093000003", "ج");
    const b = await env.login("01093000004", "د");
    const th = await dm(a, b.user.id);
    const m = await say(b, th.id, "رسالة من ب");
    await request(env.app).put(`/messages/${m.id}/star`).set(a.auth).expect(204);

    expect((await request(env.app).get("/me/starred").set(b.auth).expect(200)).body).toEqual([]);
    const forB = (await request(env.app).get(`/threads/${th.id}/messages`).set(b.auth).expect(200)).body;
    expect(forB.find((x: { id: string }) => x.id === m.id).starred).toBe(false);
  });

  it("مش عضو في المحادثة = مايقدرش يميّز", async () => {
    const a = await env.login("01093000005", "هـ");
    const b = await env.login("01093000006", "و");
    const outsider = await env.login("01093000007", "برّه");
    const th = await dm(a, b.user.id);
    const m = await say(a, th.id, "كلام خاص");
    await request(env.app).put(`/messages/${m.id}/star`).set(outsider.auth).expect(403);
    expect((await request(env.app).get("/me/starred").set(outsider.auth).expect(200)).body).toEqual([]);
  });

  it("الرسالة المحذوفة بتختفي من المميّزة", async () => {
    const a = await env.login("01093000008", "ز");
    const b = await env.login("01093000009", "ح");
    const th = await dm(a, b.user.id);
    const m = await say(a, th.id, "هتتمسح");
    await request(env.app).put(`/messages/${m.id}/star`).set(a.auth).expect(204);
    expect((await request(env.app).get("/me/starred").set(a.auth).expect(200)).body).toHaveLength(1);
    await request(env.app).delete(`/messages/${m.id}`).set(a.auth).expect(204);
    expect((await request(env.app).get("/me/starred").set(a.auth).expect(200)).body).toEqual([]);
  });

  it("رسايل اللي حظرته مابتظهرش في المميّزة", async () => {
    const a = await env.login("01093000010", "ط");
    const b = await env.login("01093000011", "ي");
    const th = await dm(a, b.user.id);
    const m = await say(b, th.id, "قبل الحظر");
    await request(env.app).put(`/messages/${m.id}/star`).set(a.auth).expect(204);
    expect((await request(env.app).get("/me/starred").set(a.auth).expect(200)).body).toHaveLength(1);
    await request(env.app).post("/blocks").set(a.auth).send({ userId: b.user.id }).expect(204);
    expect((await request(env.app).get("/me/starred").set(a.auth).expect(200)).body).toEqual([]);
  });
});
