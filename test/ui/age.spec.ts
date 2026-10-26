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

test("🔴 اللي أقلّ من ١٨ بإقراره: المحفظة مقفولة، ومفيش طمأنة إن باقي التطبيق مفتوح له", async ({ page }) => {
  await openProfile(page);
  await setBirthDate(page, `${yearForAge(12)}-01-01`);

  await tab(page, /الخدمات|Services/);
  await expect(page.getByText(/خدمة من/)).toBeVisible();
  await expect(page.getByText(/محفظتك/)).toHaveCount(0);
  // 🔴 كان بيتأكد إن الرسالة بتقول «بقيّة رع شات مفتوحة لك» — وده مناقض للسياسة
  // البند ١٠: الحساب اللي يتبيّن إنه دون ١٨ **يُغلق وتُمحى بياناته**. فطمأنة القاصر
  // إن باقي التطبيق مفتوح له = التطبيق بيقول عكس المستند المنشور.
  await expect(page.getByText(/بقيّة رع شات مفتوحة لك/)).toHaveCount(0);
  await expect(page.getByText(/مخصَّص لمن بلغ/)).toBeVisible();
  // تاريخه محدد خلاص، فمفيش زرار «حدِّد تاريخ ميلادك»
  await expect(page.getByRole("button", { name: /حدِّد تاريخ ميلادك/ })).toHaveCount(0);

  // الشات شغّال عادي للقاصر
  await tab(page, /الدردشات|Chats/);
  await expect(page.getByRole("heading", { name: /رع شات|الدردشات/ }).or(page.getByText(/الدردشات/)).first()).toBeVisible();
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

test("شاشة الدفع نفسها مقفولة على القاصر (لو جه عليها من الخدمات)", async ({ page }) => {
  await openProfile(page);
  await setBirthDate(page, `${yearForAge(15)}-06-01`);
  await tab(page, /الخدمات|Services/);
  // القفل بيمنع أصلًا الوصول لأزرار الفواتير
  await expect(page.getByText(/خدمة من/)).toBeVisible();
  await expect(page.getByRole("button", { name: /كهرباء|مياه|غاز/ })).toHaveCount(0);
  await clearOverlays(page);
});
