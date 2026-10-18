import { expect, test, type Page } from "@playwright/test";
import { expectNoPageErrors, openApp, tab } from "../helpers";

/**
 * **صورة الإعلان في الواجهة.**
 *
 * الإعلانات كانت نصًّا وخلفية متدرّجة وبس — مفيش صورة خالص، فالمعلن مايقدرش
 * يعرض منتجه. اتضاف `imageUrl` (عمود `AdCampaign.imageUrl` على السيرفر،
 * ومرفوع من اللوحة بس — مش رابطًا خارجيًا).
 *
 * إعلان `a6` في بيانات الديمو له صورة **عن قصد**: بناء الديمو مابيعملش ولا
 * نداء شبكة، فمن غيره المسار ده مابيظهرش ولا بيتجرّب.
 *
 * **والفحص مش على وجود `<img>`:** صورة موجودة ومكسورة بتعدّي من فحص الوجود
 * والمستخدم يشوف مستطيلًا فاضيًا — فالحكم على `naturalWidth > 0` (نفس درس
 * اختبار الملصقات).
 */

/** يوقف دوران البانر (الإعلان بيلف كل ٦ ثواني) بميزة التطبيق نفسها: الماوس فوقه. */
async function pauseBanner(page: Page) {
  const card = page.getByRole("region", { name: /^إعلان$/ }).first();
  await card.hover();
  return card;
}

test("إعلان بصورة بيعرضها، والصورة محمّلة فعلًا", async ({ page }) => {
  await openApp(page);
  const card = await pauseBanner(page);
  // النقاط تحت البانر = الانتقال لإعلان معيّن. إعلان ٦ هو اللي له صورة.
  await card.getByRole("button", { name: /الإعلان ٦/ }).click();
  await expect(card.getByText(/رحلات واحة/)).toBeVisible();

  const img = card.locator("img");
  await expect(img).toHaveCount(1);
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth), { timeout: 5000 })
    .toBeGreaterThan(0);
  expectNoPageErrors(page);
});

test("الإعلان اللي مالوش صورة بيفضل نصًّا وخلفية — مفيش مستطيل فاضي", async ({ page }) => {
  await openApp(page);
  const card = await pauseBanner(page);
  await card.getByRole("button", { name: /الإعلان ١/ }).click();
  await expect(card.getByText(/كافيه النيل/)).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
  expectNoPageErrors(page);
});

/**
 * 🔴 الصورة اللي ما حمّلتش (الملف اتمسح من القرص، أو الشبكة) **لازم** ترجّع
 * الإعلان للتصميم النصّي. من غير `onError` المستخدم يشوف مكان الصورة فاضيًا
 * والإعلان يبان مكسورًا — والمعلن دافع.
 */
test("🔴 الصورة المكسورة بترجّع الإعلان للتصميم النصّي", async ({ page }) => {
  await openApp(page);
  const card = await pauseBanner(page);
  await card.getByRole("button", { name: /الإعلان ٦/ }).click();
  const img = card.locator("img");
  await expect(img).toHaveCount(1);

  await img.evaluate((e: HTMLImageElement) => { e.src = "file:///rachat-no-such-image.jpg"; });
  await expect(card.locator("img")).toHaveCount(0);
  // والنص لسه مكانه — الإعلان اتعرض، مش اختفى
  await expect(card.getByText(/رحلات واحة/)).toBeVisible();
  await expect(card.getByText(/إجازة نهاية الأسبوع/)).toBeVisible();
  expectNoPageErrors(page);
});

/**
 * **كل موضع بياخد صورته هو.**
 *
 * البانر ١٢٠٠×٣٠٠ والنافذة والستوري ١٠٨٠×١٩٢٠ — فصورة واحدة لكل المواضع
 * بتتقصّ في اللي نسبته مختلفة، واللوجو أو السعر في الطرف يضيع. الصورة بقت
 * على **الحجز** (حملة × موضع)، و`adsFor(placement)` بتختار صورة الموضع.
 *
 * وإعلان الديمو `a6` له صورة مختلفة لموضع الخدمات **عن قصد** — من غيرها
 * مفيش طريق نجرّب بيه الاستبدال في بناء مابيعملش ولا نداء شبكة.
 */
test("🔴 نفس الإعلان بيعرض صورة مختلفة في كل موضع", async ({ page }) => {
  await openApp(page);

  const srcOf = async () => {
    const card = page.getByRole("region", { name: /^إعلان$/ }).first();
    await card.hover();
    await card.getByRole("button", { name: /الإعلان ٦/ }).click();
    await expect(card.getByText(/رحلات واحة/)).toBeVisible();
    return card.locator("img").getAttribute("src");
  };

  await tab(page, /الدردشات|Chats/);
  const banner = await srcOf();
  await tab(page, /الخدمات|Services/);
  const services = await srcOf();

  expect(banner, "مفيش صورة في البانر").toBeTruthy();
  expect(services, "صورة الخدمات هي نفس صورة البانر — الموضع مش بياخد صورته")
    .not.toBe(banner);
  expectNoPageErrors(page);
});
