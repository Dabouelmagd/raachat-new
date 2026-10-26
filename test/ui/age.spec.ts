import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp, openProfile, setBirthDate, tab, yearForAge } from "../helpers.js";

/**
 * سن الخدمات: **رع شات للبالغين ١٨+** (الشروط البند ٢، من ١٣ أكتوبر ٢٠٢٦)، والمحفظة
 * بسقوف لحد ٢١. والاختباران اللي كانا بيثبّتان «التطبيق مفتوح لكل الأعمار» سقطا في
 * ٢٦ أكتوبر لما اتصلح نصّ التطبيق — **كانا بيحرسان التناقض نفسه**، والحارس اللي
 * بيقرا الصفحات القانونية في `server/test/appMatchesTerms.test.ts`.
 * السيرفر هو اللي بيمنع فعلًا (اختباراته في server/test/wallet.test.ts) —
 * الاختبارات دي عن الشكل اللي المستخدم بيشوفه.
 */
test.beforeEach(async ({ page }) => { await openApp(page); });

test("الحساب التجريبي (بالغ) بيشوف المحفظة ومفيش قفل", async ({ page }) => {
  await tab(page, /الخدمات|Services/);
  await expect(page.getByText(/محفظتك/)).toBeVisible();
  await expect(page.getByText(/خدمة من/)).toHaveCount(0);
  expectNoPageErrors(page);
});

test("حقل تاريخ الميلاد بيرفض الغلط وبيقول إن رع شات للبالغين", async ({ page }) => {
  await openProfile(page);
  const birth = page.locator("#rc-birth");
  await expect(birth).toHaveValue("1995-06-12"); // تاريخ الديمو الافتراضي
  // مطابق للشروط البند ٢ — ومنوع يرجع «مفتوح لكل الأعمار»
  await expect(page.getByText(/رع شات للبالغين/)).toBeVisible();
  await expect(page.getByText(/لكل الأعمار/)).toHaveCount(0);

  await birth.fill(`${yearForAge(-5)}-01-01`); // تاريخ في المستقبل
  await expect(page.getByRole("alert")).toContainText(/غير صحيح/);
  await expect(page.getByRole("button", { name: /حفظ التغييرات/ })).toBeDisabled();

  await birth.fill("1850-01-01"); // عمر مستحيل
  await expect(page.getByRole("alert")).toBeVisible();

  await birth.fill("1990-05-20");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /حفظ التغييرات/ })).toBeEnabled();
});

test("🔴 غير محدَّد السن: المحفظة مقفولة، وبقيّة التطبيق مفتوحة له (مطابق للسياسة البند ١٠)", async ({ page }) => {
  await openProfile(page);
  // بيفضّي تاريخ ميلاده — وهي **حالة الإنتاج الحقيقية**: الحسابات المنشأة قبل
  // ١٣ أكتوبر ٢٠٢٦ لم يكن تحديده لازمًا فيها، وتُعامَل معاملة غير محدَّدة السن.
  await setBirthDate(page, "");

  await tab(page, /الخدمات|Services/);
  await expect(page.getByText(/خدمة من/)).toBeVisible();
  await expect(page.getByText(/محفظتك/)).toHaveCount(0);
  // والسياسة البند ١٠ بتقول إن دي بتفضل تستخدم باقي التطبيق لحد ما يُحدَّد السن —
  // فالطمأنة هنا **صحيحة**، على عكس حالة الأقلّ من ١٨ (اللي بتُغلق بحسب السياسة).
  await expect(page.getByText(/بقيّة رع شات مفتوحة لك/)).toBeVisible();
  await expect(page.getByRole("button", { name: /حدِّد تاريخ ميلادك/ })).toBeVisible();

  // الشات شغّال عادي
  await tab(page, /الدردشات|Chats/);
  await expect(page.getByRole("heading", { name: /رع شات|الدردشات/ }).or(page.getByText(/الدردشات/)).first()).toBeVisible();
  expectNoPageErrors(page);
});

/**
 * 🔴 **كتابة تاريخ أقلّ من ١٨ مرفوضة (قرار داليا ٢٦ أكتوبر ٢٠٢٦) — بدون حذف أي شيء.**
 *
 * قبلها كان `PATCH /me` يقبل أي تاريخ صالح ويحفظه، فالمستخدم يقرّ بنفسه إنه دون السن
 * والخادم يسجّلها ويكمّل — والسياسة (البند ١٠) تقول إن الحساب في هذه الحالة يُغلق
 * وتُمحى بياناته. فالتسجيل الصامت كان إقرارًا بالعلم بلا الإجراء الموعود.
 *
 * **والحارس الحقيقي في الخادم** (`assertProfileBirthDate`، واختباراته في
 * `server/test/adultOnly.test.ts`) — والمنع هنا كي لا يُرتدّ المستخدم في آخر خطوة.
 */
test("🔴 تاريخ أقلّ من ١٨: زرّ الحفظ مقفول ومعاه سبب صريح", async ({ page }) => {
  await openProfile(page);
  const save = page.getByRole("button", { name: /حفظ التغييرات/ });
  await expect(save).toBeEnabled();

  await page.locator("#rc-birth").fill(`${yearForAge(12)}-01-01`);
  await expect(save, "تاريخ دون ١٨ ممنوع يتحفظ").toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(/للبالغين/);

  // ويرجع يفتح على تاريخ بالغ — فالمنع على القيمة الممنوعة وحدها
  await page.locator("#rc-birth").fill(`${yearForAge(30)}-01-01`);
  await expect(save).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expectNoPageErrors(page);
});

test("الفئة ١٨–٢١: المحفظة مفتوحة وبطاقة السقوف ظاهرة", async ({ page }) => {
  await openProfile(page);
  await setBirthDate(page, `${yearForAge(19)}-03-15`);

  await tab(page, /الخدمات|Services/);
  await expect(page.getByText(/محفظتك/)).toBeVisible();
  await expect(page.getByText(/سقوف لحد سن/)).toBeVisible();
  await expect(page.getByText(/أقصى مبلغ للعملية/)).toBeVisible();
  await expect(page.getByText(/أقصى رصيد في المحفظة/)).toBeVisible();
  await expect(page.getByText(/فواتير هذا الشهر/)).toBeVisible();
});

test("٢١+: مفيش سقوف خالص", async ({ page }) => {
  await openProfile(page);
  await setBirthDate(page, `${yearForAge(30)}-07-01`);

  await tab(page, /الخدمات|Services/);
  await expect(page.getByText(/محفظتك/)).toBeVisible();
  await expect(page.getByText(/سقوف لحد سن/)).toHaveCount(0);
});

test("شاشة الدفع نفسها مقفولة على غير محدَّد السن (لو جه عليها من الخدمات)", async ({ page }) => {
  await openProfile(page);
  // كان بيضبط تاريخ ١٥ سنة — وكتابة تاريخ دون ١٨ بقت مرفوضة من ٢٦ أكتوبر ٢٠٢٦،
  // فالحالة المتبقية والواقعية هي **غير محدَّد السن** (حسابات ما قبل ١٣ أكتوبر).
  await setBirthDate(page, "");
  await tab(page, /الخدمات|Services/);
  // القفل بيمنع أصلًا الوصول لأزرار الفواتير
  await expect(page.getByText(/خدمة من/)).toBeVisible();
  await expect(page.getByRole("button", { name: /كهرباء|مياه|غاز/ })).toHaveCount(0);
  await clearOverlays(page);
});
