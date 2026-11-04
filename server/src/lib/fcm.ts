import { createSign } from "node:crypto";
import type { Config } from "../config.js";
import type { PushPayload } from "./push.js";

/**
 * إشعارات **أصلية** عبر FCM HTTP v1.
 *
 * ليه ده لازم أصلًا: Web Push مابيشتغلش جوه WebView — لا في الـAPK على أندرويد
 * (مفيش `PushManager`) ولا جوه WKWebView على iOS. فالتطبيق المثبَّت من المتجر
 * **مابيوصلوش ولا إشعار** مهما كان VAPID متضبطًا. ده الفرق الوحيد، والباقي
 * (مين يتبعتله وإمتى) مشترك في `notifyPush`.
 *
 * 🔴 **و«مفتاح خادم FCM» القديم ماعادش موجود** — جوجل قفلته في ٢٠٢٤، فالطريق
 * الوحيد هو HTTP v1 بحساب خدمة: نوقّع JWT بمفتاح الحساب (RS256)، نبدّله بتوكن
 * وصول من جوجل، ونبعت بيه. وكله بـ`node:crypto` **بلا أي تبعية جديدة** — نفس
 * قرار `password.ts` (scrypt) و`vapidcheck.mjs`: تبعية زيادة في صورة الإنتاج
 * مقابل ٤٠ سطر مش مقايضة كويسة.
 *
 * 🔴 **والمفتاح base64 عن قصد** (`FCM_SERVICE_ACCOUNT`): الـJSON بتاع حساب
 * الخدمة فيه `private_key` بأسطر `\n` ومفاتيح فيها `$`، والقيمة بتعدّي من
 * `.env.production` لـcompose للحاوية — وcompose بيفسّر `${…}` وقارئات `.env`
 * بتقطع عند `#`. نفس سبب `SMS_HTTP` بالظبط.
 */
export interface NativePush {
  projectId: string;
  send(token: string, payload: PushPayload): Promise<void>;
}

