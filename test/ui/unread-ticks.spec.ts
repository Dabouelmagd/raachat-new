import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * (بطلب داليا ١٢ أكتوبر)
 * - **غير المقروء بخط بولد** وجنبه العدّاد، وبيرجع عادي أول ما تفتحي المحادثة.
 * - **فلتر «غير المقروء»** جنب باقي الفلاتر.
 * - **علامات التسليم:** ✓ اتبعتت · ✓✓ وصلت · ✓✓ أزرق اتقرت.
 *
 * بيانات الديمو فيها `t1` بعدّاد ٢، ورسالة «وصلت» ورسالة «اتقرت» — **عن قصد**،
 * من غيرهم الحالات دي مابتظهرش في بناء الديمو أصلًا.
 */
const row = (page: import("@playwright/test").Page, name: RegExp) =>
  page.locator("button.rounded-2xl.bg-rachat-card").filter({ hasText: name }).first();

test("المحادثة اللي فيها رسايل ما اتقرتش: بولد + عدّاد، وبترجع عادي بعد الفتح", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  const mariam = row(page, /مريم عبد الله|Mariam/);
  const title = mariam.locator("span").filter({ hasText: /مريم عبد الله|Mariam Abdallah/ }).first();
  await expect(title).toHaveClass(/font-extrabold/);
  await expect(mariam.getByLabel(/رسايل ما اتقرتش|Unread messages/)).toHaveText(/٢|2/);

  await mariam.click();
  await page.getByRole("button", { name: /رجوع|Back/ }).first().click();
  await clearOverlays(page);
  await expect(row(page, /مريم عبد الله|Mariam/).locator("span").filter({ hasText: /مريم عبد الله|Mariam Abdallah/ }).first()).not.toHaveClass(/font-extrabold/);
  await expect(page.getByLabel(/رسايل ما اتقرتش|Unread messages/)).toHaveCount(0);
  expectNoPageErrors(page);
});

test("فلتر «غير المقروء» بيعرض المحادثات دي بس", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByRole("tab", { name: /غير المقروء|Unread/ }).click();
  await expect(row(page, /مريم عبد الله|Mariam/)).toBeVisible();
  await expect(page.getByText("مجموعة الشغل 💼")).toHaveCount(0);
  expectNoPageErrors(page);
});

test("علامات الرسالة: اتبعتت · وصلت · اتقرت", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await row(page, /مريم عبد الله|Mariam/).click();
  await clearOverlays(page);

  // «اتقرت» لازم تبقى زرقا — ودي اللي بتفرّق عن «وصلت»
  const read = page.getByLabel(/^اتقرت$|^Read$/).first();
  await expect(read).toBeVisible();
  await expect(read).toHaveClass(/text-sky-400/);

  await expect(page.getByLabel(/^وصلت$|^Delivered$/).first()).toBeVisible();
  await expect(page.getByLabel(/^وصلت$|^Delivered$/).first()).not.toHaveClass(/text-sky-400/);
  expectNoPageErrors(page);
});

test("لون فقاعة الكلام بيتغيّر من شكل الشات", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByRole("link", { name: /الحساب|Account/ }).click();
  await page.getByRole("button", { name: /خلفية الشات|Chat wallpaper/ }).click();
  const sheet = page.getByRole("dialog", { name: /شكل الشات|Chat appearance/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("لون فقاعة الكلام")).toBeVisible();
  await sheet.getByRole("button", { name: /^زمردي$|^Emerald$/ }).click();
  await expect(sheet.getByRole("button", { name: /^زمردي$|^Emerald$/ })).toHaveAttribute("aria-pressed", "true");
  expectNoPageErrors(page);
});
