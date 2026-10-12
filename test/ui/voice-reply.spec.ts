import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * **الرد بالصوت** (التالتة من اختيارات داليا).
 *
 * التسجيل في المتصفح بتاع الاختبار مفيش فيه ميكروفون، فالمسجّل بيشتغل في وضع
 * تجريبي (موجة من غير صوت) — وده كفاية لفحص المسار: الرد بيتضبط، والتسجيل
 * بيبدأ، والرسالة الصوتية بتتبعت مربوطة بالرسالة اللي بنرد عليها.
 */
const openChat = async (page: import("@playwright/test").Page) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByText(/مريم عبد الله|Mariam/).first().click();
  await clearOverlays(page);
};

const actionsOf = async (page: import("@playwright/test").Page, text: RegExp) => {
  await page.getByText(text).first().click();
  return page.getByRole("dialog", { name: /خيارات الرسالة|Message options/ });
};

test("«رد بالصوت» بيضبط الرد ويبدأ التسجيل، والإرسال بيبعت رسالة صوتية", async ({ page }) => {
  await openChat(page);
  const menu = await actionsOf(page, /جهزت حاجتك|Is your stuff ready/);
  await menu.getByRole("button", { name: /رد بالصوت|Reply with voice/ }).click();

  // شريط «الرد على» ظاهر والتسجيل شغّال في نفس الوقت
  await expect(page.getByText(/الرد على|Replying to/)).toBeVisible();
  await expect(page.getByRole("button", { name: /إرسال الرسالة الصوتية|Send voice message/ })).toBeVisible();

  await page.getByRole("button", { name: /إرسال الرسالة الصوتية|Send voice message/ }).click();
  await expect(page.getByRole("button", { name: /تشغيل الرسالة الصوتية|Play voice message/ })).toBeVisible();
  // شريط الرد اتفضّى بعد الإرسال
  await expect(page.getByText(/الرد على|Replying to/)).toHaveCount(0);
  expectNoPageErrors(page);
});

test("اقتباس الرد على رسالة صوتية بيقول «رسالة صوتية» مش فاضي", async ({ page }) => {
  await openChat(page);
  // نبعت رسالة صوتية الأول
  await page.getByRole("button", { name: /تسجيل صوتي|Voice message/ }).click();
  await page.getByRole("button", { name: /إرسال الرسالة الصوتية|Send voice message/ }).click();
  const voiceBubble = page.getByRole("button", { name: /تشغيل الرسالة الصوتية|Play voice message/ });
  await expect(voiceBubble).toBeVisible();

  // الضغط على فقاعة الرسالة الصوتية لازم يفتح «خيارات الرسالة» — الزاوية
  // عشان مانضغطش على الموجة أو الأزرار (دول بيبلعوا الضغط عن قصد)
  const bubble = page.locator("div.group").filter({ has: voiceBubble }).last();
  await bubble.click({ position: { x: 4, y: 4 } });
  const menu = page.getByRole("dialog", { name: /خيارات الرسالة|Message options/ });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: /^رد$|^Reply$/ }).click();
  await expect(page.getByText(/🎤 رسالة صوتية|🎤 Voice message/).first()).toBeVisible();
  expectNoPageErrors(page);
});

test("سرعة التشغيل بتلف ١× ← ١٫٥× ← ٢× ← ١×", async ({ page }) => {
  await openChat(page);
  await page.getByRole("button", { name: /تسجيل صوتي|Voice message/ }).click();
  await page.getByRole("button", { name: /إرسال الرسالة الصوتية|Send voice message/ }).click();
  const speed = page.getByRole("button", { name: /سرعة التشغيل|Playback speed/ });
  await expect(speed).toHaveText("1×");
  await speed.click();
  await expect(speed).toHaveText("1.5×");
  await speed.click();
  await expect(speed).toHaveText("2×");
  await speed.click();
  await expect(speed).toHaveText("1×");
  expectNoPageErrors(page);
});

test("الضغط على الموجة بينقل موضع التشغيل", async ({ page }) => {
  await openChat(page);
  await page.getByRole("button", { name: /تسجيل صوتي|Voice message/ }).click();
  // ثانيتين تسجيل عشان تبقى فيه مدة ننقل جوّاها
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: /إرسال الرسالة الصوتية|Send voice message/ }).click();
  const bar = page.getByRole("slider", { name: /موضع التشغيل|Playback position/ });
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  const box = (await bar.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  await expect(bar).not.toHaveAttribute("aria-valuenow", "0");
  expectNoPageErrors(page);
});