/** رمى الخطأ ده = التوكن مات، يتمسح من القاعدة. */
export class DeadTokenError extends Error {
  constructor(public readonly detail: string) {
    super(`dead_token: ${detail}`);
  }
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** بيفك الـbase64 ويتأكد إن التلات حقول اللي بنستخدمها موجودة فعلًا. */
export function parseServiceAccount(b64: string): ServiceAccount {
  let text: string;
  try {
    text = Buffer.from(b64.trim(), "base64").toString("utf8");
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT مش base64 صالح");
  }
  let j: Partial<ServiceAccount>;
  try {
    j = JSON.parse(text) as Partial<ServiceAccount>;
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT مش JSON بعد فكّ الـbase64");
  }
  for (const k of ["project_id", "client_email", "private_key"] as const) {
    if (!j[k]) throw new Error(`FCM_SERVICE_ACCOUNT ناقصه ${k}`);
  }
  // الحقل ده بييجي من جوجل بأسطر حقيقية، إنما ناس بتعدّيه كـ`\n` حرفية.
  const key = j.private_key!.includes("\\n") ? j.private_key!.replace(/\\n/g, "\n") : j.private_key!;
  if (!key.includes("BEGIN")) throw new Error("FCM_SERVICE_ACCOUNT: private_key مش مفتاح PEM");
  return { project_id: j.project_id!, client_email: j.client_email!, private_key: key };
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** JWT موقَّع RS256 — ده اللي جوجل بتبدّله بتوكن وصول. */
export function signJwt(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).end().sign(sa.private_key);
  return `${head}.${body}.${b64url(sig)}`;
}

/** جسم رسالة FCM — مفصول عشان الاختبار يحكم عليه من غير شبكة. */
export function fcmMessage(token: string, p: PushPayload) {
  const call = p.kind === "call";
  return {
    message: {
      token,
      // 🔴 `notification` مش `data` لوحدها: لما التطبيق يكون **مقفول**، أندرويد
      // هو اللي بيعرض الإشعار من الحقل ده. ولو بعتنا داتا بس، الإشعار مابيظهرش
      // خالص والمستخدم مايعرفش إن فيه رسالة — عطل صامت بالكامل.
      notification: { title: p.title, body: p.body },
      // والداتا جنبها عشان الضغط يفتح المحادثة الصح.
      data: {
        kind: p.kind,
        tag: p.tag,
        ...(p.threadId ? { threadId: p.threadId } : {}),
        ...(p.callId ? { callId: p.callId } : {}),
      },
      android: {
        priority: call ? "HIGH" : "NORMAL",
        // مكالمة بعد ٤٥ ثانية خبر قديم — نفس مدد Web Push بالظبط.
        ttl: call ? "45s" : "86400s",
        notification: { tag: p.tag },
      },
    },
  };
}

/**
 * الأكواد اللي معناها «التوكن ده مايتبعتلوش تاني»:
 *  - 404 `UNREGISTERED` = التطبيق اتشال أو التوكن اتجدّد.
 *  - 400 `INVALID_ARGUMENT` على حقل التوكن = توكن مبهدل.
 *  - 403 `SENDER_ID_MISMATCH` = التوكن بتاع مشروع Firebase تاني.
 * وأي حاجة غير دي (٥٠٠ · انقطاع · سقف) **مش** سبب للمسح — الجهاز سليم
 * والمشكلة عندنا أو عند جوجل، ومسحه بيخلّي المستخدم يفقد الإشعارات للأبد.
 */
function deadReason(status: number, body: string): string | null {
  if (status === 404) return "UNREGISTERED";
  if (status === 403 && body.includes("SENDER_ID_MISMATCH")) return "SENDER_ID_MISMATCH";
  if (status === 400 && body.includes("INVALID_ARGUMENT") && body.includes("token")) return "INVALID_ARGUMENT";
  return null;
}

export function createNativePush(c: Config, f: typeof fetch = fetch): NativePush | undefined {
  if (!c.FCM_SERVICE_ACCOUNT) return undefined;
  const sa = parseServiceAccount(c.FCM_SERVICE_ACCOUNT);

  // توكن الوصول صالح ساعة — بنكاشّه عشان مانعملش نداء توكن مع كل إشعار.
  // وبنجدّده قبل انتهائه بدقيقة عشان ماننامش على توكن بيموت في الطريق.
  let cached: { token: string; exp: number } | undefined;
  async function accessToken(): Promise<string> {
    const now = Date.now() / 1000;
    if (cached && cached.exp > now + 60) return cached.token;
    const r = await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signJwt(sa),
      }).toString(),
    });
    const body = await r.text();
    if (!r.ok) throw new Error(`fcm_token_failed status=${r.status} body=${body.slice(0, 200)}`);
    const j = JSON.parse(body) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error("fcm_token_failed: مفيش access_token في الرد");
    cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return j.access_token;
  }

  return {
    projectId: sa.project_id,
    async send(token, payload) {
      const at = await accessToken();
      const r = await f(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify(fcmMessage(token, payload)),
      });
      if (r.ok) return;
      const body = await r.text().catch(() => "");
      const dead = deadReason(r.status, body);
      if (dead) throw new DeadTokenError(dead);
      // 🔴 الـstatus وجسم الرد في اللوج — نفس درس إيميل Resend في ٢٢ أكتوبر:
      // سطر واحد لكل الحالات بيخلّي التشخيص تخمينًا. والتوكن نفسه **مابيتطبعش**.
      throw new Error(`fcm_send_failed status=${r.status} body=${body.slice(0, 200)}`);
    },
  };
}

/**
 * فحص إيجابي: بيبدّل JWT بتوكن وصول حقيقي من جوجل.
 *
 * ده بيثبّت **تلات حاجات مع بعض**: الـbase64 والـJSON سليمان، والمفتاح الخاص
 * بيوقّع فعلًا (مش منسوخًا ناقصًا)، وحساب الخدمة له صلاحية `firebase.messaging`.
 * واللي **مابيثبتهوش**: إن جهازًا هيستلم — ده محتاج توكن جهاز حقيقي، ومفيش
 * طريق نجيبه من سكربت. فالسكربت بيقول ده صريح بدل ما يدّعي تحقّقًا كاملًا.
 */
export async function verifyNativePush(c: Config, f: typeof fetch = fetch): Promise<string> {
  if (!c.FCM_SERVICE_ACCOUNT) throw new Error("FCM_SERVICE_ACCOUNT مش متضبط");
  const sa = parseServiceAccount(c.FCM_SERVICE_ACCOUNT);
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt(sa),
    }).toString(),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`جوجل رفضت حساب الخدمة: status=${r.status} ${body.slice(0, 200)}`);
  if (!(JSON.parse(body) as { access_token?: string }).access_token) {
    throw new Error("رد جوجل مافيهوش access_token");
  }
  return sa.project_id;
}
