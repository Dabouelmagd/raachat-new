import { loc, tr } from "./i18n";

const day = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
export const sameDay = (a: number, b: number) => day(a) === day(b);

/** فاصل اليوم: اليوم / أمس / تاريخ كامل */
export function dayLabel(ms: number): string {
  const diff = Math.round((day(Date.now()) - day(ms)) / 86400000);
  if (diff === 0) return tr("اليوم", "Today");
  if (diff === 1) return tr("أمس", "Yesterday");
  return new Intl.DateTimeFormat(loc(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
}

/** التاريخ + الساعة الكاملين للرسالة */
export function fullStamp(ms: number): string {
  return new Intl.DateTimeFormat(loc(), { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(ms));
}
