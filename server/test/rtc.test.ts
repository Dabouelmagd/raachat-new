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
const once = <T = any>(s: Socket, ev: string) => new Promise<T>((r) => s.once(ev, r));
const emit = <T = any>(s: Socket, ev: string, p: unknown) => new Promise<T>((r) => s.emit(ev, p, r));
async function pair(pa: string, pb: string) {
  const a = await env.login(pa, "المتصلة"); const b = await env.login(pb, "المتلقي");
  const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
  const sa = await connect(a.token); const sb = await connect(b.token);
  return { a, b, th, sa, sb, close: () => { sa.close(); sb.close(); } };
}

describe("1:1 calls signaling", () => {
  it("مكالمة كاملة: رنين → قبول → تبادل signal → إنهاء، والسجل بيتكتب للطرفين", async () => {
    const { a, b, th, sa, sb, close } = await pair("01095000001", "01095000002");
    const incoming = once(sb, "call:incoming");
    const inv = await emit(sa, "call:invite", { threadId: th.id, mode: "video" });
    expect(inv.callId).toBeTruthy();
    expect(await incoming).toMatchObject({ callId: inv.callId, mode: "video", fromName: "المتصلة" });
    const accepted = once(sa, "call:accepted");
    await emit(sb, "call:answer", { callId: inv.callId, accept: true });
    await accepted;
    const offerAtB = once(sb, "call:signal");
    sa.emit("call:signal", { callId: inv.callId, data: { type: "offer", sdp: "x" } });
    expect((await offerAtB).data.type).toBe("offer");
    const answerAtA = once(sa, "call:signal");
    sb.emit("call:signal", { callId: inv.callId, data: { type: "answer", sdp: "y" } });
    expect((await answerAtA).data.type).toBe("answer");
    await new Promise((r) => setTimeout(r, 1100));
    const ended = once(sb, "call:ended");
    sa.emit("call:end", { callId: inv.callId });
    expect((await ended).reason).toBe("ended");
    await new Promise((r) => setTimeout(r, 300));
    const la = (await request(env.app).get("/calls").set(a.auth)).body;
    const lb = (await request(env.app).get("/calls").set(b.auth)).body;
    expect(la[0]).toMatchObject({ dir: "out", mode: "video" }); expect(la[0].dur).toBeGreaterThanOrEqual(1);
    expect(lb[0]).toMatchObject({ dir: "in" });
    close();
  });

  it("رفض، مشغول، أوفلاين، وغير عضو", async () => {
    const { a, th, sa, sb, close } = await pair("01095000003", "01095000004");
    const inv = await emit(sa, "call:invite", { threadId: th.id, mode: "voice" });
    const rej = once(sa, "call:ended");
    await emit(sb, "call:answer", { callId: inv.callId, accept: false });
    expect((await rej).reason).toBe("rejected");
    await new Promise((r) => setTimeout(r, 200));
    // مشغول: نفس المتصل يتصل تاني أثناء رنين
    const inv2 = await emit(sa, "call:invite", { threadId: th.id, mode: "voice" });
    expect((await emit(sa, "call:invite", { threadId: th.id, mode: "voice" })).error).toBe("busy");
    sa.emit("call:end", { callId: inv2.callId });
    // غريب مش عضو
    const out = await env.login("01095000005", "غريب"); const so = await connect(out.token);
    await new Promise((r) => setTimeout(r, 200));
    expect((await emit(so, "call:invite", { threadId: th.id, mode: "voice" })).error).toBe("forbidden");
    // signal من غريب على مكالمة مش بتاعته بيتجاهل
    const inv3 = await emit(sa, "call:invite", { threadId: th.id, mode: "voice" });
    await emit(sb, "call:answer", { callId: inv3.callId, accept: true });
    let leaked = false; sb.on("call:signal", () => (leaked = true));
    so.emit("call:signal", { callId: inv3.callId, data: { type: "offer" } });
    await new Promise((r) => setTimeout(r, 300));
    expect(leaked).toBe(false);
    // أوفلاين
    sb.close(); await new Promise((r) => setTimeout(r, 300));
    sa.emit("call:end", { callId: inv3.callId });
    await new Promise((r) => setTimeout(r, 300));
    expect((await emit(sa, "call:invite", { threadId: th.id, mode: "voice" })).error).toBe("offline");
    expect(a.user.id).toBeTruthy();
    so.close(); close();
  });

  it("مفيش رد → missed للطرفين (timeout)، وانقطاع الاتصال بينهي المكالمة", async () => {
    const { b, th, sa, sb, close } = await pair("01095000006", "01095000007");
    (env.ctx.config as any).RING_TIMEOUT_MS = 400;
    const inv = await emit(sa, "call:invite", { threadId: th.id, mode: "voice" });
    expect((await once(sa, "call:ended")).reason).toBe("missed");
    await new Promise((r) => setTimeout(r, 300));
    expect((await request(env.app).get("/calls").set(b.auth)).body[0]).toMatchObject({ dir: "missed" });
    (env.ctx.config as any).RING_TIMEOUT_MS = 45000;
    const inv2 = await emit(sa, "call:invite", { threadId: th.id, mode: "voice" });
    await emit(sb, "call:answer", { callId: inv2.callId, accept: true });
    const dropped = once(sb, "call:ended");
    sa.close();
    expect((await dropped).reason).toBe("dropped");
    expect(inv.callId).toBeTruthy(); sb.close();
  });
});

