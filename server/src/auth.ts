import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Ctx } from "./context.js";
import { todayCairo } from "./lib/cairo.js";
import { HttpError, unauthorized } from "./lib/errors.js";
import { getSettings } from "./lib/settings.js";
import { smsCountSent, smsUnderDailyCap } from "./lib/sms.js";
import { hashPassword, verifyPassword, wastePasswordTime } from "./lib/password.js";
import { randomToken, sha256, signAccess, verifyAccess } from "./lib/tokens.js";

export interface AuthedRequest extends Request {
  userId: string;
  sessionId: string;
}

const MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 5 * 60_000;
const MAX_REQUESTS_PER_HOUR = 5;

export function normalizeTarget(channel: "phone" | "email", target: string): string {
  if (channel === "email") return target.trim().toLowerCase();
  const d = target.replace(/[\s\-()]/g, "");
  return d.startsWith("+") ? d : d.replace(/^002/, "+2").replace(/^2(?=01\d{9}$)/, "+2");
}

export function validTarget(channel: "phone" | "email", t: string): boolean {
  return channel === "phone" ? /^(\+?\d{8,15})$/.test(t) : /^\S+@\S+\.\S+$/.test(t);
}

const hashCode = (ctx: Ctx, target: string, code: string) => sha256(`${ctx.config.JWT_SECRET}:${target}:${code}`);

