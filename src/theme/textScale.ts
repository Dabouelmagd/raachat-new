import { useSyncExternalStore } from "react";

/**
 * حجم الخط في التطبيق كله (والإيموجي معاه، لأنها نص).
 *
 * الطريقة: بنغيّر `font-size` بتاع `<html>`. كل مقاسات Tailwind بالـ `rem`،
 * يعني نسبة من القيمة دي — فالنص **والمسافات** بيكبروا مع بعض بدل ما النص
 * يكبر جوّه صناديق صغيّرة ويتقص.
 *
 * السقف ١٢٥٪ عن قصد: أكبر من كده بيبدأ يكسر الشاشات الضيقة (٣٢٠px).
 * وخانات الكتابة محطوط لها `max(16px, 1rem)` في `index.css` — بتكبر مع الخط
 * بس عمرها ما تنزل تحت ١٦px، وإلا سفاري بيكبّر الصفحة لوحده.
 */
export const TEXT_SCALES: [number, string, string][] = [
  [0.9, "صغير", "Small"],
  [1, "عادي", "Normal"],
  [1.12, "كبير", "Large"],
  [1.25, "أكبر", "Larger"],
];

const KEY = "rachat-text-scale";
const subs = new Set<() => void>();
let current = read();

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (TEXT_SCALES.some(([s]) => s === v)) return v;
  } catch { /* التخزين غير متاح */ }
  return 1;
}

/** بيتنادى مرة عند الإقلاع وكل ما المستخدم يغيّر */
export function applyTextScale(scale = current) {
  document.documentElement.style.fontSize = `${(16 * scale).toFixed(2)}px`;
}

export function setTextScale(scale: number) {
  current = TEXT_SCALES.some(([s]) => s === scale) ? scale : 1;
  try { localStorage.setItem(KEY, String(current)); } catch { /* تجاهل */ }
  applyTextScale();
  subs.forEach((f) => f());
}

export function useTextScale(): number {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => current);
}
