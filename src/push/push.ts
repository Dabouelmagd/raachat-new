import { useEffect, useState } from "react";
import { API_ON, api } from "../api/client";

/** Web Push (وضع الباك إند فقط). على iPhone بيشتغل بس لو التطبيق مضاف للشاشة الرئيسية (PWA). */
export const pushSupported = () =>
  API_ON && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const b64ToU8 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
}

/** يسجّل الاشتراك على السيرفر (آمن يتكرر). بيرجّع true لو الجهاز مشترك فعلًا. */
async function subscribe(): Promise<boolean> {
  const { publicKey } = await api<{ publicKey: string | null }>("/push/key");
  if (!publicKey) return false; // السيرفر مش مفعّل VAPID
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api("/push/subscribe", { method: "POST", body: { endpoint: j.endpoint, keys: j.keys } });
  return true;
}

export type PushState = "unsupported" | "denied" | "off" | "on" | "unavailable";

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ? "on" : "off";
  } catch { return "off"; }
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  try { return (await subscribe()) ? "on" : "unavailable"; } catch { return "off"; }
}

export async function disablePush(): Promise<PushState> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api("/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* تجاهل */ }
  return "off";
}

/** بعد تسجيل الدخول: لو الإذن متوافق عليه قبل كده، جدّدي الاشتراك (التوكنات بتتغير + الجهاز ممكن يبدّل الحساب) */
export function usePushSync(active: boolean) {
  useEffect(() => {
    if (!active || !pushSupported() || Notification.permission !== "granted") return;
    void subscribe().catch(() => {});
  }, [active]);
}

export function usePushState() {
  const [s, setS] = useState<PushState>("unsupported");
  useEffect(() => { void currentPushState().then(setS); }, []);
  return [s, setS] as const;
}
