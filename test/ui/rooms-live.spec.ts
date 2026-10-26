import { expect, test, type Locator } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp, tab } from "../helpers";

/**
 * **تمييز الغرفة الصوتية اللي يوجد أشخاص الآن** (بطلب داليا ٢٦ أكتوبر ٢٠٢٦).
 *
 * الغرف مالهاش «غير مقروء» (حضور صوتي مافيهوش رسايل)، فالإشارة هي **الحضور
 * الحيّ**: اسم الغرفة بولد + شارة «N الآن» لما يكون فيها ناس، وعادي بلا شارة
 * لما تكون فاضية.
 *
 * 🔴 والحكم على **وزن الخط المحسوب** مش على اسم الكلاس — نفس درس «مفيش فرق»
 * في نفس اليوم: `toHaveClass(/font-bold/)` **عدّى على عطل حقيقي** لأن الكلاس
 * كان موجود فعلًا والفرق اللي المستخدم بيشوفه كان ١٠٠ درجة. `getComputedStyle`
 * هو اللي بيقول اللي العين بتشوفه، وبيعدّي أي إعادة تسمية للكلاسات.
 *
 * وبيانات الديمو فيها غرفتان فيهما ناس (`r1` و`r2`) وغرفة **فاضية** (`r3`) —
 * الفاضية موجودة عن قصد، ومن غيرها مفيش حالة تفرّق بين الصح والغلط القريب.
 */

const weight = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).fontWeight));
const LIVE = /يوجد أشخاص الآن|People in here now/;

test("🔴 شاشة الغرف: الحيّة بولد ومعاها شارة، والفاضية عادية بلا شارة", async ({ page }) => {
  await openApp(page);
  await tab(page, /الغرف|Rooms/);
  await clearOverlays(page);

  const live = page.getByText(/نقاش كورة الليلة/).first();
  const quiet = page.getByText(/قعدة الفجر/).first();
  await expect(live).toBeVisible();
  await expect(quiet).toBeVisible();

  expect(await weight(live), "الغرفة اللي فيها ناس لازم تبقى بولد").toBeGreaterThanOrEqual(700);
  expect(await weight(quiet), "والفاضية لازم تبقى عادية — ده الفرق كله").toBeLessThanOrEqual(500);

  // الشارة بالعدد: r1 فيها ٤ مشاركين
  const badges = page.getByLabel(LIVE);
  expect(await badges.count(), "لازم شارة لكل غرفة فيها ناس — واحدة لكل غرفة من r1 و r2").toBe(2);
  await expect(badges.first()).toContainText(/٤|4/);
  expectNoPageErrors(page);
});

test("🔴 تبويب «الغرف» في الدردشات: نفس الفرق بالظبط", async ({ page }) => {
  await openApp(page);
  await tab(page, /الدردشات|Chats/);
  await clearOverlays(page);
  // الفلاتر دورها `tab` مش `button` — والمطابقة مثبّتة بالطرفين عشان
  // «الغرف» في الشريط السفلي مايتطابقش معاها
  await page.getByRole("tab", { name: /^الغرف$|^Rooms$/ }).click();

  const live = page.getByText(/نقاش كورة الليلة/).first();
  const quiet = page.getByText(/قعدة الفجر/).first();
  await expect(live).toBeVisible();
  await expect(quiet).toBeVisible();

  expect(await weight(live)).toBeGreaterThanOrEqual(700);
  expect(await weight(quiet), "الشكل في التبويب ده كان منفصلًا — ده اللي المصدر الواحد بيمنعه").toBeLessThanOrEqual(500);
  expect(await page.getByLabel(LIVE).count()).toBe(2);
  expectNoPageErrors(page);
});

/**
 * «٠ مشارك» بيتقرا كأنه عطل، فالفاضية بتقول إنها فاضية صريح.
 */
test("الغرفة الفاضية بتقول إنها فاضية مش «صفر مشارك»", async ({ page }) => {
  await openApp(page);
  await tab(page, /الغرف|Rooms/);
  await clearOverlays(page);
  await expect(page.getByText(/فارغة — انضمّ وابدأ الحديث|Empty — join and start talking/).first()).toBeVisible();
  // وممنوع يطلع صفر في أي صيغة
  await expect(page.getByText(/(^|\s)(٠|0)\s*(مستمع|مشارك|listening|people)/)).toHaveCount(0);
  expectNoPageErrors(page);
});
