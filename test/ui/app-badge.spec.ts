import { expect, test, type Page } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp, tab } from "../helpers";

/**
 * **علامة العدّاد على أيقونة التطبيق** (Badging API).
 *
 * المستخدم لازم يشوف على لوجو التطبيق في شاشة جهازه إن فيه رسايل مستنية،
 * وتختفي أول ما يقراها. التطبيق وهو مفتوح هو صاحب القرار في الرقم — بيحسبه
 * من مجموع `unread` بتاع كل المحادثات.
 *
 * **والمتصفح هنا مالوش أيقونة على شاشة الجهاز** (مش تطبيق مثبَّت)، فبنستبدل
 * `setAppBadge` و`clearAppBadge` ونسجّل النداءات — الفحص على إن التطبيق
 * **طلب** العلامة بالرقم الصح، وده بالظبط كل اللي الكود بتاعنا مسؤول عنه.
 */

type BadgeWin = { __badge?: (number | "clear")[] };

/** بيزرع بدائل للـ Badging API **قبل** أي كود صفحة يشتغل. */
async function withBadgeSpy(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as BadgeWin;
    w.__badge = [];
    // بعض المتصفحات مافيهاش الـ API أصلًا، فبنعرّفها عشان الفحص يبقى حتميًا
    Object.defineProperty(navigator, "setAppBadge", {
      configurable: true,
      value: (n?: number) => { w.__badge!.push(n ?? 0); return Promise.resolve(); },
    });
    Object.defineProperty(navigator, "clearAppBadge", {
      configurable: true,
      value: () => { w.__badge!.push("clear"); return Promise.resolve(); },
    });
  });
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as BadgeWin).__badge ?? []);

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/**
 * مجموع العدّادات الظاهرة في قايمة الدردشات.
 *
 * 🔴 مش رقمًا مكتوبًا بالإيد (الدرس من ٢٦ أكتوبر ٢٠٢٦): الاختبار كان بيتوقّع
 * `2` — مجموع بيانات الديمو وقتها — فأول ما اتضافت محادثات فيها جديد (عشان
 * الفرق بين «بولد» و«عادي» يتجرّب في «جروباتي» و«قنواتي») سقط **اختبار سليم**.
 * والمقارنة بالقايمة أقوى أصلًا: دي الفرضية الحقيقية — **الرقم على الأيقونة =
 * اللي المستخدم شايفه في القايمة**.
 */
async function listTotal(page: Page) {
  const labels = await page.getByLabel(/رسايل ما اتقرتش|Unread messages/).allInnerTexts();
  return labels.reduce((sum, t) => sum + Number(toLatin(t.trim()) || 0), 0);
}

test("🔴 العلامة بتظهر بعدد الرسايل المش مقروءة", async ({ page }) => {
  await withBadgeSpy(page);
  await openApp(page);
  await tab(page, /الدردشات|Chats/);
  await clearOverlays(page);
  const total = await listTotal(page);
  expect(total, "بيانات الديمو لازم يكون فيها جديد وإلا الاختبار بلا معنى").toBeGreaterThan(0);
  await expect.poll(() => calls(page), { timeout: 5000 }).toContain(total);
  expectNoPageErrors(page);
});

test("🔴 العلامة بتنقص وقت القراءة وتختفي لما كله يتقرا", async ({ page }) => {
  await withBadgeSpy(page);
  await openApp(page);
  await tab(page, /الدردشات|Chats/);
  await clearOverlays(page);
  const total = await listTotal(page);
  await expect.poll(() => calls(page), { timeout: 5000 }).toContain(total);

  // فتح محادثة واحدة بيصفّر عدّادها بس — فالرقم ينقص مش يتمسح
  await page.getByText(/مريم عبد الله/).first().click();
  await expect(page.getByRole("heading", { name: /مريم عبد الله/ })).toBeVisible();
  await page.getByRole("button", { name: /رجوع|Back/ }).first().click();
  await clearOverlays(page);
  await expect.poll(() => calls(page), { timeout: 5000 }).toContain(total - 2);

  // ولما كل اللي فيه جديد يتقرا، العلامة تتمسح
  for (const name of [/فريق التصميم|Design Team/, /أخبار رع شات|Raa Chat News/]) {
    await page.getByText(name).first().click();
    await page.getByRole("button", { name: /رجوع|Back/ }).first().click();
    await clearOverlays(page);
  }
  expect(await listTotal(page), "القايمة لازم تبقى بلا عدّادات").toBe(0);
  await expect.poll(() => calls(page), { timeout: 5000 }).toContain("clear");
  expectNoPageErrors(page);
});

test("التطبيق مابيقعش لو المتصفح مش مدعّم الـ Badging API", async ({ page }) => {
  await page.addInitScript(() => {
    // حذف صريح: نفس حال سفاري القديم وفايرفوكس
    // @ts-expect-error بنشيلها عن قصد
    delete navigator.setAppBadge;
    // @ts-expect-error بنشيلها عن قصد
    delete navigator.clearAppBadge;
  });
  await openApp(page);
  await tab(page, /الدردشات|Chats/);
  await expect(page.getByText(/مريم عبد الله/).first()).toBeVisible();
  expectNoPageErrors(page);
});
