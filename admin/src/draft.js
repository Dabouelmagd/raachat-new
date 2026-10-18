/**
 * **مسوّدة النموذج — بتعيش بعد إعادة تحميل الصفحة.**
 *
 * نموذج الحملة طويل: معلن وعنوان ونصّ ورابط ومواضع وتواريخ وخصم **وصور
 * مرفوعة لكل موضع**. وقبل كده أي إعادة تحميل كانت بتضيّعه بالكامل — ومش
 * بس الكتابة: الصور اللي اترفعت فعلًا بتفضل على القرص **بلا مرجع** (ملفات
 * يتيمة) والشغل يتعاد من الأول.
 *
 * وإعادة التحميل مش حالة نادرة هنا: تبويب اللوحة بيفضل مفتوح أيامًا، وفيه
 * تحديث تلقائي بعد كل نشرة، ومتصفح الموبايل بيعيد تحميل التبويبات لوحده.
 *
 * الدالة **خالصة وبلا أي استيراد** عن قصد (نفس نمط `fileUrl.js`) عشان
 * تتجرّب لوحدها من غير بيئة Vite ولا متصفح.
 */
const PREFIX = "rachat.draft.";

/** مفتاح المسوّدة: الحملة الجديدة ليها مفتاحها، وكل تعديل بمعرّف حملته — فمفيش خلط */
export const draftKey = (id) => PREFIX + (id ? `ad.${id}` : "ad.new");

/**
 * القراءة والكتابة كلها جوه `try` — `localStorage` بيرمي في التصفّح الخاص
 * وفي المتصفح اللي بيانات الموقع فيه مقفولة، ومسوّدة ضايعة مشكلة أهون من
 * لوحة مابتفتحش خالص.
 */
export function loadDraft(key, store) {
  try {
    const raw = (store ?? globalThis.localStorage)?.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    // الشكل لازم يكون كائنًا — سطر تالف أو مصفوفة بيتجاهلوا بدل ما يكسروا النموذج
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch { return null; }
}

export function saveDraft(key, value, store) {
  try {
    (store ?? globalThis.localStorage)?.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; } // الحصّة خلصت أو التخزين مقفول
}

export function clearDraft(key, store) {
  try { (store ?? globalThis.localStorage)?.removeItem(key); } catch { /* مقفول */ }
}

/**
 * هل المسوّدة فيها شغل فعلي يستاهل نرجّعه؟
 *
 * النموذج الفاضي بيتحفظ كمان (أي تغيير بيكتب)، فمن غير الفحص ده المستخدم
 * بيشوف «فيه مسوّدة محفوظة» على نموذج مافيهوش حاجة — إشعار بلا معنى
 * بيدرّبه إنه يتجاهل الإشعارات.
 */
export function draftHasWork(d, blank) {
  if (!d || !blank) return false;
  const skip = new Set(["start", "end", "approve", "house"]); // قيم افتراضية مش شغل
  for (const k of Object.keys(blank)) {
    if (skip.has(k)) continue;
    const a = d[k], b = blank[k];
    if (a === undefined) continue;
    if (Array.isArray(b) ? (a || []).length > 0 : typeof b === "object" && b !== null ? Object.keys(a || {}).length > 0 : a !== b) return true;
  }
  return false;
}
