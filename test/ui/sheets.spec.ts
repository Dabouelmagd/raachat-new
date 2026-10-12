import { expect, test } from "@playwright/test";
import { expectNoPageErrors, openApp } from "../helpers";

/**
 * عطل اتبلّغ من الإنتاج (١٢ أكتوبر): قايمة «بدء جديد» مكانش فيها طريقة تقفلها.
 * زرار الإغلاق كان **جوه منطقة التمرير**، فمع قايمة أسماء طويلة بيطلع برّه
 * الشاشة؛ واللمس برّه مكانش بيقفل. والنتيجة إن الطبقة (`fixed inset-0`) بتفضل
 * مفتوحة فوق التطبيق كله وبتبلع كل ضغطة — فالمستخدم بيقول كمان **«كتابة الرسايل
 * مابتشتغلش»**، وهو في الحقيقة بيضغط على طبقة شفافة مش على صندوق الكتابة.
 *
 * الاختبار ده بيثبّت التلات طرق للخروج، وبيجرّب الكتابة بعدها فعلًا.
 */
const openSheet = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: /بدء جديد|^New$/ }).click();
  await expect(page.getByRole("dialog", { name: /بدء جديد|New/ })).toBeVisible();
};

test("قايمة «بدء جديد»: زرار الإغلاق بيفضل ظاهر حتى بعد التمرير لآخر القايمة", async ({ page }) => {
  await openApp(page);
  // شاشة قصيرة عشان القايمة **تسكرل فعلًا**. (من غير ده الاختبار بيعدّي حتى على
  // الكود المكسور، لأن الديمو فيه ٧ أسماء بس — واختبار بيعدّي على العطل مالوش لازمة.)
  await page.setViewportSize({ width: 420, height: 420 });
  await openSheet(page);

  const dialog = page.getByRole("dialog", { name: /بدء جديد|New/ });
  const close = dialog.getByRole("button", { name: /إغلاق|Close/ });
  await expect(close).toBeVisible();

  // ننزل لآخر القايمة — ده اللي كان بيخفي الزرار
  const card = dialog.locator("div").first();
  await card.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(close).toBeInViewport();

  await close.click();
  await expect(dialog).toBeHidden();
  expectNoPageErrors(page);
});

test("قايمة «بدء جديد»: بتتقفل باللمس برّه وبـ Escape", async ({ page }) => {
  await openApp(page);

  await openSheet(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /بدء جديد|New/ })).toBeHidden();

  await openSheet(page);
  await page.mouse.click(8, 8); // برّه الكارت تمامًا
  await expect(page.getByRole("dialog", { name: /بدء جديد|New/ })).toBeHidden();
  expectNoPageErrors(page);
});

test("كتابة رسالة شغالة بعد ما القايمة تتقفل", async ({ page }) => {
  await openApp(page);

  // نفتح القايمة ونقفلها — زمان كانت بتفضل فوق كل حاجة وتبلع الضغطات
  await openSheet(page);
  await page.keyboard.press("Escape");

  // ندخل أول دردشة ونكتب فعلًا. (المؤشر على صفوف القايمة بالظبط — صف الستوريز
  // فوقيها وكان بيتمسك بالغلط فيفتح عارض الستوري.)
  await page.locator("button.w-full.rounded-2xl.bg-rachat-card").first().click();
  const box = page.getByPlaceholder(/اكتب رسالة|Type a message/);
  await expect(box).toBeVisible();
  await box.fill("رسالة اختبار");
  await expect(box).toHaveValue("رسالة اختبار");

  // وزرار الإرسال بيظهر لما يبقى فيه نص
  await expect(page.getByRole("button", { name: /إرسال|Send/ })).toBeVisible();
  expectNoPageErrors(page);
});
