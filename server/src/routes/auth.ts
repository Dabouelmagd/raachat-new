import { Router } from "express";
import { z } from "zod";
import { loginWithPassword, newSession, refreshSession, registerWithPassword, requestOtp, resetPassword, setPassword, verifyOtp, requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { wrap } from "../lib/errors.js";
import { meUser } from "../serialize.js";

const Chan = z.enum(["phone", "email"]);

export function authRoutes(ctx: Ctx) {
  const r = Router();
  r.post("/auth/otp/request", wrap(async (req, res) => {
    const b = z.object({ channel: Chan, target: z.string().min(3).max(200) }).parse(req.body);
    await requestOtp(ctx, b.channel, b.target);
    res.status(204).end();
  }));
  r.post("/auth/otp/verify", wrap(async (req, res) => {
    const b = z.object({ channel: Chan, target: z.string().min(3).max(200), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const s = await verifyOtp(ctx, b.channel, b.target, b.code, String(req.headers["user-agent"] ?? ""));
    res.json({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: meUser(s.user) });
  }));
  const Password = z.string().min(8).max(200);
  const dev = (req: { headers: Record<string, unknown> }) => String(req.headers["user-agent"] ?? "");

  /** حساب جديد: اسم + إيميل + كلمة سر + كود تأكيد الإيميل (مرة واحدة بس). */
  r.post("/auth/register", wrap(async (req, res) => {
    const b = z.object({
      target: z.string().min(3).max(200),
      code: z.string().regex(/^\d{6}$/),
      name: z.string().min(2).max(60),
      password: Password,
    }).parse(req.body);
    const s = await registerWithPassword(ctx, { ...b, device: dev(req) });
    res.status(201).json({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: meUser(s.user) });
  }));

  /** دخول بكلمة السر — مفيش كود. */
  r.post("/auth/login", wrap(async (req, res) => {
    const b = z.object({ target: z.string().min(3).max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const s = await loginWithPassword(ctx, b.target, b.password, dev(req));
    res.json({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: meUser(s.user) });
  }));

  /** نسيت كلمة السر: الكود بيتطلب من /auth/otp/request على نفس الإيميل. */
  r.post("/auth/password/reset", wrap(async (req, res) => {
    const b = z.object({
      target: z.string().min(3).max(200),
      code: z.string().regex(/^\d{6}$/),
      password: Password,
    }).parse(req.body);
    const s = await resetPassword(ctx, b.target, b.code, b.password, dev(req));
    res.json({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: meUser(s.user) });
  }));

  /** تعيين/تغيير كلمة السر من جوه الحساب (الحسابات القديمة اللي بتدخل بكود). */
  r.post("/me/password", requireAuth(ctx), wrap(async (req, res) => {
    const a = req as AuthedRequest;
    const b = z.object({ current: z.string().max(200).optional(), password: Password }).parse(req.body);
    await setPassword(ctx, a.userId, b.password, { current: b.current, keepSessionId: a.sessionId });
    res.status(204).end();
  }));

  r.post("/auth/refresh", wrap(async (req, res) => {
    const b = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    res.json(await refreshSession(ctx, b.refreshToken));
  }));
  r.post("/auth/logout", requireAuth(ctx), wrap(async (req, res) => {
    await ctx.db.session.update({ where: { id: (req as AuthedRequest).sessionId }, data: { revokedAt: new Date() } });
    res.status(204).end();
  }));
  // الجلسات النشطة (شاشة «الجلسات النشطة» في التطبيق)
  r.get("/sessions", requireAuth(ctx), wrap(async (req, res) => {
    const a = req as AuthedRequest;
    const list = await ctx.db.session.findMany({ where: { userId: a.userId, revokedAt: null }, orderBy: { lastUsed: "desc" } });
    res.json(list.map((s) => ({ id: s.id, device: s.device, createdAt: s.createdAt, lastUsed: s.lastUsed, current: s.id === a.sessionId })));
  }));
  r.delete("/sessions/:id", requireAuth(ctx), wrap(async (req, res) => {
    const a = req as AuthedRequest;
    await ctx.db.session.updateMany({ where: { id: String(req.params.id), userId: a.userId }, data: { revokedAt: new Date() } });
    res.status(204).end();
  }));
  r.delete("/sessions", requireAuth(ctx), wrap(async (req, res) => {
    const a = req as AuthedRequest;
    await ctx.db.session.updateMany({ where: { userId: a.userId, id: { not: a.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    res.status(204).end();
  }));
  void newSession;
  return r;
}
