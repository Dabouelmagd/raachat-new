import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * قايمة خيارات الرسالة (بطلب داليا ١٢ أكتوبر). قبلها كان فيه صفّ أيقونات صغيّر
 * من غير أسماء فيه التفاعلات والرد والتعديل والحذف بس — مفيش نسخ ولا إعادة
 * توجيه ولا نجمة ولا معلومات.
 */
const openMenu = async (page: import("@playwright/test").Page) => {
  await openApp(page);
  await page.getByText(/nsw-bity/).first().click();
  await clearOverlays(page);
  await page.getByText("Supercalifragilistic", { exact: false }).click();
  await expect(page.getByRole("dialog", { name: /خيارات الرسالة/ })).toBeVisible();
};

test("القايمة فيها كل الخيارات بأسمائها", async ({ page }) => {
  await openMenu(page);
  const menu = page.getByRole("dialog", { name: /خيارات الرسالة/ });
  for (const name of [/^رد$/, /^إعادة توجيه$/, /^نسخ$/, /^تمييز بنجمة$/, /^معلومات$/, /^تعديل$/, /^حذف$/]) {
    await expect(menu.getByRole("button", { name })).toBeVisible();
  }
  expectNoPageErrors(page);
});

test("«معلومات» بيعرض وقت الإرسال والحالة", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("dialog", { name: /خيارات الرسالة/ }).getByRole("button", { name: /^معلومات$/ }).click();
  await expect(page.getByText("وقت الإرسال")).toBeVisible();
  await expect(page.getByText("عدد الحروف")).toBeVisible();
  expectNoPageErrors(page);
});

test("«إعادة توجيه» بيفتح قايمة المحادثات وبيدوّر فيها", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("dialog", { name: /خيارات الرسالة/ }).getByRole("button", { name: /^إعادة توجيه$/ }).click();
  const sheet = page.getByRole("dialog", { name: /إعادة توجيه/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("مجموعة الشغل 💼")).toBeVisible();
  await sheet.getByLabel("دوّر على محادثة").fill("يوسف");
  await expect(sheet.getByText("مجموعة الشغل 💼")).toHaveCount(0);
  await expect(sheet.getByText("يوسف كامل")).toBeVisible();
  expectNoPageErrors(page);
});

test("القايمة بتتقفل باللمس برّه وبـ Escape", async ({ page }) => {
  await openMenu(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /خيارات الرسالة/ })).toBeHidden();

  await page.getByText("Supercalifragilistic", { exact: false }).click();
  const dlg = page.getByRole("dialog", { name: /خيارات الرسالة/ });
  await expect(dlg).toBeVisible();
  await dlg.click({ position: { x: 5, y: 5 } }); // الخلفية
  await expect(dlg).toBeHidden();
  // والكتابة شغّالة بعد القفل (درس NewChatSheet: الطبقة كانت بتبلع كل ضغطة)
  const input = page.getByPlaceholder(/اكتب رسالة/);
  await input.fill("تمام");
  await expect(input).toHaveValue("تمام");
  expectNoPageErrors(page);
});
