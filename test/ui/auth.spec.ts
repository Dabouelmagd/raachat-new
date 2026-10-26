import { expect, test } from "@playwright/test";
import { DIST, requireBuild } from "../helpers";

/**
 * شاشة الدخول. قبل ١٢ أكتوبر كانت **كود لمرة واحدة وبس**: مفيش كلمة سر، ومفيش
 * تسجيل باسم (أول كود ناجح كان بيعمل حساب باسم مولّد زي «مستخدم ٩١١١»)، والمستخدم
 * المسجّل كان لازم يستنى كود كل مرة يدخل.
 *
 * ملحوظة: البناء هنا هو بناء الديمو (مفيش سيرفر)، فاللي بيتفحص هو **الشاشة
 * نفسها**: المسارات موجودة، وقواعد الإدخال شغّالة قبل أي نداء. التحقّق من
 * السيرفر نفسه في `server/test/password.test.ts` (١٢ اختبار).
 */
const open = async (page: import("@playwright/test").Page) => {
  requireBuild();
  await page.goto("file://" + DIST);
};
const btn = (page: import("@playwright/test").Page, name: RegExp) => page.getByRole("button", { name });

test("الافتراضي دخول بإيميل وكلمة سر — مش كود", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: /^تسجيل الدخول$/ })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(page.getByLabel("كلمة السر", { exact: true })).toBeVisible();
  await expect(btn(page, /^دخول$/)).toBeVisible();
  // ومسار الكود فاضل متاح للحسابات القديمة ودخول الرقم
  await expect(btn(page, /دخول بكود لمرة واحدة/)).toBeVisible();
});

test("زرار الدخول مقفول لحد ما البريد الإلكتروني وكلمة السر يتكتبوا", async ({ page }) => {
  await open(page);
  const send = btn(page, /^دخول$/);
  await expect(send).toBeDisabled();
  await page.getByLabel("البريد الإلكتروني").fill("dalia@example.com");
  await expect(send).toBeDisabled(); // البريد الإلكتروني لوحده ميكروفونفيش
  await page.getByLabel("كلمة السر", { exact: true }).fill("كلمة-سر");
  await expect(send).toBeEnabled();
});

test("الحساب الجديد بياخد اسم، وكلمة السر أقل من ٨ حروف مش مقبولة", async ({ page }) => {
  await open(page);
  await btn(page, /^حساب جديد$/).click();
  await expect(page.getByRole("heading", { name: /^حساب جديد$/ })).toBeVisible();
  const name = page.getByLabel("الاسم");
  await expect(name).toBeVisible(); // الاسم كان مفقود تمامًا قبل كده
  const send = btn(page, /أرسِل لي كود التأكيد/);
  await name.fill("داليا");
  await page.getByLabel("البريد الإلكتروني").fill("dalia@example.com");
  await page.getByLabel("كلمة السر", { exact: true }).fill("1234567");
  await expect(send).toBeDisabled(); // ٧ حروف
  await page.getByLabel("كلمة السر", { exact: true }).fill("12345678");
  await expect(send).toBeDisabled(); // ولسه ناقص تاريخ الميلاد (التطبيق ١٨+)
  await page.getByLabel("تاريخ الميلاد").fill(adultDate());
  await expect(send).toBeEnabled();
});

/**
 * تاريخ ميلاد بعمر محدد، **بهامش يومين** بعيد عن حدود اليوم.
 * الحساب على الحدّ بالظبط بيخلّي الاختبار يسقط عند منتصف الليل (فرق المنطقة
 * الزمنية بين المتصفح والسيرفر) — نفس العلّة اللي سقطت في `adultOnly.test.ts`.
 */
function dobFor(years: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
}
const adultDate = () => dobFor(30);

test("رع شات ١٨+: تاريخ الميلاد مطلوب، والأقل من ١٨ مابيقدرش يكمّل", async ({ page }) => {
  await open(page);
  await btn(page, /^حساب جديد$/).click();
  const send = btn(page, /أرسِل لي كود التأكيد/);
  await page.getByLabel("الاسم").fill("داليا");
  await page.getByLabel("البريد الإلكتروني").fill("dalia@example.com");
  await page.getByLabel("كلمة السر", { exact: true }).fill("كلمة-سر-كفاية");

  // الخانة موجودة ومكتوب تحتها إن التطبيق للبالغين
  const dob = page.getByLabel("تاريخ الميلاد");
  await expect(dob).toBeVisible();
  await expect(page.getByText(/رع شات للبالغين/)).toBeVisible();
  await expect(send).toBeDisabled();

  // أقل من ١٨ = الزرار مقفول ورسالة واضحة
  await dob.fill(dobFor(15));
  await expect(send).toBeDisabled();
  await expect(page.getByText(/١٨ سنة أو أكثر/)).toBeVisible();

  // ١٨ (بهامش يومين) = مفتوح
  await dob.fill(dobFor(18));
  await expect(send).toBeEnabled();
});

test("إظهار/إخفاء كلمة السر", async ({ page }) => {
  await open(page);
  const pass = page.getByLabel("كلمة السر", { exact: true });
  await pass.fill("كلمة-سر");
  await expect(pass).toHaveAttribute("type", "password");
  await btn(page, /إظهار كلمة السر/).click();
  await expect(pass).toHaveAttribute("type", "text");
  await btn(page, /إخفاء كلمة السر/).click();
  await expect(pass).toHaveAttribute("type", "password");
});

test("نسيت كلمة السر: إيميل → كود + كلمة سر جديدة", async ({ page }) => {
  await open(page);
  await btn(page, /^نسيت كلمة السر؟$/).click();
  await expect(page.getByRole("heading", { name: /^نسيت كلمة السر$/ })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill("dalia@example.com");
  await btn(page, /^أرسِل لي الكود$/).click();
  // خطوة الكود: ٦ خانات + كلمة السر الجديدة، والتأكيد مش تلقائي عشان الكلمة لازم تتكتب
  await expect(page.getByLabel(/^خانة ١$/)).toBeVisible();
  const newPass = page.getByLabel("كلمة السر الجديدة", { exact: true });
  await expect(newPass).toBeVisible();
  const set = btn(page, /أنشئ كلمة السرّ الجديدة/);
  await expect(set).toBeDisabled();
  for (let i = 1; i <= 6; i++) await page.getByLabel(new RegExp(`^خانة ${"١٢٣٤٥٦"[i - 1]}$`)).fill(String(i));
  await expect(set).toBeDisabled(); // الكود كامل بس كلمة السر لسه فاضية
  await newPass.fill("كلمة-سر-جديدة");
  await expect(set).toBeEnabled();
});

test("التنقّل بين دخول وحساب جديد والرجوع", async ({ page }) => {
  await open(page);
  await btn(page, /^حساب جديد$/).click();
  await btn(page, /لديّ حساب — دخول/).click();
  await expect(page.getByRole("heading", { name: /^تسجيل الدخول$/ })).toBeVisible();
  await btn(page, /دخول بكود لمرة واحدة/).click();
  await expect(page.getByRole("heading", { name: /^دخول بكود لمرة واحدة$/ })).toBeVisible();
  await expect(btn(page, /^الهاتف$/)).toBeVisible(); // دخول الرقم لسه هنا
  await expect(btn(page, /^البريد الإلكتروني$/)).toBeVisible();
});
