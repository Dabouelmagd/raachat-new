import { expect, test } from "@playwright/test";
import { legalUrl } from "../helpers.js";

/**
 * الصفحات القانونية: الكلام اللي بيتقال للعميل لازم يطابق اللي التطبيق بيعمله فعلًا.
 * الاختبار ده بيحمي من إن حد يعدّل سلوك السن في الكود وينسى النصوص (أو العكس).
 */
const pages = [
  { file: "privacy", label: "سياسة الخصوصية" },
  { file: "terms", label: "شروط الاستخدام" },
];

for (const p of pages) {
  test.describe(p.label, () => {
    test.beforeEach(async ({ page }) => { await page.goto(legalUrl(p.file)); });

    test("بتقول إن التطبيق لكل الأعمار بالعربي والإنجليزي", async ({ page }) => {
      const body = page.locator("body");
      await expect(body).toContainText("مفتوح لكل الأعمار");
      await expect(body).toContainText("open to all ages");
      // الصياغة القديمة («مخصص لمن بلغ ١٨ سنة» / «must be 18+») لازم تكون اتشالت
      await expect(body).not.toContainText("مخصص لمن بلغ");
      await expect(body).not.toContainText("must be 18+");
      await expect(body).not.toContainText("for people aged");
    });

    test("بتوضّح حدود المحفظة لحد ٢١ وتنبيه المسوّدة", async ({ page }) => {
      await expect(page.locator("body")).toContainText("٢١");
      await expect(page.locator("#draft")).toBeVisible();
    });

    test("النسختين العربية والإنجليزية موجودين ومفيش تمدد أفقي على الموبايل", async ({ page }) => {
      await expect(page.locator("h1")).toHaveCount(2);
      await expect(page.locator("div.en")).toBeVisible();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
      expect(fits, "الصفحة بتتمدّد أفقيًا على شاشة الموبايل").toBe(true);
    });
  });
}

test("سياسة الخصوصية بتوصّف حفظ أحداث إعلانات الأقل من ١٨", async ({ page }) => {
  await page.goto(legalUrl("privacy"));
  const body = page.locator("body");
  await expect(body).toContainText("أحداث الإعلانات");
  await expect(body).toContainText("يومان");
  await expect(body).toContainText("المراقبة السلوكية");
  await expect(body).toContainText(/وليّ? الأمر/); // بشدّة أو بدونها
});
