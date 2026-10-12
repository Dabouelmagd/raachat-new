import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Ctx } from "./context.js";
import { errorHandler } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { extraRoutes } from "./routes/extras.js";
import { walletRoutes } from "./routes/wallet.js";
import { roomRoutes } from "./routes/rooms.js";
import { adRoutes } from "./routes/ads.js";
import { searchRoutes } from "./routes/search.js";
import { rtcRoutes } from "./routes/rtc.js";
import { pushRoutes } from "./routes/push.js";
import { adminRoutes } from "./routes/admin.js";
import { authenticate } from "./auth.js";
import { getSettings } from "./lib/settings.js";
import { blockRoutes } from "./routes/blocks.js";
import { contactRoutes } from "./routes/contacts.js";
import { reportRoutes } from "./routes/reports.js";
import { meRoutes } from "./routes/me.js";
import { messageRoutes } from "./routes/messages.js";
import { threadRoutes } from "./routes/threads.js";
import { uploadRoutes } from "./routes/uploads.js";

export function createApp(ctx: Ctx) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: ctx.config.CORS_ORIGIN.split(","), credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  if (ctx.config.RATE_LIMIT === "on") {
    // حماية OTP من التخمين/الإغراق (إضافة لحد 5/ساعة لكل هدف داخل auth.ts)
    app.use("/auth/handoff", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { code: "too_many", message: "محاولات كثيرة" } }));
    app.use("/auth/otp", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { code: "too_many", message: "محاولات كثيرة" } }));
    // تخمين كلمة السر: مفيش حد لكل هدف في القاعدة زي الـ OTP، فالحد هنا هو
    // الحارس الوحيد. والتسجيل كمان عشان ما يتعملش حسابات بالجملة.
    app.use("/auth/login", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { code: "too_many", message: "محاولات كثيرة، حاول بعد دقيقة" } }));
    app.use("/auth/register", rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { code: "too_many", message: "محاولات كثيرة، حاول بعد دقيقة" } }));
    app.use("/auth/password", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { code: "too_many", message: "محاولات كثيرة، حاول بعد دقيقة" } }));
  }

  app.use(authRoutes(ctx));
  app.use(adminRoutes(ctx)); // قبل الراوترات اللي بتفرض تسجيل دخول على كل المسارات (فيه /auth/handoff/exchange العام)
  app.get("/public/settings", async (_req, res, next) => { try { const c = await getSettings(ctx); res.json({ maintenance: c.maintenance, message: c.maintenance ? c.maintenanceMessage : "", registrationOpen: c.registrationOpen }); } catch (e) { next(e); } });
  // وضع الصيانة: الفريق الفعّال بس يكمل شغل. (/auth و/admin و/health و/public مستثناة)
  app.use(async (req, res, next) => {
    try {
      const c = await getSettings(ctx);
      if (!c.maintenance) return next();
      try {
        const h = req.headers.authorization ?? "";
        if (h.startsWith("Bearer ")) {
          const a = await authenticate(ctx, h.slice(7));
          const st = await ctx.db.staff.findUnique({ where: { userId: a.userId } });
          if (st?.active) return next();
        }
      } catch { /* يكمل للرد 503 */ }
      res.status(503).json({ code: "maintenance", message: c.maintenanceMessage });
    } catch (e) { next(e); }
  });
  app.use(uploadRoutes(ctx));
  app.use(meRoutes(ctx));
  app.use(threadRoutes(ctx));
  app.use(messageRoutes(ctx));
  app.use(extraRoutes(ctx));
  app.use(walletRoutes(ctx));
  app.use(roomRoutes(ctx));
  app.use(adRoutes(ctx));
  app.use(searchRoutes(ctx));
  app.use(rtcRoutes(ctx));
  app.use(pushRoutes(ctx));
  app.use(reportRoutes(ctx));
  app.use(blockRoutes(ctx));
  app.use(contactRoutes(ctx));

  app.use((_req, res) => res.status(404).json({ code: "not_found", message: "المسار غير موجود" }));
  app.use(errorHandler);
  return app;
}
