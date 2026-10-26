import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp, tab } from "../helpers";

/**
 * **القصص الممول — موضع `story`.**
 *
 * الموضع كان **مباعًا في اللوحة بـ٢٥٠ ج/يوم ومش معروضًا في التطبيق خالص**:
 * `adsFor("story")` مكانش بيتنادى من أي مكان، يعني المعلن يدفع على مكان عمره
 * ما ظهر لحد، والإحصاءات تفضل صفرًا بلا أي خطأ (اتكشف ١٨ أكتوبر ٢٠٢٦).
 *
 * وبيظهر **في آخر شريط القصص ومتعلّم بـ«إعلان»** — مش وسط قصصز الناس،
 * عشان المستخدم ما يفتكرش إنه من حد يعرفه.
 */
test("🔴 القصص الممول بيظهر في شريط القصص ومتعلّم إعلان", async ({ page }) => {
  await openApp(page);
  await tab(page, /الدردشات|Chats/);
  await clearOverlays(page);

  const circle = page.getByRole("button", { name: /^إعلان — / });
  await expect(circle, "مفيش قصص ممول في الشريط — الموضع مباع ومش بيتعرض").toBeVisible();
  expectNoPageErrors(page);
});

test("بيفتح بملء الشاشة وفيه زر الإعلان وطريق للخروج", async ({ page }) => {
  await openApp(page);
  await tab(page, /الدردشات|Chats/);
  await clearOverlays(page);

  const circle = page.getByRole("button", { name: /^إعلان — / });
  // اسم المعلن من الدايرة نفسها — مش مثبّت على ترتيب بيانات الديمو
  const advertiser = (await circle.getAttribute("aria-label"))!.replace(/^إعلان — /, "");
  await circle.click();

  const close = page.getByRole("button", { name: /إغلاق الإعلان/ });
  await expect(close).toBeVisible();
  await expect(page.getByText(advertiser).last()).toBeVisible();

  // Escape — تالت طريق للخروج زي باقي النوافذ
  await page.keyboard.press("Escape");
  await expect(close).toBeHidden();
  expectNoPageErrors(page);
});
