/**
 * لوحة ألوان «رع شات» — مستخلصة من شعار عين حورس (راجع القسم 2 من الـ PRD).
 * هذا الملف هو المصدر الوحيد للألوان لأي استخدام خارج Tailwind
 * (مثال: تلوين أيقونات SVG أو رسوم Canvas).
 *
 * أضف/عدّل أي لون هنا وفي tailwind.config.js معًا حتى يبقيا متزامنين.
 */
export const colors = {
  black: "#14100F", // أسود العمق — خلفيات الوضع الداكن
  card: "#1F1815", // بطاقات سوداء دافئة
  red: "#E1523E", // أحمر رع الفرعوني — اللون الأساسي للعلامة
  coral: "#F2795C", // مرجاني الغروب — hover، إشعارات
  maroon: "#5B2621", // عنابي الظل — حدود وفواصل
  gold: "#C9A227", // ذهبي الملوك — المحفظة والعروض
  papyrus: "#F5EFE6", // بردية فاتحة — الوضع الفاتح
} as const;

export const gradients = {
  brand: `linear-gradient(135deg, ${colors.red} 0%, ${colors.coral} 100%)`,
  wallet: `linear-gradient(135deg, ${colors.black} 0%, #2b2118 55%, ${colors.gold} 130%)`,
};

export type BrandColor = keyof typeof colors;
