import { useSyncExternalStore } from "react";
import { getLang, type Lang } from "../i18n";
import type { TLang } from "../translate/engine";

/** إعدادات الترجمة الفورية (محلية — مع الباك إند تتحفظ في حساب المستخدم) */
export interface TranslateSettings {
  on: boolean;
  mine: TLang; // اللغة اللي أقرأ/أسمع بيها
  peer: TLang; // لغة الطرف التاني (اللي بتترجم ليها رسائلي)
  speak: boolean; // نطق الترجمة صوتيًا في المكالمات
}

const KEY = "rachat-translate";
const def = (): TranslateSettings => {
  const l = getLang() as Lang;
  return { on: false, mine: l, peer: l === "zh" ? "ar" : "zh", speak: false };
};
let state: TranslateSettings = def();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...state, ...JSON.parse(raw) };
} catch {
  /* التخزين غير متاح */
}
const subs = new Set<() => void>();

export function setTranslate(patch: Partial<TranslateSettings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}

export function useTranslate(): TranslateSettings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => state
  );
}
