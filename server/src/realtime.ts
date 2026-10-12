import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { authenticate } from "./auth.js";
import type { Ctx } from "./context.js";
import { cleanupRoomPresence } from "./routes/rooms.js";
import { markDelivered } from "./lib/delivery.js";
import { createRtc } from "./rtc.js";

/**
 * Socket.IO: الاتصال بيتوثّق بنفس الـ access token (handshake.auth.token).
 * كل مستخدم في غرفة user:<id>؛ الأحداث بتتبعت لأعضاء المحادثة.
 * أحداث: message:new | message:updated | message:deleted | delivered | thread:new | typing | room:changed (غرفة "rooms")
 */
export function attachRealtime(ctx: Ctx, http: HttpServer): Server {
  const io = new Server(http, { cors: { origin: ctx.config.CORS_ORIGIN.split(",") } });
  io.use(async (socket, next) => {
    try {
      const a = await authenticate(ctx, String(socket.handshake.auth?.token ?? ""));
      socket.data.userId = a.userId;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  const rtc = createRtc(ctx, io);
  io.on("connection", (socket) => {
    rtc.onConnection(socket);
    const uid = socket.data.userId as string;
    void socket.join(`user:${uid}`);
    void socket.join("rooms");
    // الجهاز اتصل = كل اللي اتبعتله وهو أوفلاين بقى «وصل»
    void markDelivered(ctx, uid).catch((e) => console.error("markDelivered failed", e));
    socket.on("disconnect", async () => {
      try {
        const left = await io.in(`user:${uid}`).fetchSockets();
        if (left.length === 0) await cleanupRoomPresence(ctx, uid);
      } catch { /* تجاهل */ }
    });
    socket.on("typing", async (p: { threadId?: string }) => {
      if (!p?.threadId) return;
      const m = await ctx.db.membership.findMany({ where: { threadId: p.threadId } });
      if (!m.some((x) => x.userId === uid)) return;
      emitToUsers(ctx, m.map((x) => x.userId).filter((x) => x !== uid), "typing", { threadId: p.threadId, userId: uid });
    });
  });
  ctx.io = io;
  return io;
}

export function emitToUsers(ctx: Ctx, userIds: string[], event: string, payload: unknown) {
  if (!ctx.io || userIds.length === 0) return;
  ctx.io.to(userIds.map((u) => `user:${u}`)).emit(event, payload);
}
