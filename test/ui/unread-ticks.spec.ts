import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * (بطلب داليا ١٢ أكتوبر)
 * - **غير المقروء بخط بولد** وجنبه العدّاد، وبيرجع عادي أول ما تفتحي المحادثة.
 * - **فلتر «غير المقروء»** جنب باقي الفلاتر.
 * - **علامات التسليم:** ✓ أُرسِلت · ✓✓ وصلت · ✓✓ أزرق قُرئت.
 *
 * بيانات الديمو فيها `t1` بعدّاد ٢، ورسالة «وصلت» ورسالة «قُرئت» — **عن قصد**،
 * من غيرهم الحالات دي مابتظهرش في بناء الديمو أصلًا.
 */
const row = (page: import("@playwright/test").Page, name: RegExp) =>
  page.locator("button.rounded-2xl.bg-rachat-card").filter({ hasText: name }).first();

/**
 * 🔴 الحكم على **وزن الخط المحسوب** مش على اسم الكلاس (٢٦ أكتوبر ٢٠٢٦):
 * الفحص القديم كان `toHaveClass(/font-extrabold/)` — وعدّى على كود كان بيخلّي
 * المقروء `font-bold` (٧٠٠) وغير المقروء `font-extrabold` (٨٠٠)، يعني فرق
 * **١٠٠ درجة مابيتشافش بالعين** والبلاغ كان «مفيش فرق». الوزن المحسوب هو
 * اللي بيقيس اللي المستخدم بيشوفه فعلًا، وبيعدّي أي إعادة تسمية للكلاسات.
 */
const weight = (l: import("@playwright/test").Locator) =>
  l.evaluate((el) => Number(getComputedStyle(el).fontWeight));

test("المحادثة اللي فيها رسائل غير مقروءة: بولد + عدّاد، وبترجع عادي بعد الفتح", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  const mariam = row(page, /مريم عبد الله|Mariam/);
  // اسم المحادثة نفسه (جوه غلاف فيه علامة التثبيت)
  const title = mariam.locator("span.truncate.text-sm").first();
  expect(await weight(title), "اسم المحادثة اللي فيها جديد لازم يبقى بولد").toBeGreaterThanOrEqual(700);
  await expect(mariam.getByLabel(/رسائل غير مقروءة|Unread messages/)).toHaveText(/٢|2/);

  await mariam.click();
  await page.getByRole("button", { name: /رجوع|Back/ }).first().click();
  await clearOverlays(page);
  const after = row(page, /مريم عبد الله|Mariam/).locator("span.truncate.text-sm").first();
  expect(await weight(after), "وبعد ما تتفتح يرجع **من غير بولد** — ده الفرق اللي المستخدم بيشوفه").toBeLessThanOrEqual(500);
  // العدّاد بتاع المحادثة دي بس — فيه محادثات تانية في الديمو لسه فيها جديد
  await expect(row(page, /مريم عبد الله|Mariam/).getByLabel(/رسائل غير مقروءة|Unread messages/)).toHaveCount(0);
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

test("علامات الرسالة: أُرسِلت · وصلت · قُرئت", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await row(page, /مريم عبد الله|Mariam/).click();
  await clearOverlays(page);

  // «قُرئت» لازم تبقى زرقا — ودي اللي بتفرّق عن «وصلت»
  const read = page.getByLabel(/^قُرئت$|^Read$/).first();
  await expect(read).toBeVisible();
  await expect(read).toHaveClass(/text-sky-400/);

  await expect(page.getByLabel(/^وصلت$|^Delivered$/).first()).toBeVisible();
  await expect(page.getByLabel(/^وصلت$|^Delivered$/).first()).not.toHaveClass(/text-sky-400/);
  expectNoPageErrors(page);
});

test("لون فقاعة الكلام بيتغيّر من شكل المحادثة", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByRole("link", { name: /الحساب|Account/ }).click();
  await page.getByRole("button", { name: /خلفية المحادثة|Chat wallpaper/ }).click();
  const sheet = page.getByRole("dialog", { name: /شكل المحادثة|Chat appearance/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("لون فقاعة الكلام")).toBeVisible();
  await sheet.getByRole("button", { name: /^زمردي$|^Emerald$/ }).click();
  await expect(sheet.getByRole("button", { name: /^زمردي$|^Emerald$/ })).toHaveAttribute("aria-pressed", "true");
  expectNoPageErrors(page);
});
