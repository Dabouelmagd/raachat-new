/**
 * **المصدر الوحيد لأي حساب «يوم» أو «شهر» بمعنى تقويمي للمستخدم.**
 *
 * السبب إن الملف ده موجود: اتنين عطل صامت اتولدوا من إن كل ملف كان بيحسب التقويم
 * بطريقته —
 *   ١) فرق مثبّت `+02:00` في أرقام لوحة الإدارة → كل أرقام «النهارده» صفر من ١٢ لـ ١
 *      بالليل في التوقيت الصيفي.
 *   ٢) الشهر **العالمي** في سقف فواتير الفئة ١٨–٢١ → السقف ينفتح مرتين في نفس شهر
 *      القاهرة (٤٠٠٠ جنيه في شهر سقفه ٢٠٠٠).
 *
 * القاعدة: مفيش `getUTCMonth()`/`getUTCDate()` على `new Date()` في أي كود بيعبّر عن
 * تقويم المستخدم. مصر توقيتها +02 شتاءً و+03 صيفًا، والفرق **بيتغير**، فمينفعش يتثبّت.
 */
export const CAIRO_TZ = "Africa/Cairo";

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

const pad = (n: number) => String(n).padStart(2, "0");

/** أجزاء وقت القاهرة في لحظة معيّنة. `day` = YYYY-MM-DD بصفر على الشمال. */
export function cairoParts(now: Date = new Date()) {
  const [date, time] = FMT.format(now).split(", ");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi, s] = time.split(":").map(Number);
  return { y, m, d, h, mi, s, day: date };
}

/** تاريخ النهارده بتوقيت القاهرة — YYYY-MM-DD */
export const todayCairo = (now: Date = new Date()): string => cairoParts(now).day;

/** فرق القاهرة عن UTC بالمللي في لحظة معيّنة (بيتغير بالتوقيت الصيفي) */
function cairoOffsetMs(at: Date): number {
  const p = cairoParts(at);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - (at.getTime() - at.getMilliseconds());
}

/**
 * بداية «النهارده» بتوقيت القاهرة.
 * بنطرح الوقت المنقضي من اليوم (ساعة/دقيقة/ثانية القاهرة) من اللحظة الحالية — فالنتيجة
 * **مستحيل تبقى في المستقبل** مهما كان التوقيت الصيفي، وده بالظبط اللي العطل الأول كسره.
 */
export function startOfCairoDay(now: Date = new Date()): Date {
  const { h, mi, s } = cairoParts(now);
  return new Date(now.getTime() - (((h * 60 + mi) * 60 + s) * 1000 + now.getMilliseconds()));
}

/**
 * لحظة منتصف الليل بتوقيت القاهرة ليوم معيّن (YYYY-MM-DD).
 * بنحسب على مرتين: تخمين بفرق اللحظة التقريبية، وتصحيح بالفرق في اللحظة الصح — عشان
 * الشهر اللي فيه تغيير توقيت صيفي مايزحفش ساعة.
 */
export function cairoMidnight(day: string): Date {
  const wall = new Date(day + "T00:00:00Z").getTime();
  const guess = wall - cairoOffsetMs(new Date(wall));
  return new Date(wall - cairoOffsetMs(new Date(guess)));
}

/** بداية الشهر الميلادي الحالي بتوقيت القاهرة */
export function startOfCairoMonth(now: Date = new Date()): Date {
  const { y, m } = cairoParts(now);
  return cairoMidnight(`${y}-${pad(m)}-01`);
}
