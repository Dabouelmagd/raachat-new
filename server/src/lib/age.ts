/** حساب السن من تاريخ الميلاد وقواعد خدمات ١٨+ */
export const ADULT_AGE = 18;

/** السن بالسنين الكاملة في تاريخ معيّن (افتراضيًا النهارده) */
export function ageOn(birth: Date, now: Date = new Date()): number {
  let a = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) a--;
  return a;
}

/** بالغ؟ تاريخ ميلاد غير محدد = لأ (الأحوط)، عشان الخدمات المالية ما تتفتحش من غير تحديد سن. */
export const isAdult = (birth: Date | null | undefined, now?: Date): boolean =>
  !!birth && ageOn(birth, now) >= ADULT_AGE;

/** تاريخ ميلاد مقبول: مش في المستقبل ومش أقدم من ١٢٠ سنة */
export function validBirthDate(d: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() > now.getTime()) return false;
  return ageOn(d, now) <= 120;
}
