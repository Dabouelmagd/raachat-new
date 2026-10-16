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

/**
 * **مسار التبليغ لازم يسمّي قناة فعلية — بلاي بتطلب الجهة بالاسم في الإقرار.**
 * «يُبلَّغ الأمر إلى الجهات المختصة» كلام صحيح ومابيقولش حاجة: المستخدم مايعرف
 * مين، والإقرار بيبقى ناقص. فالفحص على **رقم/اسم قناة حقيقية** مش على وجود
 * كلمة «الجهات المختصة» — دي بتعدّي على النصّ القديم بالظبط.
 *
 * **وعن قصد مفيش ذكر لـNCMEC هنا:** التبليغ له اختياري للشركات غير الأمريكية
 * ومحتاج تسجيل كـESP — وتسمية قناة في صفحة منشورة **وعد**. فلو اتكتبت قبل
 * التسجيل تبقى نفس عطل «نمحو بياناته فورًا» بلا آلية. تتضاف **بعد** التسجيل.
 * أمّا الجهات المصرية فمفيش لها شرط مسبق: ١٦٠٠٠ خط عام، والشكوى حق لأي حد.
 */
test("معايير المجتمع بتسمّي جهة التبليغ المصرية بقناة فعلية", async ({ page }) => {
  await page.goto(legalUrl("community"));
  const body = page.locator("body");
  // القناة بالرقم — بالأرقام العربية-الهندية في النسخة العربية والغربية في الإنجليزية
  await expect(body).toContainText(/خط نجدة الطفل ١٦٠٠٠/);
  await expect(body).toContainText(/Child Helpline 16000/);
  // والجهة اللي بتديرها، والمسار الجنائي
  // ⚠️ على الجذر مش بالتعريف: النصّ «التابع **للمجلس**» = ل+ل+مجلس، فمافيهوش
  // «المجلس» خالص — وأي سابقة عربية (ال/لل/بال/وال) بتكسر مطابقة حرفية.
  await expect(body).toContainText(/مجلس القومي للطفولة والأمومة/);
  await expect(body).toContainText(/National Council for Childhood and Motherhood/);
  await expect(body).toContainText(/النيابة العامة/);
  await expect(body).toContainText(/Public Prosecution/);
});

/**
 * **بريد مسؤول سلامة الأطفال لازم يكون بريدًا حقيقيًا قابلًا للنقر.**
 * بلاي بتطلب جهة اتصال معيَّنة لسلامة الأطفال، و«عيّنّا مسؤولًا» فوق بريد
 * بين أقواس (`[child-safety@]`) = إقرار غير صحيح في نموذج الرفع: الصفحة
 * بتقول إن فيه مسؤول وطريقة الوصول له مش موجودة.
 *
 * والفحص على **الـ mailto نفسه** مش على نصّ الصفحة: `[بريد مسؤول سلامة
 * الأطفال]` كان نصًّا جوه `<a href="mailto:[child-safety@]">`، فأي فحص على
 * «فيه كلمة بريد» كان بيعدّي وهو placeholder.
 */
test("بريد سلامة الأطفال بريد حقيقي — مفيش خانة فاضية في الصفحة", async ({ page }) => {
  await page.goto(legalUrl("community"));

  // كل `mailto:` في الصفحة لازم يكون بريدًا صالحًا — مش `mailto:[child-safety@]`
  const hrefs = await page
    .locator('a[href^="mailto:"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
  expect(hrefs.length, "مفيش ولا بريد في الصفحة").toBeGreaterThan(1);
  for (const h of hrefs) {
    expect(h, `mailto لسه خانة فاضية: ${h}`).toMatch(/^mailto:[^[\]\s@]+@[^[\]\s@]+\.[a-z]{2,}$/i);
  }

  // ومفيش أي خانة `[...]` فاضلة في نصّ الصفحة
  const text = await page.locator("main").innerText();
  expect(text, "لسه فيه خانة فاضية في معايير المجتمع").not.toMatch(/\[[^\]\n]{2,60}\]/);

  // ونسختا الصفحة لازم يبقى عليهما **نفس** رقم الإصدار — الإنجليزية كانت
  // فاضلة على ٢٫٠ بعد ما البند الجديد اتضاف للنسختين.
  const ver = text.match(/Version (\d+)\.(\d+)/);
  expect(ver, "رقم إصدار النسخة الإنجليزية مش موجود").toBeTruthy();
  // الأرقام العربية-الهندية والفاصلة العربية (٫) — مش نفس محارف الإنجليزي
  const ar = (s: string) => s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const arVer = `الإصدار ${ar(ver![1])}٫${ar(ver![2])}`;
  expect(text, `الإصدار العربي مش مطابق للإنجليزي (${ver![0]} ← ${arVer})`).toContain(arVer);
});
