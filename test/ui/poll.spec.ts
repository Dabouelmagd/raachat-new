import { expect, test } from "@playwright/test";
import { clearOverlays, expectNoPageErrors, openApp } from "../helpers";

/**
 * **الاستطلاعات** (بطلب داليا: الاستطلاعات · القنوات · التثبيت · الرد بالصوت).
 *
 * بيانات الديمو فيها استطلاعين في «مجموعة الشغل» **عن قصد**: واحد من حساب تاني
 * وفيه أصوات (عشان النِّسب و«مَن صوّت» يبانوا)، وواحد مني (عشان زرار القفل).
 * من غير الأصوات دي الاختبار مابيشوفش الحالات الحقيقية.
 */
const openWork = async (page: import("@playwright/test").Page) => {
  await openApp(page);
  await clearOverlays(page);
  await page.getByText(/مجموعة الشغل|Work Group/).first().click();
  await clearOverlays(page);
};

const poll = (page: import("@playwright/test").Page, q: RegExp) =>
  page.locator("div").filter({ has: page.getByText(q) }).last();

test("الاستطلاع بيظهر بسؤاله واختياراته والنِّسب", async ({ page }) => {
  await openWork(page);
  await expect(page.getByText(/نعمل اجتماع الفريق إمتى؟|When should we hold/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^الأحد الصبح$|^Sunday morning$/ })).toBeVisible();
  // ٣ أصوات: واحد للأحد الصبح (٣٣٪) واتنين للاتنين الصبح (٦٧٪)
  await expect(page.getByText(/٣ صوّتوا|3 voted/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^الاتنين الصبح$|^Monday morning$/ })).toContainText(/٦٧|67/);
  expectNoPageErrors(page);
});

test("التصويت بيتسجّل، والإجابة الواحدة بتستبدل اللي قبلها", async ({ page }) => {
  await openWork(page);
  const a = page.getByRole("button", { name: /^الأحد الصبح$|^Sunday morning$/ });
  const b = page.getByRole("button", { name: /^الاتنين الصبح$|^Monday morning$/ });
  await expect(a).toHaveAttribute("aria-pressed", "false");

  await a.click();
  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/٤ صوّتوا|4 voted/)).toBeVisible();

  // اختيار تاني في استطلاع «إجابة واحدة» = استبدال، مش صوتين
  await b.click();
  await expect(a).toHaveAttribute("aria-pressed", "false");
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/٤ صوّتوا|4 voted/)).toBeVisible();
  expectNoPageErrors(page);
});

test("الاستطلاع المتعدد بيقبل أكتر من إجابة", async ({ page }) => {
  await openWork(page);
  const k = page.getByRole("button", { name: /^كشري$|^Koshari$/ });
  const f = page.getByRole("button", { name: /^فراخ مشوية$|^Grilled chicken$/ });
  await k.click();
  await f.click();
  await expect(k).toHaveAttribute("aria-pressed", "true");
  await expect(f).toHaveAttribute("aria-pressed", "true");
  expectNoPageErrors(page);
});

test("القفل لصاحب الاستطلاع بس، وبعده مفيش تصويت", async ({ page }) => {
  await openWork(page);
  // الاستطلاع اللي من حساب تاني مالوش زرار قفل عندي، واللي مني عنده واحد
  await expect(page.getByRole("button", { name: /أغلِق الاستطلاع|Close poll/ })).toHaveCount(1);
  await page.getByRole("button", { name: /أغلِق الاستطلاع|Close poll/ }).click();
  await expect(page.getByText(/أُغلِق|Closed/).first()).toBeVisible();
  const k = page.getByRole("button", { name: /^كشري$|^Koshari$/ });
  await expect(k).toBeDisabled();
  expectNoPageErrors(page);
});

test("«مَن صوّت» بيعرض الأسماء ويخفيها", async ({ page }) => {
  await openWork(page);
  const see = page.getByRole("button", { name: /مَن صوّت|See votes/ }).first();
  await see.click();
  await expect(page.getByText(/مريم عبد الله|Mariam Abdallah/).last()).toBeVisible();
  await page.getByRole("button", { name: /إخفاء الأصوات|Hide votes/ }).first().click();
  await expect(page.getByRole("button", { name: /مَن صوّت|See votes/ }).first()).toBeVisible();
  expectNoPageErrors(page);
});

test("إنشاء استطلاع: محتاج سؤال واختيارين، ومش بيقبل اختيارين متشابهين", async ({ page }) => {
  await openWork(page);
  await page.getByRole("button", { name: /إرفاق ملف|Attach/ }).click();
  await page.getByRole("button", { name: /^استطلاع$|^Poll$/ }).click();
  const sheet = page.getByRole("dialog", { name: /استطلاع جديد|New poll/ });
  const send = sheet.getByRole("button", { name: /أرسِل الاستطلاع|Send poll/ });
  await expect(send).toBeDisabled();

  await sheet.getByLabel(/^السؤال$|^Question$/).fill("نسافر فين؟");
  await sheet.getByLabel(/اختيار ١|Option 1/).fill("أسوان");
  await sheet.getByLabel(/اختيار ٢|Option 2/).fill("أسوان");
  await expect(send).toBeDisabled(); // اختيارين بنفس الكلام
  await sheet.getByLabel(/اختيار ٢|Option 2/).fill("الأقصر");
  await expect(send).toBeEnabled();

  await send.click();
  await expect(page.getByText("نسافر فين؟")).toBeVisible();
  await expect(page.getByRole("button", { name: /^الأقصر$/ })).toBeVisible();
  expectNoPageErrors(page);
});

