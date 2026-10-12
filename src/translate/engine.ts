import { API_ON, ApiError, api } from "../api/client";
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

/** كاش محلي: نفس النص لنفس اللغة مابيتنادى عليه مرتين في نفس الجلسة (والمزوّد بيحاسب بالحرف) */
const net = new Map<string, string | null>();
/** السيرفر قال «محرك الترجمة غير مُفعّل» → مانزعجوش بعد كده */
let engineOff = false;

/**
 * الترجمة على ٣ مستويات، والترتيب مقصود عشان الفاتورة:
 *   ١) قاموس العبارات المحفوظ جوه التطبيق — مجاني وفوري وبيشتغل أوفلاين.
 *   ٢) كاش الجلسة — نفس الرسالة في جروب مابتتحاسبش لكل عضو.
 *   ٣) `POST /translate` على السيرفر (وهو كمان عنده كاش أسبوعي مشترك).
 * ولو السيرفر مش مفعّل (501) أو فشل، بنرجّع `text: null` زي ما كان — والواجهة
 * بتعرض إن الترجمة الكاملة مش متاحة بدل ما تكسر.
 *
 * ملحوظة: مابنبعتش `from` للمزوّد لما المستخدم ما يحدّدهاش — تحديد اللغة بالحروف
 * عندنا تقريبي، والمزوّد بيحددها أدق وبنفس التكلفة.
 */
export async function translate(text: string, to: TLang, from?: TLang): Promise<TranslateResult> {
  const hit = index.get(norm(text));
  const src = from ?? hit?.lang ?? detect(text);
  if (src === to) return { text, from: src };
  if (hit) return { text: phraseText(hit.p, to), from: src };
  if (!API_ON || engineOff) return { text: null, from: src };

  const ck = `${to}|${text}`;
  if (net.has(ck)) return { text: net.get(ck) ?? null, from: src };
  try {
    const r = await api<{ text: string; from?: string }>("/translate", { method: "POST", body: { text, to, ...(from ? { from } : {}) } });
    net.set(ck, r.text);
    const back = r.from?.slice(0, 2);
    const detected = back && back in TLANG_NAMES ? (back as TLang) : src;
    return { text: r.text, from: detected };
  } catch (e) {
    // ٥٠١ = المحرك مش متضبط على السيرفر: حالة دايمة، فمنكررهاش كل رسالة.
    if (e instanceof ApiError && e.status === 501) engineOff = true;
    else net.set(ck, null); // فشل على النص ده: منعيدوش في نفس الجلسة
    return { text: null, from: src };
  }
}

/**
 * نسخة متزامنة للمكالمات: قاموس العبارات بس.
 * المكالمة بتترجم كلام لحظي، ونداء شبكة لكل جزء كلام = تأخير + فاتورة كبيرة،
 * فسايبينها على القاموس لحد ما يبقى فيه قرار صريح بترجمة المكالمات.
 */
export function translateSync(text: string, to: TLang): string | null {
  const hit = index.get(norm(text));
  if (!hit) return null;
  return phraseText(hit.p, to);
}
