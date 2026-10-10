import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as client } from "socket.io-client";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

describe("rooms", () => {
  it("إنشاء/دخول بهوية حقيقية ومؤقتة — المؤقتة ما بتكشفش الاسم ولا الـ userId", async () => {
    const owner = await env.login("01080000001", "المضيفة");
    const guest = await env.login("01080000002", "ضيف سري");
    const room = (await request(env.app).post("/rooms").set(owner.auth).send({ name: "غرفة الأخبار" }).expect(201)).body;
    expect(room).toMatchObject({ createdByMe: true, joined: false, count: 0 });
    await request(env.app).post(`/rooms/${room.id}/join`).set(owner.auth).send({ identity: "real" }).expect(200);
    const g = await request(env.app).post(`/rooms/${room.id}/join`).set(guest.auth).send({ identity: "temp" }).expect(200);
    expect(g.body).toMatchObject({ joined: true, myIdentityMode: "temp", count: 2 });
    // المضيفة بتشوف الضيف بهوية مؤقتة
    const seenByOwner = (await request(env.app).get("/rooms").set(owner.auth)).body.find((x: any) => x.id === room.id);
    const p = seenByOwner.participants[0];
    expect(JSON.stringify(seenByOwner)).not.toContain("ضيف سري");
    expect(JSON.stringify(seenByOwner)).not.toContain(guest.user.id);
    expect(p.isHost).toBe(false);
    // الضيف بيشوف المضيفة باسمها الحقيقي وبعلامة host
    expect(g.body.participants[0]).toMatchObject({ name: "المضيفة", isHost: true });
  });

  it("غرفة واحدة في نفس الوقت، كتم، مغادرة، وصاحب الغرفة بس يقفلها", async () => {
    const a = await env.login("01080000003", "أ");
    const b = await env.login("01080000004", "ب");
    const r1 = (await request(env.app).post("/rooms").set(a.auth).send({ name: "١" })).body;
    const r2 = (await request(env.app).post("/rooms").set(a.auth).send({ name: "٢" })).body;
    await request(env.app).post(`/rooms/${r1.id}/join`).set(b.auth).send({ identity: "real" }).expect(200);
    await request(env.app).put(`/rooms/${r1.id}/mute`).set(b.auth).send({ muted: true }).expect(204);
    await request(env.app).put(`/rooms/${r2.id}/mute`).set(b.auth).send({ muted: true }).expect(403); // مش جوّاها
    await request(env.app).post(`/rooms/${r2.id}/join`).set(b.auth).send({ identity: "real" }).expect(200);
    const list = (await request(env.app).get("/rooms").set(b.auth)).body;
    expect(list.filter((x: any) => x.joined)).toHaveLength(1);
    expect(list.find((x: any) => x.id === r1.id).count).toBe(0);
    await request(env.app).delete(`/rooms/${r2.id}`).set(b.auth).expect(403);
    await request(env.app).delete(`/rooms/${r2.id}`).set(a.auth).expect(204);
    await request(env.app).post(`/rooms/${r2.id}/join`).set(b.auth).send({ identity: "real" }).expect(404);
  });

  it("realtime: room:changed بيوصل، وقفل الاتصال بيشيل المستخدم من الغرفة", async () => {
    const a = await env.login("01080000005", "س");
    const room = (await request(env.app).post("/rooms").set(a.auth).send({ name: "حيّة" })).body;
    const b = await env.login("01080000006", "ص");
    const watcher = client(`http://localhost:${env.port}`, { auth: { token: a.token } });
    const bs = client(`http://localhost:${env.port}`, { auth: { token: b.token } });
    await Promise.all([new Promise<void>((r) => watcher.on("connect", () => r())), new Promise<void>((r) => bs.on("connect", () => r()))]);
    const ev = new Promise<any>((r) => watcher.once("room:changed", r));
    await request(env.app).post(`/rooms/${room.id}/join`).set(b.auth).send({ identity: "real" });
    expect((await ev).id).toBe(room.id);
    const gone = new Promise<any>((r) => watcher.once("room:changed", r));
    bs.close();
    await gone;
    const after = (await request(env.app).get("/rooms").set(a.auth)).body.find((x: any) => x.id === room.id);
    expect(after.count).toBe(0);
    watcher.close();
  });
});

describe("ads", () => {
  it("تسجيل الظهور مرة واحدة لكل موعد في اليوم، ورفض مدخلات غلط", async () => {
    const a = await env.login("01080000010");
    const ev = { day: "2026-10-10", slot: 2, adId: "a3", kind: "shown" };
    await request(env.app).post("/ads/events").set(a.auth).send(ev).expect(204);
    await request(env.app).post("/ads/events").set(a.auth).send(ev).expect(204);
    await request(env.app).post("/ads/events").set(a.auth).send({ ...ev, slot: 0 }).expect(204);
    await request(env.app).post("/ads/events").set(a.auth).send({ ...ev, kind: "clicked" }).expect(204);
    const t = await request(env.app).get("/ads/today?day=2026-10-10").set(a.auth).expect(200);
    expect(t.body.shown.sort()).toEqual([0, 2]);
    expect((await request(env.app).get("/ads/today?day=2026-10-11").set(a.auth)).body.shown).toEqual([]);
    await request(env.app).post("/ads/events").set(a.auth).send({ ...ev, day: "x'; drop" }).expect(400);
  });
});

describe("search", () => {
  it("بحث في رسائل المستخدم بس، بتوحيد عربي، وبيتجاهل % و _ ", async () => {
    const a = await env.login("01080000020", "منى المصري");
    const b = await env.login("01080000021", "كريم");
    const c = await env.login("01080000022", "غريب");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "اجتماع المُهندسين الأسبوع الجاي" }).expect(201);
    await request(env.app).post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "خصم 50% على الفاتورة" }).expect(201);
    const th2 = (await request(env.app).post("/threads").set(c.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await request(env.app).post(`/threads/${th2.id}/messages`).set(c.auth).send({ text: "سرّي: اجتماع المهندسين" }).expect(201);

    const r = await request(env.app).get("/search").query({ q: "المهندسين" }).set(a.auth).expect(200);
    expect(r.body.messages).toHaveLength(1); // التشكيل اتشال، ورسائل غيري مش بتظهر
    expect(r.body.messages[0].threadId).toBe(th.id);
    expect((await request(env.app).get("/search").query({ q: "50%" }).set(a.auth)).body.messages).toHaveLength(1);
    expect((await request(env.app).get("/search").query({ q: "%%" }).set(a.auth)).body.messages).toHaveLength(0);
    expect((await request(env.app).get("/search").query({ q: "مصرى", kinds: "person" }).set(b.auth)).body.people[0].name).toBe("منى المصري");
    await request(env.app).get("/search").query({ q: "ا" }).set(a.auth).expect(400);
    await request(env.app).get("/search").query({ q: "اجتماع" }).expect(401);
  });
});
