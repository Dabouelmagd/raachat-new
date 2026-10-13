import webpush from "web-push";
import type { Config } from "../config.js";
import type { Ctx } from "../context.js";

export interface PushPayload {
  kind: "message" | "call" | "missed" | "notice";
  title: string;
  body: string;
  tag: string;
  threadId?: string;
  callId?: string;
}
export interface PushSub { endpoint: string; p256dh: string; auth: string }

/**
 * أكواد معناها «الاشتراك ده مايتبعتلوش تاني بالمفاتيح الحالية»، فيتمسح:
 *  - 404/410 = الاشتراك مات عند المتصفح/الخدمة.
 *  - 401/403 = خدمة الدفع رفضت توقيعنا. السبب العملي الوحيد عندنا هو **تبديل
 *    مفاتيح VAPID**: الجهاز اشترك بالمفتاح القديم، وإحنا بنوقّع بالجديد. من غير
 *    المسح الصف بيفضل للأبد وكل إشعار بيفشل **في سكوت** (الكود القديم كان بيطبع
 *    في اللوج بس)، والجهاز مش بيصلّح نفسه لأن `getSubscription()` بترجّع القديم.
 *    بعد المسح، الواجهة بتعيد الاشتراك بالمفتاح الجديد لوحدها.
 */
const DEAD_CODES = new Set([401, 403, 404, 410]);
/** مُرسِل Push — قابل للاستبدال في الاختبارات. يرمي { statusCode } لو الاشتراك مات (404/410). */
export interface PushSender {
  publicKey: string;
  send(sub: PushSub, payload: PushPayload): Promise<void>;
}

export function createWebPush(c: Config): PushSender | undefined {
  if (!c.VAPID_PUBLIC || !c.VAPID_PRIVATE) return undefined;
  webpush.setVapidDetails(c.VAPID_SUBJECT, c.VAPID_PUBLIC, c.VAPID_PRIVATE);
  return {
    publicKey: c.VAPID_PUBLIC,
    async send(sub, payload) {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: payload.kind === "call" ? 45 : 86_400, urgency: payload.kind === "call" ? "high" : "normal" },
      );
    },
  };
}

export const hasPushSubs = async (ctx: Ctx, userId: string) =>
  !!ctx.push && (await ctx.db.pushSub.count({ where: { userId } })) > 0;

/** يبعت لكل أجهزة المستخدمين، ويمسح الاشتراكات الميتة. مبيرميش أبدًا (الإشعار best-effort). */
export async function notifyPush(ctx: Ctx, userIds: string[], payload: PushPayload) {
  if (!ctx.push || userIds.length === 0) return;
  try {
    const subs = await ctx.db.pushSub.findMany({ where: { userId: { in: userIds } } });
    await Promise.all(subs.map(async (s) => {
      try { await ctx.push!.send(s, payload); }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code && DEAD_CODES.has(code)) await ctx.db.pushSub.deleteMany({ where: { endpoint: s.endpoint } });
        else console.error("push failed", code ?? e);
      }
    }));
  } catch (e) { console.error("push error", e); }
}

/** مين من الـ ids مش متصل بـ socket دلوقتي */
export async function offlineOf(ctx: Ctx, userIds: string[]) {
  if (!ctx.io) return userIds;
  const out: string[] = [];
  for (const u of userIds) if ((await ctx.io.in(`user:${u}`).fetchSockets()).length === 0) out.push(u);
  return out;
}
