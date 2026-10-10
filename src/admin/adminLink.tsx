import { useEffect, useState } from "react";
import { API_ON, api } from "../api/client";

/** عنوان لوحة الإدارة: VITE_ADMIN_URL، أو نفس النطاق بس بـ admin. بدل app. */
export const ADMIN_URL: string = (() => {
  const v = (import.meta.env.VITE_ADMIN_URL as string | undefined) ?? "";
  if (v) return v.replace(/\/$/, "");
  if (typeof location === "undefined") return "";
  return /^app\./.test(location.host) ? `${location.protocol}//${location.host.replace(/^app\./, "admin.")}` : "";
})();

/** هل المستخدم الحالي من فريق الإدارة؟ (الأيقونة بتظهر للموظفين بس) */
export function useIsStaff() {
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    if (!API_ON || !ADMIN_URL) return;
    let live = true;
    api("/admin/me").then(() => live && setStaff(true)).catch(() => live && setStaff(false));
    return () => { live = false; };
  }, []);
  return staff;
}

/** يفتح اللوحة بدخول مباشر: تذكرة لمرة واحدة (60 ثانية) في الـ fragment، فمفيش كود تحقق ولا تسجيل تاني. */
export async function openAdmin(): Promise<boolean> {
  const w = window.open("", "_blank"); // نفتحها فورًا عشان المتصفح ما يحجبهاش
  try {
    const { code } = await api<{ code: string }>("/admin/handoff", { method: "POST", body: {} });
    const url = `${ADMIN_URL}/#h=${encodeURIComponent(code)}`;
    if (w) w.location.href = url; else window.location.href = url;
    return true;
  } catch {
    w?.close();
    return false;
  }
}
