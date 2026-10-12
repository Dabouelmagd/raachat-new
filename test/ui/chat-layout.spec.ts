import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * تنسيق الرسايل على الموبايل (بلاغ إنتاج ١٢ أكتوبر).
 *
 * العطل: فقاعة الرسالة مكانش فيها `break-words`، فأي **رابط طويل** أو كلمة بلا
 * مسافات ما بتتكسرش — النص بيخرج برّه الفقاعة و**يتقص**، والمستخدم يشوف الرسالة
 * ناقصة من أولها أو آخرها. ومابيعملش سكرول أفقي للصفحة (فيه أب بيقص)، فالقياس
 * الصح مش `scrollWidth` بتاع الصفحة — ده **محتوى أعرض من صندوقه**.
 *
 * محادثة `t5` في بيانات الديمو موجودة **عن قصد** للحالة دي: اسم طويل جدًا،
 * ورسالة فيها رابط طويل، ورسالة فيها كلمة إنجليزية بلا مسافات.
 */
const PHONE = { width: 360, height: 780 };

/** عناصر محتواها أعرض من صندوقها (يعني بيتقص)، بعد استثناء اللي بيقصّ بـ «…» عن قصد */
const cutElements = (page: import("@playwright/test").Page, selector: string) =>
  page.$$eval(selector, (nodes) =>
    nodes
      .flatMap((n) => [n, ...Array.from(n.querySelectorAll("*"))])
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.textOverflow === "ellipsis" || s.overflowX === "auto" || s.overflowX === "scroll") return false;
        return el.scrollWidth > el.clientWidth + 1;
      })
      .map((el) => `${el.tagName}.${(el.className || "").toString().slice(0, 60)} +${el.scrollWidth - el.clientWidth}px`),
  );

test("رابط طويل وكلمة بلا مسافات بيتكسروا جوه الفقاعة مش بيتقصوا", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  await page.getByText(/nsw-bity/).first().click();
  await clearOverlays(page);

  const bubbles = page.locator("div.rounded-2xl.max-w-\\[78\\%\\], div.max-w-\\[78\\%\\]");
  await expect(bubbles.first()).toBeVisible();
  expect(await cutElements(page, "div.max-w-\\[78\\%\\]")).toEqual([]);

  // والنص كامل فعلًا مش مقصوص
  await expect(page.getByText("testing-1234567890", { exact: false })).toBeVisible();
  await expect(page.getByText("Supercalifragilisticexpialidocious", { exact: false })).toBeVisible();
  expectNoPageErrors(page);
});

test("الفقاعة مابتعدّيش ٧٨٪ من عرض الشاشة", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  await page.getByText(/nsw-bity/).first().click();
  await clearOverlays(page);

  const widths = await page.$$eval("div.max-w-\\[78\\%\\]", (els) => els.map((e) => e.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(2);
  for (const w of widths) expect(w).toBeLessThanOrEqual(360 * 0.78 + 1);
  expectNoPageErrors(page);
});
