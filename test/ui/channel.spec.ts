import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * **القنوات** (آخر واحدة من اختيارات داليا).
 *
 * بيانات الديمو فيها قناة مشترك فيها (`ch1`) بمنشورات، وقنوات للاكتشاف — **عن
 * قصد**: من غيرها «القراءة بس» ومنع الرد والاشتراك مابيتجرّبوش في بناء الديمو.
 */
const open = async (page: import("@playwright/test").Page) => {
  await openApp(page);
  await clearOverlays(page);
};

const openChannel = async (page: import("@playwright/test").Page) => {
  await open(page);
  await page.getByText(/أخبار رع شات|Raa Chat News/).first().click();
  await clearOverlays(page);
};

test("فلتر «القنوات» بيعرض القنوات بس، والجروبات لأ", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: /^القنوات$|^Channels$/ }).click();
  await expect(page.getByText(/أخبار رع شات|Raa Chat News/)).toBeVisible();
  await expect(page.getByText("مجموعة الشغل 💼")).toHaveCount(0);
  expectNoPageErrors(page);
});

test("القناة للقراءة بس: مفيش صندوق كتابة ومفيش «رد»، والتفاعل موجود", async ({ page }) => {
  await openChannel(page);
  await expect(page.getByPlaceholder(/اكتب رسالة|Type a message/)).toHaveCount(0);
  await expect(page.getByText(/القناة دي للقراءة بس|read-only/)).toBeVisible();

  // قايمة خيارات الرسالة: مفيش رد ولا رد بالصوت، إنما التفاعل والنجمة موجودين
  await page.getByText(/نزلنا الاستطلاعات|Polls and pinned chats/).first().click();
  const menu = page.getByRole("dialog", { name: /خيارات الرسالة|Message options/ });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: /^رد$|^Reply$/ })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: /رد بالصوت|Reply with voice/ })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "👍" })).toBeVisible();
  await expect(menu.getByRole("button", { name: /تمييز بنجمة|Star/ })).toBeVisible();
  expectNoPageErrors(page);
});

test("معلومات القناة: عدد المشتركين بس — مفيش أسماء", async ({ page }) => {
  await openChannel(page);
  await page.getByRole("heading", { name: /أخبار رع شات|Raa Chat News/ }).click();
  await expect(page.getByText(/مشترك|subscribers/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /إلغاء الاشتراك|Unsubscribe/ })).toBeVisible();
  // مفيش أي اسم من جهات الاتصال في معلومات القناة
  await expect(page.getByText(/مريم عبد الله|Mariam Abdallah/)).toHaveCount(0);
  expectNoPageErrors(page);
});

test("الاشتراك في قناة من الاكتشاف بيضيفها لقنواتي بمنشوراتها", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: /^القنوات$|^Channels$/ }).click();
  await page.getByRole("button", { name: /اكتشف قنوات|Discover channels/ }).click();
  const row = page.locator("div.rounded-2xl").filter({ hasText: /أخبار التقنية|Tech News/ }).first();
  await row.getByRole("button", { name: /^اشترك$|^Subscribe$/ }).click();

  // بقت في «قنواتي»، ومش في الاكتشاف تاني
  await expect(page.getByRole("button", { name: /أخبار التقنية|Tech News/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^اشترك$|^Subscribe$/ }).filter({ hasText: /أخبار التقنية/ })).toHaveCount(0);

  await page.getByRole("button", { name: /أخبار التقنية|Tech News/ }).first().click();
  await expect(page.getByText(/أهلًا بيكم في القناة|Welcome to the channel/)).toBeVisible();
  await expect(page.getByPlaceholder(/اكتب رسالة|Type a message/)).toHaveCount(0);
  expectNoPageErrors(page);
});

test("إنشاء قناة: صاحبها بينشر فيها", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: /^القنوات$|^Channels$/ }).click();
  await page.getByRole("button", { name: /اكتشف قنوات|Discover channels/ }).click();
  await page.getByRole("button", { name: /قناة جديدة|New channel/ }).click();
  await page.getByLabel(/اسم القناة|Channel name/).fill("قناة الاختبار");
  await page.getByLabel(/وصف القناة|Channel description/).fill("وصف الاختبار");
  await page.getByRole("button", { name: /أنشئ القناة|Create channel/ }).click();

  // بتفتح على طول، وفيها صندوق كتابة لأني صاحبها
  await expect(page.getByRole("heading", { name: "قناة الاختبار" })).toBeVisible();
  const box = page.getByPlaceholder(/اكتب رسالة|Type a message/);
  await expect(box).toBeVisible();
  await box.fill("أول منشور في القناة");
  await page.getByRole("button", { name: /^إرسال$|^Send$/ }).click();
  await expect(page.getByText("أول منشور في القناة")).toBeVisible();
  expectNoPageErrors(page);
});
