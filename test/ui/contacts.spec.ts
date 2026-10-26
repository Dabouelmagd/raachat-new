import { expect, test, type Page } from "@playwright/test";
import { expectNoPageErrors, openApp, stubCapacitor, tab } from "../helpers";

/**
 * **جهات الاتصال في الـAPK** (بلاغ داليا ١٩ أكتوبر ٢٠٢٦: «لا يفتح أرقام الهاتف
 * من على الموبايل» — والشاشة بتقول «جهازك أو متصفحك مش بيسمح بقراءة جهات الاتصال»
 * على جهاز الإضافة متركّبة فيه فعلًا).
 *
 * السبب: الكود كان بياخد الإضافة من `window.Capacitor.Plugins.Contacts` مباشرةً،
 * وهي **`undefined` دايمًا** في الـAPK — وكيل الـJS بيتخلق بـ`registerPlugin` بس
 * (التفاصيل والدليل من كود Capacitor في `src/mobile/capPlugin.ts`).
 *
 * 🔴 **والفحص الحاسم على مصدر الأسماء مش على غياب رسالة الخطأ:** في بناء الديمو
 * `readDeviceContacts` بترجّع قايمة تجريبية مدمجة لما مفيش إضافة — يعني الشاشة
 * بتشتغل «كويس» بالأسماء الغلط والخطأ مايظهرش. فلو الاختبار اكتفى بإن الرسالة
 * مش ظاهرة كان **هيعدّي على الكود المكسور**. فالفاصل إن الاسم المعروض يبقى جايًّا
 * من **إضافة الجهاز** (اسم فريد مستحيل يكون في بيانات الديمو).
 */
const DEVICE_NAME = "جار من الجيران";

type ContactsWin = Window & { __rcPerm?: number; __rcPlugins?: Record<string, unknown> };

async function stubContacts(page: Page, permission = "granted") {
  await page.addInitScript((perm: string) => {
    const w = window as unknown as ContactsWin;
    w.__rcPerm = 0;
    w.__rcPlugins = {
      Contacts: {
        requestPermissions: async () => { w.__rcPerm = (w.__rcPerm ?? 0) + 1; return { contacts: perm }; },
        getContacts: async () => ({
          contacts: [{ name: { display: "جار من الجيران" }, phones: [{ number: "01000000001" }] }],
        }),
      },
    };
  }, permission);
  await stubCapacitor(page, ["Contacts"]);
}

const openFriends = async (page: Page) => {
  await tab(page, /الحساب|Account/);
  await page.getByRole("button", { name: /الأصدقاء|Friends/ }).first().click();
};

test("بيقرا جهات الاتصال من إضافة الجهاز مش من البيانات التجريبية", async ({ page }) => {
  await stubContacts(page);
  await openApp(page);
  await openFriends(page);

  await page.getByRole("button", { name: /موافقة ومزامنة|Allow and sync/ }).click();

  // الاسم ده مستحيل يطلع من بيانات الديمو — فظهوره معناه إن الإضافة الأصلية
  // اتنادت فعلًا، وغيابه معناه إننا رجعنا للقايمة المدمجة (الكود المكسور).
  await expect(page.getByText(DEVICE_NAME)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as ContactsWin).__rcPerm ?? 0)).toBe(1);
  expectNoPageErrors(page);
});

test("رفض الصلاحية بيقول للمستخدم يفعّلها من الإعدادات", async ({ page }) => {
  await stubContacts(page, "denied");
  await openApp(page);
  await openFriends(page);

  await page.getByRole("button", { name: /موافقة ومزامنة|Allow and sync/ }).click();
  await expect(page.getByText(/لا توجد صلاحية لجهات الاتصال/)).toBeVisible();
  // ومش رسالة «الجهاز مش بيسمح» — دي معناها إننا ما لقيناش الإضافة أصلًا
  await expect(page.getByText(/مش بيسمح بقراءة جهات الاتصال/)).toBeHidden();
  expectNoPageErrors(page);
});

test("المتصفح العادي: الرسالة الصحيحة ومفيش كسر", async ({ page }) => {
  await openApp(page); // بلا أي جسر Capacitor
  await openFriends(page);
  await page.getByRole("button", { name: /موافقة ومزامنة|Allow and sync/ }).click();
  // بناء الديمو بيرجع للقايمة المدمجة — المهم إن الشاشة مابتكسرش
  expectNoPageErrors(page);
});
