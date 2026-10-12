import { expect, test } from "@playwright/test";
import { expectNoPageErrors, openApp } from "../helpers";

/**
 * قبل ١٢ أكتوبر: شريط الستوريز كان بيعرض **دايرة لكل ستوري مش لكل حساب**، فاللي
 * نزّل تلات ستوريز يظهر تلات مرات والشريط يتملى بحساب واحد. والعارض كان بيمشي في
 * قايمة الستوريز **كلها** بالترتيب — تفتحي ستوري واحد وتلاقي نفسك في ستوري حد
 * تاني من غير ما تطلبي.
 *
 * بيانات الديمو فيها ٤ ستوريز من ٣ حسابات (مريم عندها اتنين) — فالفرق بين
 * «لكل ستوري» و«لكل حساب» بيبان في العدد.
 */
const bar = (page: import("@playwright/test").Page) =>
  page.locator("button").filter({ has: page.locator("div.h-14.w-14") });

test("شريط الستوريز: دايرة واحدة لكل حساب مش لكل ستوري", async ({ page }) => {
  await openApp(page);

  // ٤ ستوريز من ٣ حسابات + زرار «قصتك» = ٤ دواير
  await expect(bar(page)).toHaveCount(4);

  // الحساب اللي عنده أكتر من ستوري بيبان عليه العدد
  const mariam = page.getByRole("button", { name: /مريم عبد الله — 2|Mariam Abdallah — 2/ });
  await expect(mariam).toBeVisible();
  expectNoPageErrors(page);
});

test("العارض بيعرض ستوريز الحساب ده بس وبيقفل في آخرها", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /مريم عبد الله — 2|Mariam Abdallah — 2/ }).click();

  // الشرايط فوق = عدد ستوريز مريم (٢)، مش عدد الستوريز كلها (٤)
  const viewer = page.locator("div.fixed.inset-0").filter({ hasText: /إبلاغ|Report/ });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("div.h-1.flex-1")).toHaveCount(2);
  await expect(viewer.getByText("مريم عبد الله")).toBeVisible();

  // «التالية» مرتين: التانية بتقفل بدل ما تنطّ لحساب تاني
  const next = viewer.getByRole("button", { name: /التالية|Next/ });
  await next.click();
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("مريم عبد الله")).toBeVisible(); // لسه نفس الحساب
  await next.click();
  await expect(viewer).toBeHidden();
  expectNoPageErrors(page);
});
