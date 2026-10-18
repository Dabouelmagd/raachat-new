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

test("🔴 العلامة بتظهر بعدد الرسايل المش مقروءة", async ({ page }) => {
  await withBadgeSpy(page);
  await openApp(page);
  // بيانات الديمو: محادثة واحدة فيها رسالتين مش مقروءين
  await expect.poll(() => calls(page), { timeout: 5000 }).toContain(2);
  expectNoPageErrors(page);
});

test("🔴 العلامة بتختفي بعد ما المستخدم يقرا", async ({ page }) => {
  await withBadgeSpy(page);
  await openApp(page);
  await expect.poll(() => calls(page), { timeout: 5000 }).toContain(2);

  await tab(page, /الدردشات|Chats/);
  await clearOverlays(page);
  // فتح المحادثة بيصفّر العدّاد → العلامة تتمسح
  await page.getByText(/مريم عبد الله/).first().click();
  await expect(page.getByRole("heading", { name: /مريم عبد الله/ })).toBeVisible();
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
