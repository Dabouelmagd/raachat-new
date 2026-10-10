import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET لازم يكون 16 حرف على الأقل"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  OTP_DEV_CODE: z.string().regex(/^\d{6}$/).optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
  PUBLIC_URL: z.string().default(""), // لو الملفات على دومين تاني؛ فاضي = مسار نسبي
  ACCESS_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  TWILIO_SID: z.string().optional(),
  TWILIO_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  RESEND_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  GOOGLE_TRANSLATE_KEY: z.string().optional(),
  // WebRTC: STUN/TURN (TURN_SECRET = static-auth-secret بتاع coturn؛ بيتولّد منه اسم/كلمة سر مؤقتة لكل مستخدم)
  STUN_URLS: z.string().default("stun:stun.l.google.com:19302"),
  TURN_URLS: z.string().optional(),
  TURN_SECRET: z.string().optional(),
  // Web Push (VAPID): npm run vapid بيولّد الزوج. من غيرهم الإشعارات متوقفة.
  VAPID_PUBLIC: z.string().optional(),
  VAPID_PRIVATE: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  // أصحاب النظام (مالك): أرقام/إيميلات مفصولة بفاصلة. أول دخول بيها بيتحوّل لمالك تلقائيًا.
  OWNER_CONTACTS: z.string().default(""),
  BANNED_WORDS: z.string().default(""), // كلمات ممنوعة مفصولة بفاصلة (فلتر المحتوى المسيء)
  RING_TIMEOUT_MS: z.coerce.number().default(45000),
});
export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = Env.parse(env);
  if (c.NODE_ENV === "production" && c.OTP_DEV_CODE) {
    throw new Error("OTP_DEV_CODE ممنوع في production");
  }
  return c;
}
