import type { Server as IoServer } from "socket.io";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { OtpSender } from "./lib/senders.js";
import type { PushSender } from "./lib/push.js";

export interface Ctx {
  db: Db;
  config: Config;
  sender: OtpSender;
  fetch: typeof fetch; // قابل للاستبدال في الاختبارات
  io?: IoServer;
  push?: PushSender; // undefined = الإشعارات متوقفة
}
