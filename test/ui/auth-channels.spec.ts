import { expect, test } from "@playwright/test";
import { expectNoPageErrors, requireBuild, DIST } from "../helpers";

/**
 * شاشة الدخول بتسأل السيرفر إيه القنوات المتاحة (`GET /auth/channels`).
 *
 * **بناء الديمو مابيعملش نداءات شبكة**، فالاختبار هنا بيفحص الحالة الافتراضية:
 * الخيارين شغّالين والتنبيه مش ظاهر. قفل الخيار نفسه متفحوص على السيرفر في
 * `server/test/channels.test.ts` (٤ اختبارات) — وده أدق مكان له لأن القرار
 * قرار السيرفر مش الواجهة.
 */
test("في وضع الديمو: الهاتف والبريد الإلكتروني الاتنين شغّالين ومفيش تنبيه", async ({ page }) => {
  requireBuild();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as typeof page & { rcErrors?: string[] }).rcErrors = errors;
  await page.goto("file://" + DIST);

  await page.getByRole("button", { name: /دخول بكود لمرة واحدة|one-time code/ }).click();
  const phone = page.getByRole("button", { name: /^الهاتف$|^Phone$/ });
  await expect(phone).toBeEnabled();
  await expect(page.getByRole("button", { name: /^البريد الإلكتروني$|^Email$/ })).toBeEnabled();
  await expect(page.getByText(/الدخول بالرقم موقوف مؤقتًا|temporarily unavailable/)).toHaveCount(0);

  // والاختيار لسه بيشتغل: الخانة بتقبل رقم مصري
  await phone.click();
  await page.getByLabel(/رقم الهاتف|Phone number/).fill("01000000000");
  await expect(page.getByLabel(/رقم الهاتف|Phone number/)).toHaveValue("01000000000");
  expectNoPageErrors(page);
});
