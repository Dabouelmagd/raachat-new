import http from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { createWebPush } from "./lib/push.js";
import { consoleSender, providerSender } from "./lib/senders.js";
import { attachRealtime } from "./realtime.js";
import { startRetention } from "./lib/retention.js";
import { clearRoomPresence, startRoomSweep } from "./routes/rooms.js";
import type { Ctx } from "./context.js";

const config = loadConfig();
const ctx: Ctx = {
  db: createDb(config.DATABASE_URL),
  config,
  sender: config.NODE_ENV === "production" ? providerSender(config) : consoleSender,
  fetch,
  push: createWebPush(config),
};
if (config.NODE_ENV === "production") {
  const sms = !!(config.TWILIO_SID && config.TWILIO_TOKEN && config.TWILIO_FROM);
  const mail = !!(config.RESEND_KEY && config.EMAIL_FROM);
  if (!sms && !mail) console.error("⚠️ مفيش Twilio ولا Resend متضبطين: محدش هيقدر يستلم كود التحقق ويسجّل دخول.");
  if (config.JWT_SECRET.length < 32) console.error("⚠️ JWT_SECRET أقصر من ٣٢ حرف — استخدمي openssl rand -hex 32.");
  if (!ctx.push) console.warn("ℹ️ VAPID غير متضبط: إشعارات المكالمات والرسايل (Push) متوقفة — npm run vapid.");
  if (!config.TURN_URLS) console.warn("ℹ️ TURN غير مفعّل: المكالمات هتفشل خلف بعض الشبكات.");
}
const server = http.createServer(createApp(ctx));
attachRealtime(ctx, server);
server.listen(config.PORT, () => console.log(`رع شات API على :${config.PORT} (${config.NODE_ENV})`));
startRetention(ctx);
// حضور الغرف بيعيش في ذاكرة العملية: أي صف باقي من قبل إعادة التشغيل = شبح
void clearRoomPresence(ctx).catch((e) => console.error("clearRoomPresence failed", e));
startRoomSweep(ctx);

const stop = async () => { server.close(); await ctx.db.$disconnect(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
