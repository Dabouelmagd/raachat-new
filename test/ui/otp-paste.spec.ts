import { expect, test } from "@playwright/test";
import { DIST, expectNoPageErrors, requireBuild } from "../helpers";

/**
 * **لصق كود التحقق** (بطلب داليا ١٣ أكتوبر): المستخدم بينسخ الكود من الإيميل
 * ويلزقه في أول خانة — لازم يتوزّع على الست خانات.
 *
 * قبل كده كان بيتحط **رقم واحد** بس (الخانة `maxLength={1}`) والباقي يضيع،
 * فالمستخدم يضطر يحفظ الكود ويكتبه رقم رقم.
 */
const open = async (page: import("@playwright/test").Page) => {
  requireBuild();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as typeof page & { rcErrors?: string[] }).rcErrors = errors;
  await page.goto("file://" + DIST);
  // «نسيت كلمة السر» هو المسار اللي مابيأكّدش تلقائي، فالخانات تفضل بانة للفحص
  await page.getByRole("button", { name: /^نسيت كلمة السر؟$|^Forgot password\?$/ }).click();
  await page.getByLabel(/^الإيميل$|^Email$/, { exact: false }).first().fill("dalia@example.com");
  await page.getByRole("button", { name: /^ابعتلي الكود$|^Send me the code$/ }).click();
  await expect(page.getByLabel(/خانة ١|Digit 1/)).toBeVisible();
};

const boxes = (page: import("@playwright/test").Page) =>
  [1, 2, 3, 4, 5, 6].map((i) => page.getByLabel(new RegExp(`خانة ${["١", "٢", "٣", "٤", "٥", "٦"][i - 1]}|Digit ${i}`)));

test("لصق الكود في أول خانة بيملا الستة", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  await b[0]!.click();
  // لصق حقيقي من الحافظة (مش كتابة)
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const dt = new DataTransfer();
    dt.setData("text", "123456");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  for (let i = 0; i < 6; i++) await expect(b[i]!).toHaveValue(String(i + 1));
  expectNoPageErrors(page);
});

test("الكود اللي فيه مسافات أو شرطة بيتنضّف", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  await b[0]!.click();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const dt = new DataTransfer();
    dt.setData("text", " 98-76 54 ");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(b[0]!).toHaveValue("9");
  await expect(b[5]!).toHaveValue("4");
  expectNoPageErrors(page);
});

test("الكود اللي بيتحط في خانة واحدة برمجيًا (autofill/مدير كلمات سر) بيتوزّع", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  await b[0]!.click();
  // `maxLength=1` بيمنع الكتابة العادية لأكتر من رقم، إنما مديري كلمات السر
  // والـ autofill بيحطّوا القيمة **برمجيًا** وبيطلّعوا حدث input — ودي الحالة
  // اللي الكود بيمسكها (فرع «أكتر من رقم» في setDigit).
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, "246813");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (const [i, v] of [..."246813"].entries()) await expect(b[i]!).toHaveValue(v);
  expectNoPageErrors(page);
});

test("اللصق من نص خانة بيكمّل اللي بعدها بس", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  await b[0]!.fill("1");
  await b[1]!.fill("2");
  await b[2]!.click();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const dt = new DataTransfer();
    dt.setData("text", "789");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(b[0]!).toHaveValue("1");
  await expect(b[1]!).toHaveValue("2");
  await expect(b[2]!).toHaveValue("7");
  await expect(b[4]!).toHaveValue("9");
  await expect(b[5]!).toHaveValue("");
  expectNoPageErrors(page);
});