/**
 * **الأصوات المخفية** (قرار داليا ١٦ أكتوبر ٢٠٢٦): صاحب الاستطلاع يختار وقت
 * الإنشاء. وبيانات الديمو فيها استطلاع مخفي (`m12`) **عن قصد** — من غيره
 * الحالة دي مابتظهرش في بناء الديمو ولا بتتجرّب.
 *
 * ملحوظة على حدود الاختبار: الإخفاء الحقيقي في **السيرفر** (`voterIds`
 * مابتخرجش خالص)، ومتفحوص في `server/test/poll.test.ts` على نص الرد. اللي
 * هنا هو الوش التاني: إن الواجهة مابتعرضش أسماء ولا زرار «مَن صوّت»، وإن
 * القاعدة بتتقال للمستخدم **قبل** ما يصوّت.
 */
const HIDDEN = /تفضّلوا الاجتماع أونلاين|Do you prefer the meeting/;

test("المخفي: أرقام بلا أسماء، ومفيش زرار «مَن صوّت»", async ({ page }) => {
  await openWork(page);
  await expect(page.getByText(HIDDEN)).toBeVisible();
  const card = poll(page, HIDDEN);
  // ٥ أصوات (٤ + ١) واختيار واحد → العدد ده هو عدد الناس بالظبط
  await expect(card.getByText(/٥ صوّتوا|5 voted/)).toBeVisible();
  await expect(card.getByRole("button", { name: /^أونلاين$|^Online$/ })).toContainText(/٨٠|80/);
  // مفيش طريق لأي أسماء
  await expect(card.getByRole("button", { name: /مَن صوّت|See votes/ })).toHaveCount(0);
  expectNoPageErrors(page);
});

test("القاعدة بتتقال قبل التصويت في الحالتين", async ({ page }) => {
  await openWork(page);
  await expect(poll(page, HIDDEN).getByText(/الأصوات مخفية عن الأعضاء|Votes hidden from members/)).toBeVisible();
  await expect(poll(page, /نعمل اجتماع الفريق إمتى؟|When should we hold/).getByText(/يرى الأعضاء مَن صوّت|Members can see who voted/)).toBeVisible();
  expectNoPageErrors(page);
});

test("التصويت في المخفي بيزوّد العدد وبيحطّ ✓", async ({ page }) => {
  await openWork(page);
  const card = poll(page, HIDDEN);
  const office = card.getByRole("button", { name: /^في المكتب$|^At the office$/ });
  const online = card.getByRole("button", { name: /^أونلاين$|^Online$/ });
  // صوتي الحالي على «أونلاين» (من بيانات الديمو) — بيبان من غير أي أسماء
  await expect(online).toHaveAttribute("aria-pressed", "true");

  await office.click();
  await expect(office).toHaveAttribute("aria-pressed", "true");
  await expect(online).toHaveAttribute("aria-pressed", "false");
  // اختيار واحد = استبدال: العدد الكلي ما يزيدش
  await expect(card.getByText(/٥ صوّتوا|5 voted/)).toBeVisible();
  await expect(card.getByRole("button", { name: /مَن صوّت|See votes/ })).toHaveCount(0);
  expectNoPageErrors(page);
});

test("شيت الإنشاء فيه مفتاح إخفاء الأصوات، والافتراضي علني", async ({ page }) => {
  await openWork(page);
  await page.getByRole("button", { name: /إرفاق ملف|Attach/ }).click();
  await page.getByRole("button", { name: /^استطلاع$|^Poll$/ }).click();
  const sheet = page.getByRole("dialog", { name: /استطلاع جديد|New poll/ });
  const sw = sheet.getByRole("switch", { name: /الأصوات مخفية عن الأعضاء|Hide votes from members/ });
  await expect(sw).toHaveAttribute("aria-checked", "false"); // علني افتراضيًا زي القديم

  await sheet.getByLabel(/^السؤال$|^Question$/).fill("نعمل الحفلة فين؟");
  await sheet.getByLabel(/اختيار ١|Option 1/).fill("النادي");
  await sheet.getByLabel(/اختيار ٢|Option 2/).fill("البيت");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("button", { name: /أرسِل الاستطلاع|Send poll/ }).click();

  const made = poll(page, /نعمل الحفلة فين؟/);
  await expect(made.getByText(/الأصوات مخفية عن الأعضاء|Votes hidden from members/)).toBeVisible();
  await expect(made.getByText(/لم يصوّت أحد بعد|No votes yet/)).toBeVisible();
  expectNoPageErrors(page);
});
