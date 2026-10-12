import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as client } from "socket.io-client";
import { startTestEnv } from "./helpers.js";
import { clearRoomPresence, sweepRoomPresence } from "../src/routes/rooms.js";

/**
 * «المستمعين الأشباح»: وجود المشارك في الغرفة = اتصال سوكت حيّ، والاتصالات دي
 * في ذاكرة العملية. فأي صف حضور باقي من قبل إعادة التشغيل (كل نشر!) أو من
 * `disconnect` ضايع = شخص موجود في الغرفة وهو مش موجود — والغرفة ممكن توصل
 * «مكتملة» بناس مش فيها.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const makeRoom = async (a: { auth: Record<string, string> }, name: string) =>
  (await request(env.app).post("/rooms").set(a.auth).send({ name }).expect(201)).body;
const countIn = async (a: { auth: Record<string, string> }, roomId: string) =>
  ((await request(env.app).get("/rooms").set(a.auth).expect(200)).body as { id: string; count: number }[]).find((r) => r.id === roomId)?.count;

describe("أشباح الغرف", () => {
  it("إعادة تشغيل الـ api بتمسح كل الحضور القديم", async () => {
    const a = await env.login("01094000001", "أ");
    const b = await env.login("01094000002", "ب");
    const room = await makeRoom(a, "غرفة الأشباح");
    await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "real" }).expect(200);
    await request(env.app).post(`/rooms/${room.id}/join`).set(b.auth).send({ identity: "temp" }).expect(200);
    expect(await countIn(a, room.id)).toBe(2);

    // زي ما بيحصل في كل نشر: العملية بتقوم من جديد والصفوف لسه في القاعدة
    expect(await clearRoomPresence(env.ctx)).toBe(2);
    expect(await countIn(a, room.id)).toBe(0);
  });

  it("الكنس بيشيل اللي مالوش سوكت **وبس** — واللي متصل بيفضل", async () => {
    const live = await env.login("01094000003", "متصل");
    const ghost = await env.login("01094000004", "شبح");
    const room = await makeRoom(live, "غرفة فيها واحد حقيقي");
    await request(env.app).post(`/rooms/${room.id}/join`).set(live.auth).send({ identity: "real" }).expect(200);
    await request(env.app).post(`/rooms/${room.id}/join`).set(ghost.auth).send({ identity: "real" }).expect(200);
    expect(await countIn(live, room.id)).toBe(2);

    const sock = client(`http://localhost:${env.port}`, { auth: { token: live.token } });
    await new Promise<void>((r) => sock.on("connect", () => r()));

    expect(await sweepRoomPresence(env.ctx)).toBe(1); // الشبح بس
    expect(await countIn(live, room.id)).toBe(1);
    // واللي متصل لسه جوّه فعلًا
    const mine = (await request(env.app).get("/rooms").set(live.auth)).body.find((r: { id: string }) => r.id === room.id);
    expect(mine.joined).toBe(true);

    sock.close();
  }, 20_000);

  it("الكنس بيبلّغ قايمة الغرف إن الغرفة اتغيّرت", async () => {
    const a = await env.login("01094000005", "ج");
    const watcher = await env.login("01094000006", "مراقب");
    const room = await makeRoom(a, "غرفة للتبليغ");
    await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "real" }).expect(200);

    const sock = client(`http://localhost:${env.port}`, { auth: { token: watcher.token } });
    await new Promise<void>((r) => sock.on("connect", () => r()));
    const changed = new Promise<{ id: string }>((r) => sock.once("room:changed", r));

    expect(await sweepRoomPresence(env.ctx)).toBe(1); // «أ» مالوش سوكت
    expect((await changed).id).toBe(room.id);
    sock.close();
  }, 20_000);

  it("مفيش حضور = الكنس مابيعملش حاجة", async () => {
    await clearRoomPresence(env.ctx);
    expect(await sweepRoomPresence(env.ctx)).toBe(0);
  });
});
