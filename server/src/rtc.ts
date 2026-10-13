import { hasPushSubs, notifyPush } from "./lib/push.js";
import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { Ctx } from "./context.js";
import { sha256 } from "./lib/tokens.js";

/**
 * Signaling فقط (الصوت/الفيديو نفسه بيمشي peer-to-peer أو عبر TURN — السيرفر مش بيشوفه).
 * الحالة في الذاكرة => instance واحد. لتوسيع أفقي: Socket.IO Redis adapter + حالة المكالمات في Redis.
 *
 * مكالمات 1:1:  call:invite → call:incoming → call:answer → call:accepted → call:signal ⇄ → call:end
 * غرف صوتية (mesh):  rtc:join → rtc:signal ⇄ → rtc:leave   (الهوية المؤقتة محفوظة: بنستخدم peerId مشتق، مش userId)
 */
interface Call { id: string; threadId: string; mode: "voice" | "video"; caller: string; callee: string; state: "ringing" | "active"; startedAt: number; answeredAt?: number; timer?: NodeJS.Timeout }

const Invite = z.object({ threadId: z.string().min(1), mode: z.enum(["voice", "video"]) });
const CallId = z.object({ callId: z.string().min(1) });
const Signal = z.object({ callId: z.string().min(1), data: z.unknown() });
const MAX_SIGNAL_BYTES = 16_000;
const MESH_MAX = 8;

export const peerKey = (roomId: string, userId: string) => sha256(`${roomId}:${userId}`).slice(0, 12); // نفس اشتقاق routes/rooms.ts

/**
 * STUN/TURN للمتصفح. كلمة سر TURN **مؤقتة** ومحسوبة بنفس طريقة coturn مع
 * `--use-auth-secret`: الاسم `<وقت الانتهاء>:<المستخدم>` والكلمة
 * **base64(HMAC-SHA1(secret, username))** — أي تغيير في الخوارزمية (sha256 أو
 * hex) بيخلي coturn يرفض المصادقة في سكوت والمكالمة تفضل بلا صوت، فالاختبار
 * بيحسبها لوحده ويقارن.
 */
export function iceServers(ctx: Ctx, userId: string) {
  const c = ctx.config;
  const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
  const out: { urls: string[]; username?: string; credential?: string }[] = [{ urls: list(c.STUN_URLS) }];
  // العناوين الفاضية (فاصلة زايدة في .env مثلًا) كانت بتدخل كـ "" في القايمة —
  // والمتصفح بيرفض مدخل ICE فيه عنوان غير صالح، فيضيع TURN كله.
  const turn = c.TURN_URLS ? list(c.TURN_URLS) : [];
  if (turn.length && c.TURN_SECRET) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const username = `${exp}:${userId}`;
    out.push({ urls: turn, username, credential: crypto.createHmac("sha1", c.TURN_SECRET).update(username).digest("base64") });
  }
  return out;
}

