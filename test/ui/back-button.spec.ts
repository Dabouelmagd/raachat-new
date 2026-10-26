import { expect, test, type Page } from "@playwright/test";
import { expectNoPageErrors, openApp, stubCapacitor, tab } from "../helpers";

/**
 * **زرار الرجوع في أندرويد** (بطلب داليا ١٨ أكتوبر ٢٠٢٦: «الباك بوطن بتاع
 * الموبيل يرجعني داخل الابلكشن»).
 *
 * سلوك Capacitor الافتراضي: مفيش تاريخ تصفّح ⇒ **التطبيق يتقفل**. فالمستخدم
 * اللي فاتح شيت أو داخل محادثة ويدوس رجوع كان بيلاقي التطبيق أُغلِق، وأي حاجة
 * كان بيكتبها تضيع.
 *
 * **إزاي نجرّبه في المتصفح:** بنحقن جسر Capacitor وهمي **بنفس شكل الحقيقي**
 * (`Plugins` فاضي + `registerPlugin` + `PluginHeaders`)، ونخزّن المستمع عشان
 * ندوس «رجوع» بإيدينا، ونعدّ نداءات `minimizeApp`.
 *
 * 🔴 **والشكل ده هو التصحيح (١٩ أكتوبر ٢٠٢٦):** النسخة الأولى كانت بتحقن
 * `Plugins: { App: … }` **مملوءًا** — وده مش شكل الجسر الحقيقي، فالاختبارات
 * التلاتة كانت خضرا والزرار **ميت على الجهاز** لأن `Capacitor.Plugins.App`
 * بترجّع `undefined` دايمًا هناك. الآن الوكيل مابيتخلقش إلا بـ`registerPlugin`
 * زي الواقع، فالتلاتة بيسقطوا على الكود اللي بيقرا `Plugins` مباشرةً.
 */
type BackWin = Window & {
  __rcBack?: (d: { canGoBack: boolean }) => void;
  __rcMin?: number;
  __rcExit?: number;
};

async function stubApp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as BackWin & { __rcPlugins?: Record<string, unknown> };
    w.__rcMin = 0;
    w.__rcExit = 0;
    w.__rcPlugins = {
      App: {
        addListener: (ev: string, cb: (d: { canGoBack: boolean }) => void) => {
          if (ev === "backButton") w.__rcBack = cb;
          return { remove() {} };
        },
        minimizeApp: () => { w.__rcMin = (w.__rcMin ?? 0) + 1; },
        exitApp: () => { w.__rcExit = (w.__rcExit ?? 0) + 1; },
      },
    };
  });
  await stubCapacitor(page, ["App"]);
}

/** يدوس «رجوع» زي النظام بالظبط، وبيفشل لو المستمع مش متسجّل */
async function pressBack(page: Page) {
  const registered = await page.evaluate(() => typeof (window as unknown as BackWin).__rcBack === "function");
  expect(registered, "التطبيق لازم يسجّل مستمع backButton").toBe(true);
  await page.evaluate(() => (window as unknown as BackWin).__rcBack?.({ canGoBack: true }));
}

const minimized = (page: Page) => page.evaluate(() => (window as unknown as BackWin).__rcMin ?? 0);

test("الرجوع بيقفل النافذة المفتوحة ومابيقفلش التطبيق", async ({ page }) => {
  await stubApp(page);
  await openApp(page);

  await page.getByRole("button", { name: /بدء جديد|^New$/ }).click();
  const dialog = page.getByRole("dialog", { name: /بدء جديد|New/ });
  await expect(dialog).toBeVisible();

  await pressBack(page);
  await expect(dialog).toBeHidden();
  // والأهم: النافذة أُغلِقت **من غير** إن التطبيق يتصغّر أو يتقفل
  expect(await minimized(page)).toBe(0);
  expectNoPageErrors(page);
});

test("الرجوع من جوه محادثة بيرجع لقايمة الدردشات", async ({ page }) => {
  await stubApp(page);
  await openApp(page);

  await page.locator("button.w-full.rounded-2xl.bg-rachat-card").first().click();
  await expect(page.getByPlaceholder(/اكتب رسالة|Type a message/)).toBeVisible();

  await pressBack(page);
  await expect(page.getByPlaceholder(/اكتب رسالة|Type a message/)).toBeHidden();
  await expect(page.getByRole("button", { name: /بدء جديد|^New$/ })).toBeVisible();
  expect(await minimized(page)).toBe(0);
  expectNoPageErrors(page);
});

test("الرجوع من شاشة الشريط السفلي بيصغّر التطبيق مش بيقفله", async ({ page }) => {
  await stubApp(page);
  await openApp(page);

  // تبويب المجموعات — كان ناقصًا من قايمة الجذور المكتوبة بالإيد، فالرجوع منه
  // كان بيطلّع المستخدم من التبويب بدل ما يصغّر
  await tab(page, /المجموعات|Groups/);
  await pressBack(page);
  expect(await minimized(page)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as BackWin).__rcExit ?? 0)).toBe(0);
  expectNoPageErrors(page);
});
