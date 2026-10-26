import { useSyncExternalStore } from "react";
import { getLang, tr, useLang } from "../i18n";
import { API_ON, api, ensureUploaded, toAbs } from "../api/client";
import { isAdultDay } from "../age";

export interface Profile {
  name: string;
  status: string;
  color: string; // لون الصورة الرمزية
  photo?: string; // صورة شخصية (data URL) — لو موجودة بتظهر بدل الحرف
  /** تاريخ الميلاد YYYY-MM-DD — مطلوب لأي حساب جديد (رع شات ١٨+)، و`undefined` بيبقى
   *  للحسابات المنشأة قبل ١٣ أكتوبر ٢٠٢٦ وبتتعامل معاملة غير محدَّدة السن */
  birthDate?: string;
}

export const AVATAR_COLORS = ["#E1523E", "#F2795C", "#C9A227", "#5B2621", "#7a4a2a"];

// لو المستخدم ما عدّلش بياناته، الافتراضي بيتبع اللغة الحالية؛ لو عدّل بتفضل بياناته زي ما كتبها
let saved: Profile | null = null;
let cache: { lang: string; value: Profile } | null = null;
const defaults = (): Profile => ({
  name: tr("كريم الشناوي", "Karim El-Shennawy"),
  status: tr("متاح للدردشة", "Available to chat"),
  color: AVATAR_COLORS[0],
  // في وضع الديمو (معاينة بدون سيرفر) الحساب التجريبي بالغ عشان تبان خدمات ١٨+.
  // في وضع الـ API مفيش افتراضي — بننتظر /me، والأحوط إن المحفظة تكون مقفولة لحد ما ترد.
  birthDate: API_ON ? undefined : "1995-06-12",
});
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
        const body: Record<string, unknown> = { name: saved!.name, status: saved!.status, color: saved!.color, photoUrl };
        if (saved!.birthDate) body.birthDate = saved!.birthDate; // السيرفر بيرفض الفاضي، ومفيش مسح لتاريخ الميلاد
        await api("/me", { method: "PATCH", body });
      } catch (e) { console.error("حفظ الملف الشخصي فشل:", e); }
    })();
  }
}

/** بيانات المستخدم من الباك إند (وضع API) */
export function setProfileFromServer(u: { name: string; status: string; color: string; photo?: string; birthDate?: string | null }) {
  saved = { name: u.name, status: u.status, color: u.color, photo: u.photo ? toAbs(u.photo) : undefined, birthDate: u.birthDate ?? undefined };
  subs.forEach((f) => f());
}

/**
 * هل المستخدم بالغ؟ — يتحكم في إظهار خدمات ١٨+ (المحفظة ودفع الفواتير) بس.
 * السيرفر هو المرجع الحقيقي؛ ده للواجهة عشان ما نوريهوش أزرار هترجع 403.
 */
export function useIsAdult(): boolean {
  return isAdultDay(useProfile().birthDate);
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