export function createRtc(ctx: Ctx, io: Server) {
  const calls = new Map<string, Call>();
  const byUser = new Map<string, string>(); // userId -> callId (مكالمة واحدة في الوقت)
  const mesh = new Map<string, Map<string, string>>(); // roomId -> peerId -> userId

  const to = (userId: string, ev: string, p: unknown) => io.to(`user:${userId}`).emit(ev, p);
  const online = async (userId: string) => (await io.in(`user:${userId}`).fetchSockets()).length > 0;

  async function finish(call: Call, reason: "ended" | "rejected" | "missed" | "busy" | "dropped", by?: string) {
    if (!calls.delete(call.id)) return;
    clearTimeout(call.timer);
    byUser.delete(call.caller); byUser.delete(call.callee);
    const dur = call.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0;
    try {
      await ctx.db.callLog.createMany({
        data: [
          { userId: call.caller, threadId: call.threadId, mode: call.mode, dir: "out", at: new Date(call.startedAt), dur },
          { userId: call.callee, threadId: call.threadId, mode: call.mode, dir: call.answeredAt ? "in" : "missed", at: new Date(call.startedAt), dur },
        ],
      });
    } catch (e) { console.error("call log failed", e); }
    for (const u of [call.caller, call.callee]) if (u !== by) to(u, "call:ended", { callId: call.id, reason });
    // المتلقي أوفلاين ومردّش: الإشعار بتاع الرنين يتبدّل بـ "مكالمة فائتة" (نفس الـ tag)
    if (!call.answeredAt && reason !== "rejected" && !(await online(call.callee))) {
      const caller = await ctx.db.user.findUnique({ where: { id: call.caller }, select: { name: true } });
      void notifyPush(ctx, [call.callee], { kind: "missed", title: caller?.name ?? "رع شات", body: "مكالمة فائتة", tag: `call-${call.threadId}`, threadId: call.threadId });
    }
  }

  const partOf = (call: Call | undefined, uid: string) => !!call && (call.caller === uid || call.callee === uid);

  function leaveMesh(userId: string, roomId?: string) {
    for (const [rid, peers] of mesh) {
      if (roomId && rid !== roomId) continue;
      for (const [pid, uid] of peers) {
        if (uid !== userId) continue;
        peers.delete(pid);
        for (const other of peers.values()) to(other, "rtc:peer-left", { roomId: rid, peerId: pid });
      }
      if (peers.size === 0) mesh.delete(rid);
    }
  }

  function onConnection(socket: Socket) {
    const uid = socket.data.userId as string;
    const ack = (cb: unknown, v: unknown) => { if (typeof cb === "function") cb(v); };

    socket.on("call:invite", async (raw: unknown, cb?: unknown) => {
      try {
        const b = Invite.parse(raw);
        const th = await ctx.db.thread.findUnique({ where: { id: b.threadId }, include: { members: true } });
        if (!th || th.type !== "dm" || !th.members.some((m) => m.userId === uid)) return ack(cb, { error: "forbidden" });
        const callee = th.members.find((m) => m.userId !== uid)?.userId;
        if (!callee) return ack(cb, { error: "forbidden" });
        if (byUser.has(uid)) return ack(cb, { error: "busy" });
        if (byUser.has(callee)) return ack(cb, { error: "busy" });
        const calleeOnline = await online(callee);
        if (!calleeOnline && !(await hasPushSubs(ctx, callee))) return ack(cb, { error: "offline" });
        const me = await ctx.db.user.findUnique({ where: { id: uid }, select: { name: true } });
        const call: Call = { id: crypto.randomUUID(), threadId: b.threadId, mode: b.mode, caller: uid, callee, state: "ringing", startedAt: Date.now() };
        call.timer = setTimeout(() => { void finish(call, "missed"); }, ctx.config.RING_TIMEOUT_MS);
        calls.set(call.id, call); byUser.set(uid, call.id); byUser.set(callee, call.id);
        const info = { callId: call.id, threadId: call.threadId, mode: call.mode, fromName: me?.name ?? "" };
        if (calleeOnline) to(callee, "call:incoming", info);
        else void notifyPush(ctx, [callee], { kind: "call", title: info.fromName || "رع شات", body: call.mode === "video" ? "مكالمة فيديو واردة" : "مكالمة صوتية واردة", tag: `call-${call.threadId}`, threadId: call.threadId, callId: call.id });
        ack(cb, { callId: call.id });
      } catch { ack(cb, { error: "bad_request" }); }
    });

    // المتلقي فتح التطبيق من إشعار Push والمكالمة لسه بترن → يستلمها هنا (الـ socket ممكن يتوصّل قبل ما الواجهة تسمع)
    socket.on("call:pending", async (_raw: unknown, cb?: unknown) => {
      const call = calls.get(byUser.get(uid) ?? "");
      if (!call || call.callee !== uid || call.state !== "ringing") return ack(cb, { call: null });
      const caller = await ctx.db.user.findUnique({ where: { id: call.caller }, select: { name: true } });
      ack(cb, { call: { callId: call.id, threadId: call.threadId, mode: call.mode, fromName: caller?.name ?? "" } });
    });

    socket.on("call:answer", (raw: unknown, cb?: unknown) => {
      const p = CallId.extend({ accept: z.boolean() }).safeParse(raw);
      const call = p.success ? calls.get(p.data.callId) : undefined;
      if (!p.success || !call || call.callee !== uid || call.state !== "ringing") return ack(cb, { error: "not_found" });
      if (!p.data.accept) { void finish(call, "rejected", uid); return ack(cb, { ok: true }); }
      clearTimeout(call.timer);
      call.state = "active"; call.answeredAt = Date.now();
      to(call.caller, "call:accepted", { callId: call.id });
      ack(cb, { ok: true });
    });

    socket.on("call:signal", (raw: unknown) => {
      const p = Signal.safeParse(raw);
      if (!p.success || JSON.stringify(p.data.data ?? null).length > MAX_SIGNAL_BYTES) return;
      const call = calls.get(p.data.callId);
      if (!partOf(call, uid) || call!.state !== "active") return;
      to(call!.caller === uid ? call!.callee : call!.caller, "call:signal", { callId: call!.id, data: p.data.data });
    });

    socket.on("call:end", (raw: unknown) => {
      const p = CallId.safeParse(raw);
      const call = p.success ? calls.get(p.data.callId) : undefined;
      if (!call || !partOf(call, uid)) return;
      void finish(call, call.state === "ringing" ? "missed" : "ended", uid);
    });

    // ---- غرف صوتية (mesh)
    socket.on("rtc:join", async (raw: unknown, cb?: unknown) => {
      try {
        const { roomId } = z.object({ roomId: z.string().min(1) }).parse(raw);
        const part = await ctx.db.roomParticipant.findUnique({ where: { roomId_userId: { roomId, userId: uid } } });
        if (!part) return ack(cb, { error: "not_in_room" });
        let peers = mesh.get(roomId);
        if (!peers) mesh.set(roomId, (peers = new Map()));
        const me = peerKey(roomId, uid);
        if (!peers.has(me) && peers.size >= MESH_MAX) return ack(cb, { error: "full" });
        const existing = [...peers.keys()].filter((k) => k !== me);
        peers.set(me, uid);
        ack(cb, { me, peers: existing });
      } catch { ack(cb, { error: "bad_request" }); }
    });

    socket.on("rtc:signal", (raw: unknown) => {
      const p = z.object({ roomId: z.string(), to: z.string(), data: z.unknown() }).safeParse(raw);
      if (!p.success || JSON.stringify(p.data.data ?? null).length > MAX_SIGNAL_BYTES) return;
      const peers = mesh.get(p.data.roomId);
      const target = peers?.get(p.data.to);
      if (!peers || !target || ![...peers.values()].includes(uid)) return;
      to(target, "rtc:signal", { roomId: p.data.roomId, from: peerKey(p.data.roomId, uid), data: p.data.data });
    });

    socket.on("rtc:leave", (raw: unknown) => {
      const p = z.object({ roomId: z.string() }).safeParse(raw);
      if (p.success) leaveMesh(uid, p.data.roomId);
    });

    socket.on("disconnect", async () => {
      try {
        if ((await io.in(`user:${uid}`).fetchSockets()).length > 0) return;
        leaveMesh(uid);
        const cid = byUser.get(uid);
        const call = cid ? calls.get(cid) : undefined;
        if (call) {
          void finish(call, "dropped", uid);
        }
      } catch { /* تجاهل */ }
    });
  }

  return { onConnection };
}
