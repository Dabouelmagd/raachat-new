import { useSyncExternalStore } from "react";

/**
 * لون **فقاعة الكلام** — غير خلفية الشات. ده بيغيّر لون رسايلك ولون رسايل الطرف
 * التاني، والخلفية تفضل زي ما هي.
 *
 * ليه ألوان النص مكتوبة مع كل اختيار: الفقاعة الفاتحة محتاجة نص غامق والعكس —
 * ولو سبنا اللون للثيم، فيه اختيارات بتبقى غير مقروءة في الوضع الفاتح أو الليلي.
 */
export interface BubbleTheme {
  id: string;
  ar: string;
  en: string;
  /** رسايلي */
  me: { bg: string; fg: string };
  /** رسايل الطرف التاني */
  them: { bg: string; fg: string };
}

export const BUBBLES: BubbleTheme[] = [
  { id: "ra", ar: "رع", en: "Ra", me: { bg: "linear-gradient(135deg,#E1523E,#F2795C)", fg: "#fff" }, them: { bg: "#EAE0CF", fg: "#2A1D19" } },
  { id: "gold", ar: "ذهبي", en: "Gold", me: { bg: "linear-gradient(135deg,#C9A227,#E0BC4A)", fg: "#1a1410" }, them: { bg: "#F3EADA", fg: "#2A1D19" } },
  { id: "nile", ar: "نيلي", en: "Nile", me: { bg: "linear-gradient(135deg,#17607a,#2b8ca8)", fg: "#fff" }, them: { bg: "#E4EEF1", fg: "#12262f" } },
  { id: "emerald", ar: "زمردي", en: "Emerald", me: { bg: "linear-gradient(135deg,#1d6b4f,#2f9068)", fg: "#fff" }, them: { bg: "#E6F0E9", fg: "#10241c" } },
  { id: "plum", ar: "بنفسجي", en: "Plum", me: { bg: "linear-gradient(135deg,#5b2a6b,#7d4190)", fg: "#fff" }, them: { bg: "#EFE6F2", fg: "#241a28" } },
  { id: "slate", ar: "رمادي هادي", en: "Quiet grey", me: { bg: "linear-gradient(135deg,#3f4a52,#55646e)", fg: "#fff" }, them: { bg: "#E8EAEC", fg: "#1d2328" } },
];

const KEY = "rachat-bubble";
const subs = new Set<() => void>();
let current = read();

function read(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && BUBBLES.some((b) => b.id === v)) return v;
  } catch { /* التخزين غير متاح */ }
  return BUBBLES[0]!.id;
}

export function setBubble(id: string) {
  current = BUBBLES.some((b) => b.id === id) ? id : BUBBLES[0]!.id;
  try { localStorage.setItem(KEY, current); } catch { /* تجاهل */ }
  subs.forEach((f) => f());
}

export function useBubble(): string {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => current);
}

export const bubbleOf = (id: string) => BUBBLES.find((b) => b.id === id) ?? BUBBLES[0]!;

/** ستايل الفقاعة جاهز للاستخدام في `style` */
export const bubbleStyle = (id: string, isMe: boolean) => {
  const side = isMe ? bubbleOf(id).me : bubbleOf(id).them;
  return { background: side.bg, color: side.fg };
};
