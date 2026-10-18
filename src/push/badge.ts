/**
 * **علامة العدّاد على أيقونة التطبيق** (Badging API).
 *
 * لما يبقى فيه رسايل مش مقروءة، النقطة/الرقم بيظهروا على اللوجو في شاشة
 * الجهاز، وبيختفوا أول ما المستخدم يقرا.
 *
 * **فين بتشتغل:** التطبيق المثبَّت من المتصفح (PWA) على أندرويد وويندوز
 * وماك وiOS 16.4+. المتصفح العادي من غير تثبيت **مالوش أيقونة** على الشاشة
 * فمفيش مكان للعلامة — والنداء بيترفض في سكوت وده المطلوب.
 *
 * **ومابتشتغلش جوه الـ APK** (WebView بتاعة Capacitor مش PWA مثبَّت) —
 * هناك العلامة بتيجي من إشعار نظام أندرويد نفسه، وده محتاج FCM.
 *
 * وكل نداء جوه `try` لأن المواصفة بترمي في سياقات كتير (نافذة خاصة،
 * صلاحيات، متصفح قديم) — وعلامة مش ظاهرة أهون بكتير من تطبيق بيقع.
 */

type BadgeNav = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export const badgeSupported = () =>
  typeof navigator !== "undefined" && typeof (navigator as BadgeNav).setAppBadge === "function";

/** `0` بيمسح العلامة، وأي رقم أكبر بيعرضها. */
export function setBadge(count: number): void {
  const nav = navigator as BadgeNav;
  try {
    if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch { /* المتصفح مش مدعّم أو السياق مايسمحش */ }
}
