import { PHRASES, type Phrase } from "./phrases";

export type TLang = "ar" | "en" | "zh" | "fr";

export const TLANG_NAMES: Record<TLang, string> = { ar: "العربية", en: "English", zh: "中文", fr: "Français" };
export const TLANG_SPEECH: Record<TLang, string> = { ar: "ar-EG", en: "en-US", zh: "zh-CN", fr: "fr-FR" };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[ً-ٰٟ̀-ͯ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\p{P}\p{S}\p{Emoji_Presentation}\s]+/gu, "");

const index = new Map<string, { p: Phrase; lang: TLang }>();
for (const p of PHRASES) {
  p.ar.forEach((v) => index.set(norm(v), { p, lang: "ar" }));
  index.set(norm(p.en), { p, lang: "en" });
  index.set(norm(p.zh), { p, lang: "zh" });
  index.set(norm(p.fr), { p, lang: "fr" });
}

/** تحديد لغة النص بالحروف (للنصوص المجهولة) */
export function detect(text: string): TLang {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[一-鿿]/.test(text)) return "zh";
  if (/[àâçéèêëîïôûùüÿœ]|\b(le|la|les|je|tu|est|une?|des|bonjour|merci)\b/i.test(text)) return "fr";
  return "en";
}

export function phraseText(p: Phrase, lang: TLang): string {
  return lang === "ar" ? p.ar[0] : p[lang];
}

export interface TranslateResult {
  text: string | null; // null = مش متاحة في الديمو
  from: TLang;
}

/**
 * نقطة الربط بالباك إند: استبدلي الجسم ده بنداء POST /translate { text, to, from? }
 * (Google Cloud Translation / DeepL / LLM) — نفس شكل النتيجة.
 */
export async function translate(text: string, to: TLang, from?: TLang): Promise<TranslateResult> {
  const hit = index.get(norm(text));
  const src = from ?? hit?.lang ?? detect(text);
  if (src === to) return { text, from: src };
  if (!hit) return { text: null, from: src };
  return { text: phraseText(hit.p, to), from: src };
}

/** متزامنة للاستخدام في الديمو (المكالمة) */
export function translateSync(text: string, to: TLang): string | null {
  const hit = index.get(norm(text));
  if (!hit) return null;
  return phraseText(hit.p, to);
}
