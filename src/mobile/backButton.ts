import { useEffect, useRef } from "react";
import { useLocation, type NavigateFunction } from "react-router-dom";
import { TAB_PATHS } from "../components/BottomNav";

/**
 * **زرار الرجوع في أندرويد — يرجّع جوه التطبيق مش يقفله.**
 *
 * Capacitor بيتصرف افتراضيًا: لو مفيش تاريخ تصفّح **بيقفل التطبيق**. فالمستخدم
 * اللي فاتح نافذة (شيت مرفقات، معاينة صورة، إعلان) ويدوس رجوع بيلاقي التطبيق
 * اتقفل بدل ما النافذة تتقفل — وأي حاجة كان بيكتبها بتضيع.
 *
 * الترتيب هنا هو المتوقّع في أي تطبيق أندرويد:
 *   ١. فيه نافذة مفتوحة؟ تتقفل هي الأول.
 *   ٢. فيه صفحة قبلها؟ نرجع لها.
 *   ٣. إحنا في شاشة البداية؟ **نصغّر** التطبيق مش نقفله — القفل بيضيّع الحالة
 *      والمستخدم مستنّي يلاقيه زي ما سابه لما يرجع.
 *
 * **ومفيش `import` من `@capacitor/app`** عن قصد: الحزمة في `mobile/` مش في
 * تبعيات الواجهة، فاستيرادها كان هيكسر بناء الويب. Capacitor بيعرّض الإضافات
 * وقت التشغيل على `window.Capacitor.Plugins` — فالكود ده بيشتغل في الـAPK
 * وبيسكت تمامًا في المتصفح.
 */
type Listener = { remove: () => void } | Promise<{ remove: () => void }>;
type CapApp = {
  addListener: (e: "backButton", cb: (d: { canGoBack: boolean }) => void) => Listener;
  minimizeApp?: () => void;
  exitApp?: () => void;
};
type CapWindow = Window & { Capacitor?: { Plugins?: { App?: CapApp } } };

/** نافذة مفتوحة = طبقة `fixed inset-0` ظاهرة (كل الشيتات والعارضين بالشكل ده). */
export const hasOverlay = () =>
  [...document.querySelectorAll<HTMLElement>(".fixed.inset-0")].some((e) => e.offsetParent !== null || e.getClientRects().length > 0);

/**
 * الشاشات الجذرية — الرجوع منها بيصغّر التطبيق مش بيروح لصفحة قبلها.
 * **من `BottomNav` نفسه**: قايمة مكتوبة تاني هنا كانت فيها `/chats` (مش راوت
 * موجود أصلًا) وناقصة `/groups` — فالرجوع من تبويب الجروبات كان بيطلّع المستخدم
 * من التبويب بدل ما يصغّر، والسطر الغلط ساكت تمامًا.
 */
const ROOTS = TAB_PATHS;

export function useAndroidBack(nav: NavigateFunction) {
  // 🔴 المسار من الراوتر مش من `window.location`: التطبيق على `MemoryRouter`
  // (مفيش عنوان بيتغيّر خالص)، فـ`location.pathname` بيفضل مسار الصفحة اللي
  // اتحمّلت — فشرط «إحنا في شاشة جذرية» مابيتحققش **ولا مرة**، والرجوع من
  // الشاشة الأولى يبقى `nav(-1)` على أول مدخل في التاريخ = **مابيعملش حاجة**.
  // يعني زرار الرجوع ميت تمامًا في الشاشة الرئيسية، في سكوت.
  const path = useLocation().pathname;
  const at = useRef(path);
  at.current = path;

  useEffect(() => {
    const app = (window as CapWindow).Capacitor?.Plugins?.App;
    if (!app?.addListener) return; // متصفح عادي — الرجوع بيشتغل لوحده

    const onBack = () => {
      // ١) نافذة مفتوحة: نقفلها بنفس طريق Escape — كل شيت في التطبيق سامع له
      if (hasOverlay()) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return;
      }
      // ٢) مش في شاشة جذرية: نرجع خطوة
      if (!ROOTS.includes(at.current)) { nav(-1); return; }
      // ٣) شاشة جذرية: تصغير مش قفل
      (app.minimizeApp ?? app.exitApp)?.();
    };

    const h = app.addListener("backButton", onBack);
    return () => { void Promise.resolve(h).then((x) => x.remove()).catch(() => {}); };
  }, [nav]);
}
