import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * (بطلب داليا ١٢ أكتوبر)
 * - **ملكات مصريات**: كليوباترا ونفرتيتي في الملصقات الفرعونية.
 * - **حجم الخط** بيكبر ويصغّر، والإيموجي معاه (لأنها نص).
 *
 * حجم الخط شغّال بتغيير `font-size` بتاع `<html>`، وكل مقاسات Tailwind بالـ rem
 * — فالاختبار بيقيس الحجم الفعلي لنص حقيقي، مش الكلاس.
 */
const openStickers = async (page: import("@playwright/test").Page) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByText(/مريم عبد الله|Mariam/).first().click();
  await clearOverlays(page);
  await page.getByRole("button", { name: /^إيموجي$|^Emoji$/ }).click();
  await page.getByRole("tab", { name: /فرعوني/ }).click();
};

test("كليوباترا ونفرتيتي موجودين في الملصقات الفرعونية", async ({ page }) => {
  await openStickers(page);
  await expect(page.getByRole("button", { name: "كليوباترا" })).toBeVisible();
  await expect(page.getByRole("button", { name: "نفرتيتي" })).toBeVisible();
  expectNoPageErrors(page);
});

test("إرسال ملصق الملكة بيظهر في المحادثة", async ({ page }) => {
  await openStickers(page);
  await page.getByRole("button", { name: "نفرتيتي" }).click();
  await expect(page.locator('img[alt="pharaoh emoji"]').last()).toBeVisible();
  expectNoPageErrors(page);
});

test("حجم الخط بيكبر ويصغّر فعلًا", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByRole("link", { name: /الحساب|Account/ }).click();
  await page.getByRole("button", { name: /خلفية الشات|Chat wallpaper/ }).click();
  const sheet = page.getByRole("dialog", { name: /شكل الشات|Chat appearance/ });
  const sample = sheet.getByText(/كده هيبقى شكل الكلام|This is how your text/);
  const sizeOf = async () => parseFloat(await sample.evaluate((e) => getComputedStyle(e).fontSize));

  const normal = await sizeOf();
  await sheet.getByRole("button", { name: /^أكبر$|^Larger$/ }).click();
  const bigger = await sizeOf();
  expect(bigger).toBeGreaterThan(normal);

  await sheet.getByRole("button", { name: /^صغير$|^Small$/ }).click();
  expect(await sizeOf()).toBeLessThan(normal);

  // وبيرجع عادي
  await sheet.getByRole("button", { name: /^عادي$|^Normal$/ }).click();
  expect(await sizeOf()).toBeCloseTo(normal, 1);
  expectNoPageErrors(page);
});

test.describe("أكبر حجم خط على أصغر شاشة", () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 568 } });

  test("مفيش محتوى بيخرج برّه الشاشة، وخانة الكتابة لسه ١٦px فما فوق", async ({ page }) => {
    await openApp(page);
    await clearOverlays(page);
    await page.evaluate(() => { localStorage.setItem("rachat-text-scale", "1.25"); });
    await page.reload();
    await page.getByRole("button", { name: /ادخل بالحساب التجريبي/ }).click();
    await clearOverlays(page);
    await page.getByText(/مريم عبد الله|Mariam/).first().click();
    await clearOverlays(page);

    const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    expect(w.s).toBeLessThanOrEqual(w.c);
    const px = await page.getByPlaceholder(/اكتب رسالة|Type a message/).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(px).toBeGreaterThanOrEqual(16);
    expectNoPageErrors(page);
  });
});

/**
 * رموز مصرية جديدة (بطلب داليا ١٤ أكتوبر): أنوبيس · أبو الهول · عين حورس · جعران.
 *
 * الاختبار **مابيكتفيش بوجود الزرار**: ملصق باسم موجود وصورته مكسورة بيعدّي من
 * فحص الاسم، والمستخدم يشوف مربعًا فاضيًا. فبنقيس `naturalWidth` — دي بتبقى صفرًا
 * لو الصورة ما اتحمّلتش أصلًا (مسار غلط أو ملف ناقص من البناء).
 */
const EGY = [
  ["أنوبيس", "Anubis"], ["أبو الهول", "Sphinx"],
  ["عين حورس", "Eye of Horus"], ["جعران", "Scarab"],
  ["توت عنخ آمون", "Tutankhamun"], ["حورس", "Horus"], ["باستت", "Bastet"],
  ["مفتاح الحياة", "Ankh"], ["الأهرام", "Pyramids"], ["فلوكة", "Felucca"],
  ["فانوس", "Lantern"],
] as const;

for (const [ar] of EGY) {
  test(`ملصق «${ar}» موجود وصورته بتتحمّل فعلًا`, async ({ page }) => {
    await openStickers(page);
    const btn = page.getByRole("button", { name: ar, exact: true });
    await expect(btn).toBeVisible();
    const img = btn.locator("img");
    await expect(img).toBeVisible();
    // صفر = الصورة مكسورة، والزرار شكله سليم
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expectNoPageErrors(page);
  });
}

test("إرسال ملصق مصري بيظهر في المحادثة", async ({ page }) => {
  await openStickers(page);
  await page.getByRole("button", { name: "أنوبيس", exact: true }).click();
  const sent = page.locator('img[alt="pharaoh emoji"]').last();
  await expect(sent).toBeVisible();
  expect(await sent.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expectNoPageErrors(page);
});

/**
 * **حارس عام على كل الملصقات**: أي واحد يتضاف بعد كده وصورته مش بتتحمّل
 * (مسار غلط · ملف ناقص من البناء · اسم في `PHARAOH_KINDS` بلا صورة في `IMG`)
 * بيتكشف هنا من غير ما حد يفتكر يكتب له اختبارًا.
 */
test("مفيش ولا ملصق فرعوني صورته مكسورة", async ({ page }) => {
  await openStickers(page);
  const imgs = page.locator('[role="tabpanel"] img, button img');
  const n = await imgs.count();
  expect(n, "مفيش ملصقات ظاهرة أصلًا — المنتقي ما فتحش").toBeGreaterThan(10);
  const broken: string[] = [];
  for (let i = 0; i < n; i++) {
    const w = await imgs.nth(i).evaluate((el) => (el as HTMLImageElement).naturalWidth);
    if (w === 0) broken.push((await imgs.nth(i).getAttribute("src")) ?? `#${i}`);
  }
  expect(broken, `ملصقات صورتها مكسورة: ${broken.join(", ")}`).toEqual([]);
  expectNoPageErrors(page);
});
