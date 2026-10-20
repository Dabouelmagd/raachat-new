// أصل التطبيق المنشور — بيتحدّد وقت البناء (`VITE_SITE_URL`).
//
// 🔴 فاضي = روابط نسبية. وده صح على الويب، و**غلط قاتل في الـAPK**: أصل
// Capacitor هو `https://localhost`، فالرابط النسبي بيتحلّ على عنوان جوّه
// التليفون ويموت. حصل فعلًا (٢٠ أكتوبر ٢٠٢٦): المتغيّر مكانش متضبط في أي
// بناء، فروابط الخصوصية والشروط ومعايير المجتمع **كلها ميتة في الـAPK** —
// وشاشة التسجيل بتقول «بالمتابعة أنت توافق على الشروط وسياسة الخصوصية».
export const SITE = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "";

// الموقع التعريفي — ده اللي رابط الدعوة بيودّي عليه، لأن فيه شرح التطبيق
// وأزرار التنزيل. اللي بيستلم الدعوة مش عنده التطبيق أصلًا.
export const PUBLIC_SITE = (import.meta.env.VITE_PUBLIC_SITE as string | undefined) ?? "";

/**
 * أصل صالح للمشاركة مع ناس تانية.
 *
 * 🔴 `location.origin` **مينفعش** يكون احتياطيًا هنا: في الـAPK قيمته
 * `https://localhost`، فالرابط اللي بيتبعت لصاحبك مستحيل يفتح عنده —
 * والعطل صامت تمامًا (الرسالة بتتبعت عادي). نفس درس `firstPublicOrigin`
 * في `server/src/lib/senders.ts` بالحرف.
 */
const isShareable = (u: string) =>
  /^https:\/\/./.test(u) && !/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(u);

/** رابط الدعوة، أو نصّ فاضي لو مفيش أصل عام — أحسن من رابط ميت. */
export const inviteUrl = (): string => {
  const here = typeof location === "undefined" ? "" : location.origin;
  return [PUBLIC_SITE, SITE, here].find(isShareable) ?? "";
};

export const LEGAL = {
  privacy: `${SITE}/legal/privacy.html`,
  terms: `${SITE}/legal/terms.html`,
  community: `${SITE}/legal/community.html`,
  dataRequests: `${SITE}/legal/data-requests.html`,
  deleteAccount: `${SITE}/delete-account.html`,
};