export async function requestOtp(ctx: Ctx, channel: "phone" | "email", rawTarget: string) {
  const target = normalizeTarget(channel, rawTarget);
  if (!validTarget(channel, target)) throw new HttpError(400, "invalid_target", "رقم أو إيميل غير صحيح");
  // **الفحص قبل الكتابة**: القناة غير مضبوطة (مثلًا SMS) كانت بتعمل كود في
  // القاعدة وتستهلك حد الساعة وبعدين الإرسال يفشل بـ «تعذّر إرسال الكود» —
  // فالمستخدم يفضل يحاول على طريق مسدود من غير ما يعرف السبب.
  if (ctx.sender.ready?.(channel) === false) {
    throw new HttpError(503, "channel_unavailable", channel === "phone"
      ? "التحقق بالرقم موقوف مؤقتًا — استخدم الإيميل"
      : "التحقق بالإيميل موقوف مؤقتًا");
  }
  // سقف الفاتورة اليومي للـ SMS — **قبل الكتابة** زي فحص القناة فوقه، عشان
  // الطلب المرفوض مايستهلكش حد الساعة بتاع الرقم.
  if (channel === "phone" && !smsUnderDailyCap(ctx.config.SMS_DAILY_MAX, todayCairo())) {
    console.warn(`⚠️ سقف الـ SMS اليومي خلص (${ctx.config.SMS_DAILY_MAX} رسالة) — التحقق بالرقم متوقف لباقي اليوم`);
    throw new HttpError(429, "sms_quota", "سقف الرسائل اليومي خلص — استخدم الإيميل أو حاول بكرة");
  }
  const since = new Date(Date.now() - 3600_000);
  const recent = await ctx.db.otpCode.count({ where: { channel, target, createdAt: { gte: since } } });
  if (recent >= MAX_REQUESTS_PER_HOUR) throw new HttpError(429, "too_many", "محاولات كثيرة، حاول بعد ساعة");

  const dev = ctx.config.NODE_ENV !== "production" ? ctx.config.OTP_DEV_CODE : undefined;
  const code = dev ?? String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await ctx.db.otpCode.updateMany({ where: { channel, target, usedAt: null }, data: { usedAt: new Date() } });
  await ctx.db.otpCode.create({
    data: { channel, target, codeHash: hashCode(ctx, target, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  try {
    await ctx.sender.send(channel, target, code);
  } catch (e) {
    console.error("OTP send failed:", (e as Error).message);
    throw new HttpError(503, "otp_unavailable", "تعذّر إرسال الكود الآن");
  }
  if (channel === "phone") smsCountSent(todayCairo()); // الناجحة بس هي اللي بتتحاسب
}

export async function newSession(ctx: Ctx, userId: string, device: string) {
  const refresh = randomToken();
  const s = await ctx.db.session.create({
    data: {
      userId,
      device: device.slice(0, 200),
      refreshHash: sha256(refresh),
      refreshExpiresAt: new Date(Date.now() + ctx.config.REFRESH_TTL_DAYS * 86400_000),
    },
  });
  return { accessToken: signAccess({ sub: userId, sid: s.id }, ctx.config.JWT_SECRET, ctx.config.ACCESS_TTL_MIN), refreshToken: refresh };
}

/** يتحقق من كود OTP ويستهلكه (٥ محاولات، ٥ دقايق). بيرمي 401 لو غلط. */
export async function consumeOtp(ctx: Ctx, channel: "phone" | "email", rawTarget: string, code: string) {
  const target = normalizeTarget(channel, rawTarget);
  const otp = await ctx.db.otpCode.findFirst({
    where: { channel, target, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) throw new HttpError(401, "invalid_code", "الكود غير صحيح أو منتهي");
  const ok = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hashCode(ctx, target, code)));
  if (!ok) {
    await ctx.db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(401, "invalid_code", "الكود غير صحيح أو منتهي");
  }
  await ctx.db.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  return target;
}

export async function verifyOtp(ctx: Ctx, channel: "phone" | "email", rawTarget: string, code: string, device: string) {
  const target = await consumeOtp(ctx, channel, rawTarget, code);
  const where = channel === "phone" ? { phone: target } : { email: target };
  let user = await ctx.db.user.findUnique({ where });
  if (!user) {
    if (!(await getSettings(ctx)).registrationOpen) throw new HttpError(403, "registration_closed", "التسجيل الجديد مقفول مؤقتًا");
    const fallback = channel === "phone" ? `مستخدم ${target.slice(-4)}` : target.split("@")[0];
    user = await ctx.db.user.create({ data: { ...where, name: fallback, wallet: { create: {} } } });
  }
  if (user.modStatus !== "active") throw new HttpError(403, "account_suspended", "الحساب موقوف");
  const session = await newSession(ctx, user.id, device);
  return { ...session, user };
}

/**
 * تسجيل حساب جديد بكلمة سر. الإيميل لازم يتأكد بكود **مرة واحدة** عند التسجيل،
 * وبعدها الدخول بكلمة السر من غير أكواد — ده كان الطلب: «لما أكون مسجّلة حساب،
 * مش كل مرة أدخل بـ OTP».
 */
export async function registerWithPassword(
  ctx: Ctx,
  p: { target: string; code: string; name: string; password: string; device: string },
) {
  const target = normalizeTarget("email", p.target);
  if (!validTarget("email", target)) throw new HttpError(400, "invalid_target", "إيميل غير صحيح");
  const name = p.name.trim();
  if (name.length < 2) throw new HttpError(400, "invalid_name", "اكتب اسمك");
  // الهاش قبل استهلاك الكود: لو كلمة السر مرفوضة، الكود يفضل صالح ومايضيعش على المستخدم
  const passwordHash = await hashPassword(p.password);
  // الحساب الموجود ما ينفعش يتسجّل تاني — رسالة واضحة بدل خطأ قاعدة بيانات
  const existing = await ctx.db.user.findUnique({ where: { email: target }, select: { passwordHash: true } });
  if (existing) {
    throw new HttpError(409, existing.passwordHash ? "already_registered" : "needs_password_setup",
      existing.passwordHash
        ? "الإيميل ده مسجّل بالفعل — سجّل دخولك بكلمة السر"
        : "الإيميل ده مسجّل بحساب بيدخل بكود — ادخل بالكود وبعدها اعمل كلمة سر من الحساب");
  }
  if (!(await getSettings(ctx)).registrationOpen) throw new HttpError(403, "registration_closed", "التسجيل الجديد مقفول مؤقتًا");
  await consumeOtp(ctx, "email", target, p.code);
  const user = await ctx.db.user.create({ data: { email: target, name, passwordHash, wallet: { create: {} } } });
  const session = await newSession(ctx, user.id, p.device);
  return { ...session, user };
}

/** دخول بالإيميل وكلمة السر — بدون أي كود. */
export async function loginWithPassword(ctx: Ctx, rawTarget: string, password: string, device: string) {
  const target = normalizeTarget("email", rawTarget);
  const user = await ctx.db.user.findUnique({ where: { email: target } });
  // نفس الرد ونفس الزمن للحساب المش موجود واللي مالوش كلمة سر واللي كلمة سره غلط
  if (!user || !user.passwordHash) {
    await wastePasswordTime(password);
    throw new HttpError(401, "bad_credentials", "الإيميل أو كلمة السر غلط");
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, "bad_credentials", "الإيميل أو كلمة السر غلط");
  if (user.modStatus !== "active") throw new HttpError(403, "account_suspended", "الحساب موقوف");
  const session = await newSession(ctx, user.id, device);
  return { ...session, user };
}

/**
 * تعيين/تغيير كلمة السر. بياخد إمّا `current` (وهو داخل بالفعل وعنده كلمة سر)
 * أو كود تحقّق على إيميل الحساب (نسيت كلمة السر). ولمّا الحساب مالوش كلمة سر
 * أصلًا (الحسابات القديمة) الدخول نفسه كافي.
 *
 * وبنلغي **كل الجلسات التانية** بعد التغيير: لو حد كان داخل بجلسة مسروقة،
 * تغيير كلمة السر لازم يطلّعه.
 */
export async function setPassword(
  ctx: Ctx,
  userId: string,
  password: string,
  opts: { current?: string; keepSessionId?: string },
) {
  const user = await ctx.db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw unauthorized();
  if (user.passwordHash && !(await verifyPassword(opts.current ?? "", user.passwordHash)))
    throw new HttpError(401, "bad_current", "كلمة السر الحالية غلط");
  const passwordHash = await hashPassword(password);
  await ctx.db.user.update({ where: { id: userId }, data: { passwordHash } });
  await ctx.db.session.updateMany({
    where: { userId, revokedAt: null, ...(opts.keepSessionId ? { id: { not: opts.keepSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/** نسيت كلمة السر: كود على الإيميل → كلمة سر جديدة → جلسة جديدة. */
export async function resetPassword(ctx: Ctx, rawTarget: string, code: string, password: string, device: string) {
  const target = normalizeTarget("email", rawTarget);
  const passwordHash = await hashPassword(password); // قبل استهلاك الكود
  await consumeOtp(ctx, "email", target, code);
  const user = await ctx.db.user.findUnique({ where: { email: target } });
  if (!user) throw new HttpError(404, "no_account", "مفيش حساب بالإيميل ده");
  if (user.modStatus !== "active") throw new HttpError(403, "account_suspended", "الحساب موقوف");
  await ctx.db.user.update({ where: { id: user.id }, data: { passwordHash } });
  await ctx.db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  const session = await newSession(ctx, user.id, device);
  return { ...session, user };
}

export async function refreshSession(ctx: Ctx, refreshToken: string) {
  const s = await ctx.db.session.findUnique({ where: { refreshHash: sha256(refreshToken) } });
  if (!s || s.revokedAt || s.refreshExpiresAt < new Date()) throw unauthorized("جلسة منتهية");
  const owner = await ctx.db.user.findUnique({ where: { id: s.userId }, select: { modStatus: true } });
  if (owner?.modStatus !== "active") throw new HttpError(403, "account_suspended", "الحساب موقوف");
  const next = randomToken();
  await ctx.db.session.update({
    where: { id: s.id },
    data: { refreshHash: sha256(next), lastUsed: new Date(), refreshExpiresAt: new Date(Date.now() + ctx.config.REFRESH_TTL_DAYS * 86400_000) },
  });
  return {
    accessToken: signAccess({ sub: s.userId, sid: s.id }, ctx.config.JWT_SECRET, ctx.config.ACCESS_TTL_MIN),
    refreshToken: next,
  };
}

/** يتحقق من التوكن ومن إن الجلسة لسه شغالة (عشان تسجيل الخروج/إنهاء الجلسات يشتغل فورًا) */
export async function authenticate(ctx: Ctx, token: string) {
  let claims;
  try {
    claims = verifyAccess(token, ctx.config.JWT_SECRET);
  } catch {
    throw unauthorized("توكن غير صالح");
  }
  const s = await ctx.db.session.findUnique({ where: { id: claims.sid }, include: { user: { select: { modStatus: true, lastSeenAt: true } } } });
  if (!s || s.revokedAt || s.userId !== claims.sub) throw unauthorized("جلسة منتهية");
  if (s.user.modStatus !== "active") throw new HttpError(403, "account_suspended", "الحساب موقوف");
  // آخر ظهور (بيتحدّث كل ٥ دقايق على الأكتر)
  if (!s.user.lastSeenAt || Date.now() - s.user.lastSeenAt.getTime() > 5 * 60_000) void ctx.db.user.update({ where: { id: claims.sub }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return { userId: claims.sub, sessionId: claims.sid };
}

export const requireAuth = (ctx: Ctx) => async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const h = req.headers.authorization ?? "";
    if (!h.startsWith("Bearer ")) throw unauthorized();
    const a = await authenticate(ctx, h.slice(7));
    (req as AuthedRequest).userId = a.userId;
    (req as AuthedRequest).sessionId = a.sessionId;
    next();
  } catch (e) {
    next(e);
  }
};
