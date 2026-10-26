import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * الفرق بين «فيه جديد» و«مقروء» لازم يبان في **كل** قايمة فيها محادثات
 * (بطلب داليا ٢٦ أكتوبر ٢٠٢٦: «الاسم لما يبعت رسالة يبقى بولد ولما تتفتح يبقى
 * من غير بولد … في الشات وكل الجروبات والغرف»).
 *
 * 🔴 العطل كان نمط «القاعدة على مسار واحد»: `ChatsScreen` كان فيه الفرق،
 * و**«جروباتي»** في `GroupsScreen` و**«قنواتي»** في `ChannelsScreen` كانوا
 * `font-bold` **دايمًا** وبلا أي عدّاد — فاللي بيدخل من الشاشتين دول مابيشوفش
 * أي فرق خالص. والمصدر بقى واحد في `src/components/unread.tsx`.
 *
 * والحكم على **وزن الخط المحسوب** مش على اسم الكلاس — السبب في
 * `unread-ticks.spec.ts`.
 *
 * ⚠️ والغرف الصوتية مالهاش «غير مقروء» أصلًا: مفيش `room` في `ThreadType`
 * (dm · group · channel بس) والغرفة مافيهاش رسايل — حضور صوتي بس. فمفيش حاجة
 * تبقى بولد فيها.
 */
const weight = (l: import("@playwright/test").Locator) =>
  l.evaluate((el) => Number(getComputedStyle(el).fontWeight));

/** صفوف «جروباتي»/«قنواتي» أزرار؛ وصفوف الاكتشاف `div` فمابتتطابقش */
const row = (page: import("@playwright/test").Page, name: RegExp) =>
  page.locator("button.rounded-2xl.bg-rachat-card").filter({ hasText: name }).first();
const nameOf = (r: import("@playwright/test").Locator) => r.locator(".truncate.text-sm").first();
const badge = (r: import("@playwright/test").Locator) => r.getByLabel(/رسايل ما اتقرتش|Unread messages/);

test("«جروباتي»: الجروب اللي فيه جديد بولد + عدّاد، والمقروء من غير بولد", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByRole("link", { name: /الجروبات|Groups/ }).click();

  const fresh = row(page, /فريق التصميم|Design Team/);
  const seen = row(page, /مجموعة الشغل|Work Group/);
  expect(await weight(nameOf(fresh)), "الجروب اللي فيه جديد لازم بولد").toBeGreaterThanOrEqual(700);
  expect(await weight(nameOf(seen)), "والمقروء من غير بولد — وإلا مفيش فرق").toBeLessThanOrEqual(500);
  await expect(badge(fresh)).toHaveText(/٣|3/);
  await expect(badge(seen)).toHaveCount(0);
  expectNoPageErrors(page);
});

test("«جروباتي»: بعد ما تفتحي الجروب اسمه يرجع من غير بولد والعدّاد يختفي", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByRole("link", { name: /الجروبات|Groups/ }).click();
  await row(page, /فريق التصميم|Design Team/).click();
  await page.getByRole("button", { name: /رجوع|Back/ }).first().click();
  await clearOverlays(page);

  const back = row(page, /فريق التصميم|Design Team/);
  expect(await weight(nameOf(back))).toBeLessThanOrEqual(500);
  await expect(badge(back)).toHaveCount(0);
  expectNoPageErrors(page);
});

test("«قنواتي»: القناة اللي فيها جديد بولد + عدّاد", async ({ page }) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByRole("tab", { name: /القنوات|Channels/ }).click();
  await page.getByRole("button", { name: /اكتشف قنوات|Discover channels/ }).click();

  const ch = row(page, /أخبار رع شات|Raa Chat News/);
  expect(await weight(nameOf(ch)), "القناة اللي فيها جديد لازم بولد").toBeGreaterThanOrEqual(700);
  await expect(badge(ch)).toHaveText(/٤|4/);
  expectNoPageErrors(page);
});
