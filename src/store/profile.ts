import { useSyncExternalStore } from "react";
import { getLang, tr, useLang } from "../i18n";
import { API_ON, api, ensureUploaded, toAbs } from "../api/client";

export interface Profile {
  name: string;
  status: string;
  color: string; // لون الصورة الرمزية
  photo?: string; // صورة شخصية (data URL) — لو موجودة بتظهر بدل الحرف
}

export const AVATAR_COLORS = ["#E1523E", "#F2795C", "#C9A227", "#5B2621", "#7a4a2a"];

// لو المستخدم ما عدّلش بياناته، الافتراضي بيتبع اللغة الحالية؛ لو عدّل بتفضل بياناته زي ما كتبها
let saved: Profile | null = null;
let cache: { lang: string; value: Profile } | null = null;
const defaults = (): Profile => ({ name: tr("كريم الشناوي", "Karim El-Shennawy"), status: tr("متاح للدردشة", "Available to chat"), color: AVATAR_COLORS[0] });
const subs = new Set<() => void>();

function current(): Profile {
  if (saved) return saved;
  const l = getLang();
  if (!cache || cache.lang !== l) cache = { lang: l, value: defaults() };
  return cache.value;
}

export function saveProfile(next: Profile) {
  saved = { ...next, name: next.name.trim() || current().name };
  subs.forEach((f) => f());
  if (API_ON) {
    // مزامنة مع الباك إند (الصورة بتترفع الأول ثم يتحفظ رابطها)
    void (async () => {
      try {
        const photoUrl = (await ensureUploaded(saved!.photo, "avatar.jpg")) ?? null;
        await api("/me", { method: "PATCH", body: { name: saved!.name, status: saved!.status, color: saved!.color, photoUrl } });
      } catch (e) { console.error("حفظ الملف الشخصي فشل:", e); }
    })();
  }
}

/** بيانات المستخدم من الباك إند (وضع API) */
export function setProfileFromServer(u: { name: string; status: string; color: string; photo?: string }) {
  saved = { name: u.name, status: u.status, color: u.color, photo: u.photo ? toAbs(u.photo) : undefined };
  subs.forEach((f) => f());
}

export function useProfile(): Profile {
  useLang(); // عشان يتحدّث لما اللغة تتغير
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    current,
    current
  );
}
