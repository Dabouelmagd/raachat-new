import { API_ON, api } from "../api/client";
import { capPlugin, capacitor } from "../mobile/capPlugin";

/**
 * **الإشعارات الأصلية للتطبيق المثبَّت (FCM / APNs).**
 *
 * 🔴 ليه ده موجود جنب `push.ts`: Web Push **مابيشتغلش جوه WebView**. أندرويد
 * WebView مافيهاش `PushManager` ولا `Notification`، وWKWebView على iOS كذلك —
 * فـ`pushSupported()` بترجّع `false` والتطبيق بيهدى في سكوت، والنتيجة إن
 * صاحب الـAPK **مايوصلوش ولا إشعار** مهما كان VAPID متضبطًا على السيرفر.
 * الطريق الوحيد هناك هو إضافة Capacitor الأصلية.
 *
 * والإضافة بتتاخد من `capPlugin` **وحده** — درس ١٩ أكتوبر: `Capacitor.Plugins.X`
 * بترجّع `undefined` دايمًا في الـAPK لأن وكيل الـJS مابيتخلقش إلا بـ
 * `registerPlugin`. أي قراءة مباشرة هنا = ميزة ميتة في سكوت على الجهاز.
 */

type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";
interface PushPlugin {
  checkPermissions(): Promise<{ receive: PermissionState }>;
  requestPermissions(): Promise<{ receive: PermissionState }>;
  register(): Promise<void>;
  addListener(event: string, cb: (x: never) => void): Promise<unknown> | unknown;
}

/** اسم المنصّة من الجسر — بيحدّد نوع التوكن المخزَّن على السيرفر. */
function platform(): "android" | "ios" | undefined {
  const cap = capacitor() as { getPlatform?: () => string } | undefined;
  const p = cap?.getPlatform?.();
  return p === "android" || p === "ios" ? p : undefined;
}

/** متاحة بس جوه التطبيق المثبَّت، ولمّا الواجهة شغّالة على سيرفر حقيقي. */
export const nativePushSupported = () => API_ON && !!platform() && !!capPlugin<PushPlugin>("PushNotifications");

let started = false;

/**
 * بيطلب الإذن ويسجّل الجهاز. **آمن يتكرر** (`started`) لأن تسجيل مستمع مرتين
 * بيخلّي كل إشعار يتعالج مرتين.
 *
 * بيرجّع `false` لو الإذن اترفض أو مفيش جسر — ومابيرميش أبدًا: الإشعار ميزة
 * مساعدة، وأي رمية هنا بتكسر إقلاع التطبيق كله.
 */
export async function startNativePush(onOpen?: (threadId: string) => void): Promise<boolean> {
  if (started || !nativePushSupported()) return false;
  const plug = capPlugin<PushPlugin>("PushNotifications")!;
  const os = platform()!;
  started = true;
  try {
    let perm = (await plug.checkPermissions()).receive;
    if (perm !== "granted") perm = (await plug.requestPermissions()).receive;
    if (perm !== "granted") return false;

    // 🔴 المستمع **قبل** `register()`: التوكن بييجي في حدث `registration`،
    // وأندرويد ممكن يطلّعه فورًا — فلو سجّلنا المستمع بعدها، أول توكن يضيع
    // والجهاز يفضل بلا إشعارات لحد ما FCM يجدّده (ممكن أسابيع).
    await plug.addListener("registration", ((t: { value: string }) => {
      void api("/push/device", { method: "POST", body: { token: t.value, platform: os } }).catch(() => {});
    }) as (x: never) => void);

    await plug.addListener("registrationError", ((e: unknown) => {
      console.error("native push registration failed", e);
    }) as (x: never) => void);

    await plug.addListener("pushNotificationActionPerformed", ((a: {
      notification?: { data?: Record<string, string> };
    }) => {
      const id = a.notification?.data?.threadId;
      if (id && onOpen) onOpen(id);
    }) as (x: never) => void);

    await plug.register();
    return true;
  } catch (e) {
    console.error("native push start failed", e);
    return false;
  }
}

/** للاختبارات بس — الحالة عايشة طول عمر الصفحة زي كاش الإضافات. */
export const __resetNativePush = () => { started = false; };
