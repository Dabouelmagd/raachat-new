/**
 * حساب السن — نسخة الواجهة.
 * **رع شات للبالغين: ١٨ سنة أو أكثر** (الشروط البند ٢، من ١٣ أكتوبر ٢٠٢٦) — وكل حساب
 * جديد بيتطلّب تاريخ ميلاد. والقفل ده بيظهر للحسابات **المنشأة قبل** التاريخ ده اللي
 * سنّها غير محدَّد: خدمات المحفظة مغلقة عليها لحد ما يُحدَّد (السياسة البند ١٠).
 * نفس المنطق موجود في server/src/lib/age.ts وهو **المرجع**: الواجهة بتقفل الأزرار
 * بس عشان شكل مريح، والسيرفر هو اللي بيمنع فعلًا.
 */
export const ADULT_AGE = 18;

/**
 * سن الأهلية الكاملة في مصر ٢١ سنة (م٤٤ مدني). اللي بين ١٨ و٢١ المحفظة مفتوحة له
 * بسقوف منخفضة، لأن تصرفاته المالية قابلة للإبطال لمصلحته (م١١١).
 * السقوف نفسها بتيجي من السيرفر في `/wallet` — هو المرجع.
 */
export const FULL_CAPACITY_AGE = 21;

/** سقوف المحفظة زي ما السيرفر بيرجّعها */
export interface WalletLimits {
  tx: number;
  balance: number;
  month: number;
  monthUsed: number;
}

/** كامل الأهلية (٢١+)؟ — غير محدد = لأ */
export const isFullCapacityDay = (day: string | undefined | null, now?: Date): boolean => {
  const d = parseDay(day);
  return !!d && ageOn(d, now) >= FULL_CAPACITY_AGE;
};

/**
 * أرقام **للمعاينة بدون سيرفر بس** (وضع الديمو). المرجع الحقيقي هو اللي بيرجع من
 * `/wallet` في `YOUNG_LIMITS` على السيرفر — لو اتغيرت هناك، دي للعرض بس ومش شرط تطابقها.
 */
export const DEMO_YOUNG_LIMITS: WalletLimits = { tx: 500, balance: 1000, month: 2000, monthUsed: 0 };

/** السن بالسنين الكاملة (بالتوقيت العالمي عشان ما يختلفش حسب جهاز المستخدم) */
export function ageOn(birth: Date, now: Date = new Date()): number {
  let a = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) a--;
  return a;
}

/** تاريخ الميلاد كنص YYYY-MM-DD (زي ما بيجي من الـ API ومن <input type="date">) */
export const parseDay = (s: string | undefined | null): Date | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
};

/** غير محدد = مش بالغ (الأحوط) — نفس سلوك السيرفر */
export const isAdultDay = (day: string | undefined | null, now?: Date): boolean => {
  const d = parseDay(day);
  return !!d && ageOn(d, now) >= ADULT_AGE;
};

/** يرفض التواريخ المستقبلية والمستحيلة (فوق ١٢٠ سنة) */
export function validBirthDay(day: string, now: Date = new Date()): boolean {
  const d = parseDay(day);
  if (!d) return false;
  if (d.getTime() > now.getTime()) return false;
  return ageOn(d, now) <= 120;
}

/** أقصى تاريخ مسموح في <input type="date"> = النهارده */
export const todayDay = (now: Date = new Date()): string => now.toISOString().slice(0, 10);
