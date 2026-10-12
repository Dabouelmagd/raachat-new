import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * الشاشة لازم تتظبط على أي موبايل (بلاغ ١٢ أكتوبر بسكرين شوت من آيفون: الرسايل
 * والأزرار متقصوصة من ناحية، والهيدر طالع برّه الشاشة).
 *
 * **السبب:** سفاري بيكبّر الصفحة **تلقائيًا** أول ما تدوس على خانة كتابة خطها
 * أصغر من ١٦px. بعد التكبير الصفحة تبقى أعرض من الشاشة فالمحتوى يتقص من ناحية.
 * التكبير ده نفسه مش موجود في كروميوم، فالاختبار بيفحص **الشرط اللي بيمنعه**:
 * كل خانة كتابة ظاهرة على جهاز لمس خطها ١٦px على الأقل.
 *
 * ولازم السياق يبقى **لمس** (`isMobile` + `hasTouch`) عشان `@media (pointer: coarse)`
 * تشتغل — من غير كده الاختبار بيقيس المتصفح المكتبي ومابيشوفش الحماية.
 */
const SIZES = [
  ["آيفون صغير", 320, 568],
  ["آيفون عادي", 390, 844],
  ["آيفون كبير", 430, 932],
] as const;

for (const [name, width, height] of SIZES) {
  test.describe(`${name} (${width}px)`, () => {
    test.use({ isMobile: true, hasTouch: true, viewport: { width, height } });

    test("خانات الكتابة ١٦px فما فوق ومفيش محتوى برّه الشاشة", async ({ page }) => {
      await openApp(page);
      await page.getByText(/nsw-bity/).first().click();
      await clearOverlays(page);

      const small = await page.$$eval("input:not([type=checkbox]):not([type=radio]):not([type=hidden])", (els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => ({ ph: e.getAttribute("placeholder") ?? e.getAttribute("aria-label") ?? "", px: parseFloat(getComputedStyle(e).fontSize) }))
          .filter((x) => x.px < 16),
      );
      expect(small).toEqual([]);

      const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(w.scroll).toBeLessThanOrEqual(w.client);
      expectNoPageErrors(page);
    });
  });
}
