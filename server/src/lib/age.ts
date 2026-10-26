/** حساب السن من تاريخ الميلاد وقواعد خدمات ١٨+ */
import { cairoParts, todayCairo } from "./cairo.js";
import { HttpError } from "./errors.js";

export const ADULT_AGE = 18;

/**
 * سن الأهلية الكاملة في القانون المصري ٢١ سنة (المادة ٤٤ مدني).
 * اللي بين ١٨ و٢١ لسه «ناقص أهلية»، وتصرفاته المالية الدائرة بين النفع والضرر
 * قابلة للإبطال لمصلحته (المادة ١١١). فالمحفظة مفتوحة له بسقوف منخفضة، عشان
 * لو حصل إبطال يكون المبلغ محدود. التفاصيل: docs/legal/age-and-capacity-egypt.md
 */
export const FULL_CAPACITY_AGE = 21;

/** سقوف الفئة ١٨–٢١ بالجنيه المصري (أرقام قابلة للتغيير من مكان واحد) */
export const YOUNG_LIMITS = {
  /** أقصى مبلغ للعملية الواحدة (شحن أو دفع فاتورة) */
  tx: 500,
  /** أقصى رصيد في المحفظة في أي وقت */
  balance: 1000,
  /** أقصى مجموع فواتير في الشهر الميلادي الحالي */
  month: 2000,
} as const;

/**
 * السن بالسنين الكاملة في تاريخ معيّن (افتراضيًا النهارده).
 * **اليوم بتوقيت القاهرة** مش UTC: `birthDate` عمود `@db.Date` (منتصف ليل UTC) فأجزاؤه
 * صح، إنما «النهارده» لازم تبقى بتقويم المستخدم — غير كده اللي يكمّل ١٨ النهارده يتقال
 * له «ممنوع» أول ٢–٣ ساعات من يوم عيد ميلاده (والعكس في ٢١: السقوف تفضل مطبّقة).
 */
export function ageOn(birth: Date, now: Date = new Date()): number {
  const t = cairoParts(now);
  let a = t.y - birth.getUTCFullYear();
  const m = t.m - 1 - birth.getUTCMonth();
  if (m < 0 || (m === 0 && t.d < birth.getUTCDate())) a--;
  return a;
}

/** بالغ؟ تاريخ ميلاد غير محدد = لأ (الأحوط)، عشان الخدمات المالية ما تتفتحش من غير تحديد سن. */
export const isAdult = (birth: Date | null | undefined, now?: Date): boolean =>
  !!birth && ageOn(birth, now) >= ADULT_AGE;

/** كامل الأهلية (٢١+)؟ */
export const isFullCapacity = (birth: Date | null | undefined, now?: Date): boolean =>
  !!birth && ageOn(birth, now) >= FULL_CAPACITY_AGE;

/**
 * سقوف المحفظة للمستخدم ده: `null` = مفيش سقوف (٢١+).
 * البالغ اللي لسه تحت ٢١ بيرجّع السقوف، والأصغر من ١٨ مابيوصلش هنا أصلًا (الحارس بيمنعه).
 */
export const walletLimits = (birth: Date | null | undefined, now?: Date): typeof YOUNG_LIMITS | null =>
  isFullCapacity(birth, now) ? null : YOUNG_LIMITS;

/**
 * تاريخ ميلاد مقبول: مش في المستقبل ومش أقدم من ١٢٠ سنة.
 * المقارنة **بيوم القاهرة** مش بلحظة UTC — غير كده تاريخ النهارده نفسه بيترفض أول
 * ٢–٣ ساعات من اليوم (لأنه بيتفسّر كمنتصف ليل UTC اللي لسه ما جاش).
 */
export function validBirthDate(d: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(d.getTime())) return false;
  if (d.toISOString().slice(0, 10) > todayCairo(now)) return false;
  return ageOn(d, now) <= 120;
}

