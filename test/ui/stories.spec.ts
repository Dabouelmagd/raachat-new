import { expect, test } from "@playwright/test";
import { expectNoPageErrors, openApp } from "../helpers";

/**
 * قبل ١٢ أكتوبر: شريط القصصز كان بيعرض **دايرة لكل قصص مش لكل حساب**، فاللي
 * نزّل تلات قصصز يظهر تلات مرات والشريط يتملى بحساب واحد. والعارض كان بيمشي في
 * قايمة القصصز **كلها** بالترتيب — تفتحي قصص واحد وتلاقي نفسك في قصص حد
 * تاني من غير ما تطلبي.
 *
 * بيانات الديمو فيها ٤ قصصز من ٣ حسابات (مريم عندها اتنين) — فالفرق بين
 * «لكل قصص» و«لكل حساب» بيبان في العدد.
 */
/**
 * دواير **الحسابات** في الشريط — من غير القصص الممول (`SponsoredStory`)،
 * ده إعلان مش حساب وله اختباره في `sponsored-story.spec.ts`.
 */
const bar = (page: import("@playwright/test").Page) =>
  page.locator("button").filter({ has: page.locator("div.h-14.w-14") })
    .filter({ hasNot: page.getByText(/^إعلان$/) });

test("شريط القصصز: دايرة واحدة لكل حساب مش لكل قصص", async ({ page }) => {
  await openApp(page);

  // ٤ قصصز من ٣ حسابات + زرار «قصتك» = ٤ دواير
  await expect(bar(page)).toHaveCount(4);

  // الحساب اللي عنده أكتر من قصص بيبان عليه العدد
  const mariam = page.getByRole("button", { name: /مريم عبد الله — 2|Mariam Abdallah — 2/ });
  await expect(mariam).toBeVisible();
  expectNoPageErrors(page);
});

test("العارض بيعرض قصصز الحساب ده بس وبيقفل في آخرها", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /مريم عبد الله — 2|Mariam Abdallah — 2/ }).click();

  // الشرايط فوق = عدد قصصز مريم (٢)، مش عدد القصصز كلها (٤)
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

/**
 * **البلاغ على قصص بسبب حقيقي** (١٦ أكتوبر ٢٠٢٦).
 *
 * قبل كده `StoryViewer` كان بيبعت `reason: "inappropriate"` **مثبّتًا** بلا أي
 * منتقي — فبعد ما ضفنا سبب «إيذاء طفل» وطابور أولوية في اللوحة (١٥ أكتوبر)،
 * البلاغ على **قصص** فضل بيروح في طابور السبام. ونفس القايمة بقت مصدرًا
 * واحدًا (`ReportReasons`) مشتركًا مع قايمة خيارات الرسالة.
 */
const viewerOf = (page: import("@playwright/test").Page) =>
  page.locator("div.fixed.inset-0").filter({ hasText: /إبلاغ|Report/ });

const openStory = async (page: import("@playwright/test").Page) => {
  await openApp(page);
  await page.getByRole("button", { name: /مريم عبد الله — 2|Mariam Abdallah — 2/ }).click();
  const v = viewerOf(page);
  await expect(v).toBeVisible();
  return v;
};

test("الإبلاغ على قصص بيفتح منتقي أسباب فيه «إيذاء طفل»", async ({ page }) => {
  const v = await openStory(page);
  const btn = v.getByRole("button", { name: /^إبلاغ$|^Report$/ });
  await expect(btn).toHaveAttribute("aria-expanded", "false");

  await btn.click();
  await expect(v.getByText(/سبب الإبلاغ:|Report reason:/)).toBeVisible();
  // السبب ده لازم يبقى موجود ومميّز — بلاي بتطلب مسار CSAE صريح
  await expect(v.getByRole("button", { name: /إيذاء طفل أو استغلاله|Child abuse or exploitation/ })).toBeVisible();
  for (const r of [/^إساءة$|^Abuse$/, /^مزعجة$|^Spam$/, /^غير لائق$|^Inappropriate$/, /^احتيال$|^Scam$/]) {
    await expect(v.getByRole("button", { name: r })).toBeVisible();
  }
  expectNoPageErrors(page);
});

test("اختيار السبب بيسجّل البلاغ ويقفل المنتقي", async ({ page }) => {
  const v = await openStory(page);
  await v.getByRole("button", { name: /^إبلاغ$|^Report$/ }).click();
  await v.getByRole("button", { name: /إيذاء طفل أو استغلاله|Child abuse or exploitation/ }).click();

  await expect(v.getByText(/سبب الإبلاغ:|Report reason:/)).toHaveCount(0);
  await expect(v.getByRole("button", { name: /تم الإبلاغ|Reported/ })).toBeDisabled();
  expectNoPageErrors(page);
});

test("مؤقّت القصص بيتوقف وانتِ بتختاري السبب", async ({ page }) => {
  // القصص ٤ ثواني. من غير التوقّف، المنتقي يتفتح والعارض يتقدّم أو يتقفل
  // من تحت إيد المستخدم والبلاغ يضيع (أو ينزل على قصص تانية).
  const v = await openStory(page);
  await expect(v.getByText("مريم عبد الله")).toBeVisible();
  await v.getByRole("button", { name: /^إبلاغ$|^Report$/ }).click();
  await expect(v.getByText(/سبب الإبلاغ:|Report reason:/)).toBeVisible();

  await page.waitForTimeout(6000); // أطول من مدة القصص ومن الاتنين مع بعض
  await expect(v, "العارض أُغلِق والمنتقي مفتوح").toBeVisible();
  await expect(v.getByText(/سبب الإبلاغ:|Report reason:/), "المنتقي اختفى").toBeVisible();
  await expect(v.getByText("مريم عبد الله"), "القصص اتقدّمت وانتِ بتختاري").toBeVisible();
  expectNoPageErrors(page);
});
