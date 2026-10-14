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

    test("بتقول إن التطبيق للبالغين ١٨+ بالعربي والإنجليزي", async ({ page }) => {
      const body = page.locator("body");
      await expect(body).toContainText(/للبالغين/);
      await expect(body).toContainText(/18 and over|adults/);
      // صياغة «مفتوح لكل الأعمار» اتشالت بقرار الـ ١٨+ (١٣ أكتوبر ٢٠٢٦) — ولو رجعت
      // تبقى الصفحات بتقول للعميل حاجة والتطبيق والمتاجر بيقولوا حاجة تانية
      await expect(body).not.toContainText("مفتوح لكل الأعمار");
      await expect(body).not.toContainText("open to all ages");
    });

    test("بتقول إن تاريخ الميلاد مطلوب لإنشاء الحساب وإنه إقرار مش مستند", async ({ page }) => {
      const body = page.locator("body");
      await expect(body).toContainText(/تاريخ الميلاد|تاريخ ميلادك/);
      await expect(body).toContainText(/إقرار/);          // مش تحقق هوية
      await expect(body).toContainText(/self-declaration/);
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

test("سياسة الخصوصية بتوصّف حفظ أحداث إعلانات الحسابات غير محدَّدة السن", async ({ page }) => {
  await page.goto(legalUrl("privacy"));
  const body = page.locator("body");
  await expect(body).toContainText("أحداث الإعلانات");
  await expect(body).toContainText("يومان");
  await expect(body).toContainText("المراقبة السلوكية");
  await expect(body).toContainText(/وليّ? الأمر/); // بشدّة أو بدونها
  // الحسابات اللي قبل ١٣ أكتوبر سنّها غير محدَّد — ودي سبب مدة اليومين
  await expect(body).toContainText(/غير محدَّدة السن|غير محدَّد/);
});

/**
 * مراجعة المحامي (١٤ أكتوبر ٢٠٢٦): التصنيف العمري ١٨+ عند بلاي بيترفض لو
 * السياسة فيها **أي** فقرة توحي بوجود قاصرين متوقَّعين (IARC). فجدول الاحتفاظ
 * مابقاش يقول «من يثبت أنه دون ١٨» — القاصر لو اتكشف **بيتقفل حسابه وتتمسح
 * بياناته فورًا**، مش بتتحفظ له أحداث إعلانات يومين.
 */
test("السياسة مابتوحيش بوجود قاصرين متوقَّعين، والمسح فوري", async ({ page }) => {
  await page.goto(legalUrl("privacy"));
  const body = page.locator("body");
  await expect(body).not.toContainText("أو من يثبت أنه دون ١٨");
  await expect(body).not.toContainText("or found to be under 18");
  await expect(body).toContainText(/فورًا ودون انتظار طلب/);
  await expect(body).toContainText(/immediately, without waiting for a request/);
});

/**
 * شرط جوجل: Play Billing **حصرًا** لأي شراء رقمي داخل التطبيق، والدفع الخارجي
 * لفواتير العالم الحقيقي بس. البند ٧ كان بيقول «دفع فواتير عبر شريك دفع» من غير
 * التفرقة دي — وهي اللي بتتقاس عليها الموافقة.
 */
test("الشروط بتفرّق بين فواتير العالم الحقيقي والمشتريات الرقمية", async ({ page }) => {
  await page.goto(legalUrl("terms"));
  const body = page.locator("body");
  await expect(body).toContainText(/العالم الحقيقي/);
  await expect(body).toContainText("Google Play Billing");
  await expect(body).toContainText(/In-App Purchase/);
  await expect(body).toContainText(/real-world/);
});

test("معايير المجتمع فيها بند CSAE صريح وجهة اتصال لسلامة الأطفال", async ({ page }) => {
  await page.goto(legalUrl("community"));
  const body = page.locator("body");
  // بلاي بتطلب حظرًا **صريحًا** — «أي محتوى يمسّ القُصَّر» مكانش كفاية
  await expect(body).toContainText(/الاعتداء الجنسي على الأطفال واستغلالهم/);
  await expect(body).toContainText(/Child sexual abuse and exploitation/);
  await expect(body).toContainText(/مسؤولًا لسلامة الأطفال|مسؤول سلامة الأطفال/);
  await expect(body).toContainText(/child safety contact/);
  await expect(page.locator("#draft")).toBeVisible(); // لسه مسوّدة لحد المحامي
});