/**
 * **حارس السن عند إنشاء أي حساب — رع شات تطبيق ١٨+ (قرار داليا ١٣ أكتوبر ٢٠٢٦).**
 *
 * مصدر واحد لكل مسارات إنشاء الحساب (التسجيل بكلمة سر · الدخول بكود لحساب جديد)،
 * بنفس درس «الحارس لازم يبقى على كل المسارات»: القاعدة على مسار واحد تبان مطبّقة
 * وهي متخطّاة بخطوة.
 *
 * بيرمي `HttpError` برسالة واضحة: `birth_date_required` لو ناقص،
 * `invalid_birth_date` لو التاريخ مش منطقي، `under_age` لو أقل من ١٨.
 *
 * ⚠️ **ده شرط متاجر مش حماية قانونية:** `docs/legal/age-and-capacity-egypt.md` بند ٦ —
 * القاصر اللي يكتب تاريخ ميلاد كاذب يفضل من حقه يطلب إبطال العقد (م١١٩ مدني).
 */
export function assertSignupAge(raw: unknown, now: Date = new Date()): Date {
  if (raw === undefined || raw === null || raw === "") {
    throw new HttpError(400, "birth_date_required", "اكتب تاريخ ميلادك — رع شات للبالغين (١٨ سنة أو أكثر)");
  }
  return adultBirthDate(raw, "رع شات للبالغين (١٨ سنة أو أكثر) — ماينفعش نفتح حساب لأقل من كده", now);
}

/**
 * **حارس السن عند تعديل تاريخ الميلاد لحساب موجود (قرار داليا ٢٦ أكتوبر ٢٠٢٦).**
 *
 * `PATCH /me` كان بيقبل **أي** تاريخ صالح ويحفظه — بما فيه تاريخ أقلّ من ١٨. يعني
 * المستخدم يقرّ بنفسه إنه دون السن والخادم يسجّلها ويكمّل: المحفظة تتقفل (`wallet.ts`)
 * والحساب يفضل شغّالًا. والسياسة المنشورة (البند ١٠) تقول «متى تبيّن لنا أنّ حسابًا
 * يخصّ من هو دون ١٨ سنة **أغلقناه ومحونا بياناته فورًا ودون انتظار طلب**» — فالتسجيل
 * الصامت كان **إقرارًا بالعلم بلا الإجراء الموعود**.
 *
 * والقرار: **نرفض التاريخ ولا نحذف شيئًا.** الرفض يمنع الحالة من الوجود من أصلها،
 * والحذف لا يرجع فلا يُؤتمَن على إقرار مكتوب في خانة.
 *
 * ⚠️ **فأثره: ما دام الرفض قائمًا على المسارين (`/auth/register` و`verifyOtp` و`PATCH
 * /me` و`set-birthdate.sh`)، لا يوجد طريق يُنشئ تاريخًا مخزَّنًا دون ١٨** — وفرع
 * `!isAdult` في `ads.ts` و`age_restricted` في المحفظة يخدمان الحسابات **غير محدَّدة
 * السن** (المنشأة قبل ١٣ أكتوبر ٢٠٢٦) وأي صفّ يدخل القاعدة من خارج هذه المسارات
 * (استرجاع نسخة · تعديل مباشر). فاختبارات تلك الفروع تكتب التاريخ **في القاعدة
 * مباشرةً** لأن ذلك هو مصدره الواقعي الوحيد.
 */
export function assertProfileBirthDate(raw: unknown, now: Date = new Date()): Date {
  return adultBirthDate(raw, "رع شات للبالغين (١٨ سنة أو أكثر) — ماينفعش نحفظ تاريخًا أقلّ من كده", now);
}

/** قاعدة «تاريخ ميلاد بالغ وصالح» — مصدر واحد للرسالتين، فلا يفترق الفحص عن نفسه. */
function adultBirthDate(raw: unknown, underAge: string, now: Date): Date {
  const d = new Date(String(raw));
  if (!validBirthDate(d, now)) throw new HttpError(400, "invalid_birth_date", "تاريخ الميلاد غير صحيح");
  if (ageOn(d, now) < ADULT_AGE) throw new HttpError(403, "under_age", underAge);
  return d;
}
