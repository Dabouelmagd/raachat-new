import { expect, test } from "@playwright/test";
import { expectNoPageErrors, openApp, openProfile, tab } from "../helpers.js";

/**
 * الأساسيات اللي لو اتكسرت التطبيق كله بيبوظ: سهم الرجوع في كل صفحة،
 * زر الوضع الليلي، وزر البحث. دي طلبات داليا الصريحة، فمحتاجة شبكة أمان.
 */
test.beforeEach(async ({ page }) => { await openApp(page); });

test("سهم الرجوع في الصفحات الداخلية ومش موجود في الرئيسية", async ({ page }) => {
  await expect(page.getByRole("button", { name: /رجوع|Back/ })).toHaveCount(0); // الرئيسية
  await openProfile(page);
  const back = page.getByRole("button", { name: /رجوع|Back/ });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator("#rc-birth")).toHaveCount(0); // رجعنا فعلًا
  expectNoPageErrors(page);
});

test("زر الوضع الليلي بيبدّل الثيم ويفضل مبدّل", async ({ page }) => {
  const theme = () => page.evaluate(() => document.querySelector("[data-rc-theme]")?.getAttribute("data-rc-theme") ?? null);
  const before = await theme();
  await page.getByRole("button", { name: /الوضع الفاتح|الوضع الليلي|Light mode|Dark mode/ }).first().click();
  await expect.poll(theme).not.toBe(before);
  // التبديل بيفضل بعد التنقل
  await tab(page, /الخدمات|Services/);
  expect(await theme()).not.toBe(before);
});

test("زر البحث موجود وبيفتح شاشة البحث", async ({ page }) => {
  await page.getByRole("button", { name: /بحث|Search/ }).first().click();
  await expect(page.getByText(/^البحث$|^Search$/).first()).toBeVisible(); // عنوان الشاشة
  await expect(page.getByRole("textbox", { name: /بحث|Search/ })).toBeVisible();
  // في شاشة البحث نفسها مفيش زرار بحث تاني في الهيدر
  await expect(page.getByRole("button", { name: /^بحث$|^Search$/ })).toHaveCount(0);
  expectNoPageErrors(page);
});

test("التابات الأساسية كلها بتفتح من غير أخطاء", async ({ page }) => {
  for (const t of [/المجموعات|Groups/, /الغرف|Rooms/, /الخدمات|Services/, /الحساب|Account/, /الدردشات|Chats/]) {
    await tab(page, t);
    await expect(page.locator("header, .bg-rachat-black").first()).toBeVisible();
  }
  expectNoPageErrors(page);
});
