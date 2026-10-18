import { useEffect } from "react";
import { setBadge } from "./badge";
import { useAppState } from "../store/AppContext";

/**
 * **العلامة على أيقونة التطبيق = مجموع الرسايل المش مقروءة.**
 *
 * والتطبيق وهو مفتوح هو **صاحب القرار** في الرقم: هو اللي عارف العدد
 * الحقيقي، فأول ما المستخدم يفتح محادثة ويقراها العدّاد ينزل والعلامة
 * تختفي لوحدها. أما والتطبيق مقفول فالـ service worker هو اللي بيحدّثها
 * من عدد الإشعارات المعلّقة (`public/sw.js`).
 *
 * ومابيترسمش جوه `PushBridge` عن قصد: ده مربوط بـ `API_ON`، والعلامة
 * بتعبّر عن حالة الواجهة نفسها فبتشتغل في الوضعين — ولولا كده مكانش فيه
 * طريق نجرّبها فيه أصلًا (بناء الاختبارات مابيعملش ولا نداء شبكة).
 */
export function AppBadge() {
  const { threads } = useAppState();
  const unread = threads.reduce((s, t) => s + (t.unread ?? 0), 0);

  useEffect(() => {
    setBadge(unread);
    // الإشعارات القديمة بتتشال لما الرسايل تتقرا — وإلا سنتر الإشعارات
    // يفضل مليان حاجات المستخدم قراها خلاص
    if (unread === 0 && "serviceWorker" in navigator) {
      void navigator.serviceWorker.ready
        .then((r) => r.getNotifications())
        .then((ns) => ns.forEach((x) => { if (x.data?.kind !== "call") x.close(); }))
        .catch(() => {});
    }
  }, [unread]);

  return null;
}
