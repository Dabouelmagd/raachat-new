import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * **تثبيت المحادثات** (بطلب داليا ١٢ أكتوبر).
 *
 * المثبّتة بتطلع فوق القايمة مهما كان آخر نشاط، وعليها علامة، والحد ٣ زي واتساب.
 * الحارس الحقيقي على السيرفر (`too_many_pinned` في `server/test/pin.test.ts`)،
 * وهنا بنفحص السلوك اللي المستخدم بيشوفه.
 */
const rows = (page: import("@playwright/test").Page) => page.locator("button.rounded-2xl.bg-rachat-card");
const row = (page: import("@playwright/test").Page, name: RegExp) => rows(page).filter({ hasText: name }).first();
const pinOf = (page: import("@playwright/test").Page, name: RegExp) =>
  row(page, name).getByRole("button", { name: /^تثبيت$|^Pin$|^فك التثبيت$|^Unpin$/ });

test("التثبيت بيرفع المحادثة فوق، وفك التثبيت بيرجّعها", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  // أول سطر في الصف هو حرف الأفاتار، فبنقرا نص الصف كله
  const firstRow = async () => rows(page).first().innerText();
  const before = await firstRow();
  expect(before).not.toMatch(/يوسف كامل|Youssef Kamel/);

  await pinOf(page, /يوسف كامل|Youssef Kamel/).click();
  expect(await firstRow()).toMatch(/يوسف كامل|Youssef Kamel/);

  await pinOf(page, /يوسف كامل|Youssef Kamel/).click();
  expect(await firstRow()).toBe(before);
  expectNoPageErrors(page);
});

test("المثبّتة عليها علامة ظاهرة", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await expect(page.getByLabel(/^مثبّتة$|^Pinned$/)).toHaveCount(0);
  await pinOf(page, /فريق التصميم|Design Team/).click();
  await expect(row(page, /فريق التصميم|Design Team/).getByLabel(/^مثبّتة$|^Pinned$/)).toBeVisible();
  expectNoPageErrors(page);
});

test("الحد ٣ — الرابعة بترفض برسالة واضحة", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  for (const name of [/يوسف كامل|Youssef Kamel/, /فريق التصميم|Design Team/, /مجموعة الشغل|Work Group/]) {
    await pinOf(page, name).click();
  }
  await expect(page.getByLabel(/^مثبّتة$|^Pinned$/)).toHaveCount(3);

  await pinOf(page, /مريم عبد الله|Mariam/).click();
  await expect(page.getByRole("status")).toHaveText(/أقصى .* محادثات مثبّتة|pin up to/);
  await expect(page.getByLabel(/^مثبّتة$|^Pinned$/)).toHaveCount(3);
  expectNoPageErrors(page);
});
