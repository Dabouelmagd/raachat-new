import { expect, test } from "@playwright/test";
import { DIST, expectNoPageErrors, openApp, requireBuild, tab } from "../helpers";

/**
 * 🔴 **الرقم بقى اسمًا بديلًا للدخول، والكود بيوصل على الإيميل** (٣ نوفمبر ٢٠٢٦).
 *
 * واللي بيتفحص هنا هو **اللي المستخدم بيقراه على الشاشة** — وهو الجزء اللي
 * السيرفر مايقدرش يحميه: لو الشاشة ماقالتش إن الكود جايّ على الإيميل، المستخدم
 * يقعد يستنى رسالة نصية مش جايّة؛ ولو ماقالتش إن الرقم مش بيخلّي جهات اتصاله
 * تلاقيه، يفتكر إنه ضامن حاجة إحنا مش بنعملها.
 *
 * البناء هنا بناء الديمو (مفيش سيرفر)، فالفحص على الشاشة والنصوص. ومنطق السيرفر
 * متفحوص في `server/test/phoneAlias.test.ts` (٧) و`channels.test.ts` (٧).
 */
const open = async (page: import("@playwright/test").Page) => {
  requireBuild();
  await page.goto("file://" + DIST);
};

test("شاشة الدخول: اختيار الرقم بيقول إن الكود على الإيميل مش رسالة نصية", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /دخول بكود لمرة واحدة/ }).click();
  await page.getByRole("button", { name: /^الهاتف$/ }).click();
  const note = page.locator('[role="status"]').filter({ hasText: /البريد الإلكتروني المربوط بالرقم/ });
  await expect(note, "لازم يعرف إن الكود على الإيميل قبل ما يستنى").toBeVisible();
  // والصياغة شرطية — الرد من السيرفر واحد سواء الرقم مربوط ولا لأ
  await expect(note).toContainText(/لو الرقم مش مربوط بحساب/);
});

test("وما بيقولش كده لما يختار البريد الإلكتروني", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /دخول بكود لمرة واحدة/ }).click();
  await page.getByRole("button", { name: /^البريد الإلكتروني$/ }).click();
  await expect(page.locator('[role="status"]').filter({ hasText: /المربوط بالرقم/ })).toHaveCount(0);
});

test("🔴 شاشة ربط الرقم بتقول القاعدة **قبل** الإضافة: للدخول بس ومش بيخلّي جهات اتصالك تلاقيك", async ({ page }) => {
  await openApp(page);
  await tab(page, /\u0627\u0644\u062d\u0633\u0627\u0628|Account/);
  await page.getByRole("button", { name: /\u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0628\u0627\u064a\u0644 \u0644\u0644\u062f\u062e\u0648\u0644/ }).click();
  const rule = page.locator('[role="status"]').filter({ hasText: /\u0645\u0634 \u0628\u064a\u062e\u0644\u0651\u064a \u062c\u0647\u0627\u062a \u0627\u062a\u0635\u0627\u0644\u0643 \u062a\u0644\u0627\u0642\u064a\u0643/ });
  await expect(rule, "\u0627\u0644\u0642\u0627\u0639\u062f\u0629 \u0644\u0627\u0632\u0645 \u062a\u062a\u0642\u0627\u0644 \u0642\u0628\u0644 \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0645\u0634 \u0628\u0639\u062f\u0647\u0627").toBeVisible();
  expectNoPageErrors(page);
});
