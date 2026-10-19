/**
 * **الوصول لإضافات Capacitor وقت التشغيل — المصدر الوحيد.**
 *
 * 🔴 العطل اللي الملف ده موجود عشانه (اتكشف ١٩ أكتوبر ٢٠٢٦ من أول تجربة حقيقية
 * لجهات الاتصال على جهاز): الكود كان بياخد الإضافة من `window.Capacitor.Plugins.X`
 * مباشرةً — و**ده بيرجّع `undefined` دايمًا في الـAPK**.
 *
 * السبب من كود Capacitor 7 نفسه (`@capacitor/core/dist/index.js`):
 *   - `cap.Plugins = cap.Plugins || {}` — بيبدأ **فاضي**.
 *   - `Plugins[pluginName] = proxy` — **جوه `registerPlugin` بس**.
 *   - `cap.registerPlugin = registerPlugin` — متاحة على الكائن العام.
 *
 * يعني الجانب الأصلي (أندرويد) بيسجّل الإضافة في `capacitor.plugins.json` ويحمّلها،
 * إنما **وكيل الـJS مابيتخلقش إلا لما كود الواجهة ينادي `registerPlugin`**. وإحنا
 * عمرنا ما نادينا — لا للـ`Contacts` ولا للـ`App`. فالنتيجة: «جهازك مش بيسمح بقراءة
 * جهات الاتصال» على جهاز الإضافة متركّبة فيه فعلًا، وزرار الرجوع **ميت في سكوت**.
 *
 * **ومفيش `import` من حزم `@capacitor/*`** عن قصد: الحزم في `mobile/` مش في تبعيات
 * الواجهة، فاستيرادها بيكسر بناء الويب. و`registerPlugin` على الكائن العام فمفيش
 * حاجة محتاجة استيراد.
 */

type CapGlobal = {
  Plugins?: Record<string, unknown>;
  registerPlugin?: (name: string) => unknown;
  isNativePlatform?: () => boolean;
  PluginHeaders?: { name: string }[];
};

export const capacitor = (): CapGlobal | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapGlobal }).Capacitor;

/** وكيل واحد لكل إضافة — `registerPlugin` بتحذّر في الكونسول لو اتنادت مرتين */
const cache = new Map<string, unknown>();

/**
 * بترجّع إضافة Capacitor الأصلية، أو `undefined` في المتصفح العادي.
 * الترتيب: الوكيل الموجود ← تسجيله بالاسم لو الجسر الأصلي شايفه.
 */
export function capPlugin<T>(name: string): T | undefined {
  if (cache.has(name)) return cache.get(name) as T | undefined;
  const cap = capacitor();
  let found: T | undefined;
  if (cap) {
    const ready = (cap.Plugins as Record<string, T> | undefined)?.[name];
    if (ready) found = ready;
    else {
      // الجسر الأصلي بيعلن إضافاته في `PluginHeaders`. لو موجودة والاسم مش فيها
      // يبقى الإضافة مش متركّبة — ومانرجّعش وكيلًا بيرمي عند أول نداء.
      const listed = cap.PluginHeaders?.some((h) => h.name === name);
      const native = cap.isNativePlatform?.() === true;
      if (listed || (listed === undefined && native)) {
        try { found = cap.registerPlugin?.(name) as T | undefined; } catch { found = undefined; }
      }
    }
  }
  cache.set(name, found);
  return found;
}

/** للاختبارات بس: الكاش عايش طول عمر الصفحة */
export const __resetCapPluginCache = () => cache.clear();
