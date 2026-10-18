import { useSyncExternalStore } from "react";

/** وضع الباك إند الحقيقي: VITE_API_URL (مثلاً https://api.example.com). من غيره اللوحة بتشتغل ببيانات تجريبية. */
export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const API_ON = API_URL !== "";

const KEY = "rachat-admin-session";
let session = null;
let remember = true; // "تذكرني": الجلسة في localStorage (بتفضل بعد قفل المتصفح). من غيره في sessionStorage (بتخلص بقفل التبويب).
try {
  const l = localStorage.getItem(KEY), s = sessionStorage.getItem(KEY);
  session = JSON.parse(l || s || "null");
  remember = !!l || !s;
} catch { /* التخزين غير متاح */ }
const subs = new Set();
export function setSession(s, rememberMe = remember) {
  session = s; remember = rememberMe;
  try {
    localStorage.removeItem(KEY); sessionStorage.removeItem(KEY);
    if (s) (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
  } catch { /* تجاهل */ }
  subs.forEach((f) => f());
}
export const isRemembered = () => remember;

/** دخول مباشر من التطبيق: التذكرة في #h=... بتتبدّل بجلسة وتتشال من العنوان فورًا */
export const hasHandoff = () => /^#h=/.test(location.hash);
export async function consumeHandoff() {
  const code = decodeURIComponent(location.hash.slice(3));
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* تجاهل */ }
  try {
    const r = await fetch(`${API_URL}/auth/handoff/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (!r.ok) return (await r.json().catch(() => ({}))).message || "تعذّر الدخول المباشر";
    const j = await r.json();
    setSession({ access: j.accessToken, refresh: j.refreshToken }, true);
    return "";
  } catch { return "تعذّر الاتصال بالسيرفر"; }
}
export const useSession = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => session);

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

let refreshing = null;
async function refresh() {
  if (!session) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: session.refresh }) });
      if (!r.ok) return false;
      const j = await r.json();
      setSession({ ...session, access: j.accessToken, refresh: j.refreshToken }, remember);
      return true;
    } catch { return false; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

export async function api(path, { method = "GET", body, auth = true } = {}, retry = true) {
  const headers = { "Content-Type": "application/json" };
  if (auth && session) headers.Authorization = `Bearer ${session.access}`;
  let r;
  try { r = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, "network", "تعذّر الاتصال بالسيرفر"); }
  if (r.status === 401 && auth && retry && (await refresh())) return api(path, { method, body, auth }, false);
  if (r.status === 401 && auth) setSession(null);
  if (r.status === 204) return undefined;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.code || "error", j.message || "حصل خطأ");
  return j;
}

/** أنواع صور الإعلانات المسموح بها — نفس امتدادات `isOwnUpload` على السيرفر. */
export const AD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const AD_IMAGE_MAX = 10 * 1024 * 1024; // نفس حد multer على السيرفر

/**
 * رفع صورة الإعلان على `POST /uploads` وإرجاع `{url,...}`.
 *
 * **مفيش `Content-Type` بإيدينا** — المتصفح هو اللي بيحدّده مع الـ boundary،
 * ولو كتبناه بنفسنا الطلب بيوصل ناقصًا وmulter يرفضه. والفحص هنا قبل الرفع
 * عشان الملف الكبير أو النوع الغلط يطلّع رسالة عربية واضحة بدل خطأ multer.
 */
export async function uploadAdImage(file, retry = true) {
  if (!AD_IMAGE_TYPES.includes(file.type)) throw new ApiError(0, "bad_type", "الصورة لازم تكون PNG أو JPG أو WebP أو GIF");
  if (file.size > AD_IMAGE_MAX) throw new ApiError(0, "too_big", "حجم الصورة أكبر من ١٠ ميجا");
  const fd = new FormData();
  fd.append("file", file);
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.access}`;
  let r;
  try { r = await fetch(`${API_URL}/uploads`, { method: "POST", headers, body: fd }); }
  catch { throw new ApiError(0, "network", "تعذّر الاتصال بالسيرفر"); }
  if (r.status === 401 && retry && (await refresh())) return uploadAdImage(file, false);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.code || "error", j.message || "تعذّر رفع الصورة");
  return j;
}

export const requestOtp = (contact) => api("/auth/otp/request", { method: "POST", auth: false, body: { channel: contact.includes("@") ? "email" : "phone", target: contact.trim() } });
export async function verifyOtp(contact, code, rememberMe = true) {
  const j = await api("/auth/otp/verify", { method: "POST", auth: false, body: { channel: contact.includes("@") ? "email" : "phone", target: contact.trim(), code: code.trim() } });
  setSession({ access: j.accessToken, refresh: j.refreshToken }, rememberMe);
}
export async function logout() { try { await api("/auth/logout", { method: "POST" }); } catch { /* تجاهل */ } setSession(null); }