describe("room mesh signaling + ICE", () => {
  it("rtc:join بيرجّع الأقران، السيرفر بيمرّر signal بالـ peerId بدون userId، وغير المشارك مرفوض", async () => {
    const a = await env.login("01095000010", "س"); const b = await env.login("01095000011", "ص"); const c = await env.login("01095000012", "ع");
    const room = (await request(env.app).post("/rooms").set(a.auth).send({ name: "mesh" })).body;
    await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "real" });
    await request(env.app).post(`/rooms/${room.id}/join`).set(b.auth).send({ identity: "temp" });
    const [sa, sb, sc] = await Promise.all([connect(a.token), connect(b.token), connect(c.token)]);
    const ja = await emit(sa, "rtc:join", { roomId: room.id });
    expect(ja.peers).toEqual([]);
    const jb = await emit(sb, "rtc:join", { roomId: room.id });
    expect(jb.peers).toEqual([ja.me]);
    expect((await emit(sc, "rtc:join", { roomId: room.id })).error).toBe("not_in_room");
    const got = once(sa, "rtc:signal");
    sb.emit("rtc:signal", { roomId: room.id, to: ja.me, data: { type: "offer" } });
    const sig = await got;
    expect(sig.from).toBe(jb.me);
    expect(JSON.stringify(sig)).not.toContain(b.user.id);
    let leaked = false; sa.on("rtc:signal", () => (leaked = true));
    sc.emit("rtc:signal", { roomId: room.id, to: ja.me, data: {} });
    await new Promise((r) => setTimeout(r, 250));
    expect(leaked).toBe(false);
    const left = once(sa, "rtc:peer-left");
    sb.emit("rtc:leave", { roomId: room.id });
    expect((await left).peerId).toBe(jb.me);
    sa.close(); sb.close(); sc.close();
  });

  it("/rtc/config: STUN دايمًا، وTURN بكلمة سر مؤقتة لما يتضبط", async () => {
    const a = await env.login("01095000013");
    let r = await request(env.app).get("/rtc/config").set(a.auth).expect(200);
    expect(r.body.iceServers).toHaveLength(1);
    Object.assign(env.ctx.config, { TURN_URLS: "turn:t.example.com:3478", TURN_SECRET: "s3cret" });
    r = await request(env.app).get("/rtc/config").set(a.auth).expect(200);
    expect(r.body.iceServers[1]).toMatchObject({ urls: ["turn:t.example.com:3478"] });
    expect(r.body.iceServers[1].username).toMatch(new RegExp(`^\\d+:${a.user.id}$`));
    expect(r.body.iceServers[1].credential).toBeTruthy();
    await request(env.app).get("/rtc/config").expect(401);
  });
});
