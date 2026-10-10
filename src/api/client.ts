import { useSyncExternalStore } from "react";

/**
 * وضع الباك إند الحقيقي: ضبطي VITE_API_URL (مثلاً http://localhost:4000).
 * لو مش مضبوط التطبيق بيشتغل في وضع الديمو ببيانات وهمية (زي الآن).
 */
export const API_URL: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
export const API_ON = API_URL !== "";

export interface SessionData { access: string; refresh: string; meId: string }
const KEY = "rachat-session";

let session: SessionData | null = null;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) session = JSON.parse(raw);
} catch {
  /* التخزين غير متاح */
}
const subs = new Set<() => void>();

export const getSession = () => session;
export function setSession(s: SessionData | null) {
  session = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}
export function useSession(): SessionData | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => session, () => session);
}

/* وضع الصيانة: أي رد 503 بكود maintenance بيفعّل شاشة الصيانة */
let maintenance = "";
const mSubs = new Set<() => void>();
export const useMaintenance = () => useSyncExternalStore((f) => { mSubs.add(f); return () => mSubs.delete(f); }, () => maintenance);
export function clearMaintenance() { maintenance = ""; mSubs.forEach((f) => f()); }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!session) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: session!.refresh }) });
      if (!r.ok) return false;
      const j = (await r.json()) as { accessToken: string; refreshToken: string };
      setSession({ ...session!, access: j.accessToken, refresh: j.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; auth?: boolean } = {}): Promise<T> {
  const go = () =>
    fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.auth !== false && session ? { Authorization: `Bearer ${session.access}` } : {}),
      },
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    });
  let r = await go();
  if (r.status === 401 && opts.auth !== false && (await refresh())) r = await go();
  if (r.status === 401 && opts.auth !== false) setSession(null); // الجلسة انتهت → شاشة الدخول
  if (!r.ok) {
    let j: { code?: string; message?: string } = {};
    try { j = await r.json(); } catch { /* مفيش جسم */ }
    if (r.status === 503 && j.code === "maintenance") { maintenance = j.message ?? "التطبيق في صيانة"; mSubs.forEach((f) => f()); }
    throw new ApiError(r.status, j.code ?? "error", j.message ?? `HTTP ${r.status}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const toAbs = (u: string) => (u.startsWith("/uploads/") ? API_URL + u : u);

/** يرفع Blob/File ويرجّع رابط نسبي صالح للإرسال في attachment.url / photoUrl */
export async function uploadBlob(blob: Blob, name: string): Promise<{ name: string; size: number; mime: string; url: string }> {
  const fd = new FormData();
  fd.append("file", blob, name);
  return api("/uploads", { form: fd });
}

/** data: أو blob: URL → يرفعه ويرجّع الرابط؛ أي رابط تاني بيرجع زي ما هو */
export async function ensureUploaded(url: string | undefined, name: string): Promise<string | undefined> {
  if (!url) return url;
  if (!url.startsWith("data:") && !url.startsWith("blob:")) return url.startsWith(API_URL + "/uploads/") ? url.slice(API_URL.length) : url;
  const blob = await (await fetch(url)).blob();
  return (await uploadBlob(blob, name)).url;
}

export async function requestOtp(channel: "phone" | "email", target: string) {
  await api("/auth/otp/request", { body: { channel, target }, auth: false });
}
export async function verifyOtp(channel: "phone" | "email", target: string, code: string) {
  const j = await api<{ accessToken: string; refreshToken: string; user: { id: string } }>("/auth/otp/verify", { body: { channel, target, code }, auth: false });
  setSession({ access: j.accessToken, refresh: j.refreshToken, meId: j.user.id });
  return j.user;
}
export async function logoutApi() {
  try { await api("/auth/logout", { method: "POST" }); } catch { /* تجاهل */ }
  setSession(null);
}
