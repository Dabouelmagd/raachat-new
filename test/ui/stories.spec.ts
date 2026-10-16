import { expect, test } from "@playwright/test";
import { expectNoPageErrors, openApp } from "../helpers";

/**
 * قبل ١٢ أكتوبر: شريط الستوريز كان بيعرض **دايرة لكل ستوري مش لكل حساب**، فاللي
 * نزّل تلات ستوريز يظهر تلات مرات والشريط يتملى بحساب واحد. والعارض كان بيمشي في
 * قايمة الستوريز **كلها** بالترتيب — تفتحي ستوري واحد وتلاقي نفسك في ستوري حد
 * تاني من غير ما تطلبي.
 *
 * بيانات الديمو فيها ٤ ستوريز من ٣ حسابات (مريم عندها اتنين) — فالفرق بين
 * «لكل ستوري» و«لكل حساب» بيبان في العدد.
 */
const bar = (page: import("@playwright/test").Page) =>
  page.locator("button").filter({ has: page.locator("div.h-14.w-14") });

test("شريط الستوريز: دايرة واحدة لكل حساب مش لكل ستوري", async ({ page }) => {
  await openApp(page);

  // ٤ ستوريز من ٣ حسابات + زرار «قصتك» = ٤ دواير
  await expect(bar(page)).toHaveCount(4);

  // الحساب اللي عنده أكتر من ستوري بيبان عليه العدد
  const mariam = page.getByRole("button", { name: /مريم عبد الله — 2|Mariam Abdallah — 2/ });
  await expect(mariam).toBeVisible();
  expectNoPageErrors(page);
});

test("العارض بيعرض ستوريز الحساب ده بس وبيقفل في آخرها", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /مريم عبد الله — 2|Mariam Abdallah — 2/ }).click();

  // الشرايط فوق = عدد ستوريز مريم (٢)، مش عدد الستوريز كلها (٤)
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
 * **البلاغ على ستوري بسبب حقيقي** (١٦ أكتوبر ٢٠٢٦).
 *
 * قبل كده `StoryViewer` كان بيبعت `reason: "inappropriate"` **مثبّتًا** بلا أي
 * منتقي — فبعد ما ضفنا سبب «إيذاء طفل» وطابور أولوية في اللوحة (١٥ أكتوبر)،
 * البلاغ على **ستوري** فضل بيروح في طابور السبام. ونفس القايمة بقت مصدرًا
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

test("الإبلاغ على ستوري بيفتح منتقي أسباب فيه «إيذاء طفل»", async ({ page }) => {
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

test("مؤقّت الستوري بيتوقف وانتِ بتختاري السبب", async ({ page }) => {
  // الستوري ٤ ثواني. من غير التوقّف، المنتقي يتفتح والعارض يتقدّم أو يتقفل
  // من تحت إيد المستخدم والبلاغ يضيع (أو ينزل على ستوري تانية).
  const v = await openStory(page);
  await expect(v.getByText("مريم عبد الله")).toBeVisible();
  await v.getByRole("button", { name: /^إبلاغ$|^Report$/ }).click();
  await expect(v.getByText(/سبب الإبلاغ:|Report reason:/)).toBeVisible();

  await page.waitForTimeout(6000); // أطول من مدة الستوري ومن الاتنين مع بعض
  await expect(v, "العارض اتقفل والمنتقي مفتوح").toBeVisible();
  await expect(v.getByText(/سبب الإبلاغ:|Report reason:/), "المنتقي اختفى").toBeVisible();
  await expect(v.getByText("مريم عبد الله"), "الستوري اتقدّمت وانتِ بتختاري").toBeVisible();
  expectNoPageErrors(page);
});
