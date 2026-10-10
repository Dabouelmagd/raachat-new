import { useSyncExternalStore } from "react";
import { DICT } from "./dict";

/**
 * اللغة (عربي / English).
 * الاستخدام:
 *   داخل كومبوننت:   const t = useT();   t("الإشعارات", "Notifications")
 *   خارج الكومبوننت (دوال/داتا): tr("نص", "text")  — بتقرا اللغة الحالية وقت الاستدعاء،
 *   فاستخدميها جوّه دالة أو getter مش في ثابت على مستوى الملف.
 * الاتجاه: useDir() بيرجّع "rtl" | "ltr"، والـ App بيطبّقه على الجذر.
 */
export type Lang = "ar" | "en" | "zh" | "fr";
export const LANGS: Lang[] = ["ar", "en", "zh", "fr"];
const KEY = "rachat-lang";

let lang: Lang = "ar";
try {
  const v = localStorage.getItem(KEY);
  if (v === "en" || v === "ar" || v === "zh" || v === "fr") lang = v;
} catch {
  /* التخزين غير متاح */
}

const subs = new Set<() => void>();
const sub = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* تجاهل */
  }
  try {
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(sub, () => lang, () => lang);
}

/** نفس useLang بس بيرجّع الاتجاه */
export function useDir(): "rtl" | "ltr" {
  return useLang() === "ar" ? "rtl" : "ltr";
}

/** ترجمة بدون hook (للدوال والداتا) */
export function tr(ar: string, en: string): string {
  if (lang === "ar") return ar;
  if (lang === "en") return en;
  return translateEn(en, lang);
}

// الصيني/الفرنسي: بندوّر على النص الإنجليزي في القاموس (dict.ts)، ولو مش موجود بنرجع الإنجليزي
const patterns: { re: RegExp; vars: string[]; out: Record<string, string> }[] = [];
for (const [k, v] of Object.entries(DICT)) {
  if (!k.includes("${")) continue;
  const vars: string[] = [];
  const src = k.split(/\$\{(.*?)\}/);
  let re = "";
  src.forEach((part, i) => {
    if (i % 2) { vars.push(part); re += "(.+?)"; } else re += part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  patterns.push({ re: new RegExp("^" + re + "$", "s"), vars, out: v });
}
function translateEn(en: string, l: "zh" | "fr"): string {
  const hit = DICT[en];
  if (hit && hit[l]) return hit[l];
  for (const p of patterns) {
    const m = en.match(p.re);
    const tpl = p.out[l];
    if (m && tpl) {
      let r = tpl;
      p.vars.forEach((v, i) => { r = r.split("${" + v + "}").join(m[i + 1]); });
      return r;
    }
  }
  return en;
}

/** ترجمة داخل الكومبوننت — بتعمل re-render لما اللغة تتغير */
export function useT() {
  const l = useLang();
  return (ar: string, en: string) => (l === "ar" ? ar : l === "en" ? en : translateEn(en, l));
}

/** أرقام: عربية-هندية في العربي، لاتينية في الإنجليزي */
export function num(n: number | string): string {
  const s = String(n);
  return lang === "ar" ? s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : s;
}

/** locale للتواريخ والأرقام */
export function loc(): string {
  return lang === "en" ? "en-US" : lang === "zh" ? "zh-CN" : lang === "fr" ? "fr-FR" : "ar-EG";
}
