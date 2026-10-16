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

/**
 * بنبعت الحدث على **الخانة نفسها** مش على `document.activeElement`: الكتابة في
 * خانة بتنقّل التركيز للي بعدها، فالاعتماد على التركيز بيعمل تسابق (الاختبار سقط
 * مرة واحدة تحت الحمل وهو عدّى لوحده). وده مطابق للكود: `onPaste`/`onChange`
 * مربوطين بفهرس الخانة، مش بالتركيز.
 */
const pasteInto = (box: import("@playwright/test").Locator, text: string) =>
  box.evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData("text", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);

test("لصق الكود في أول خانة بيملا الستة", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  // لصق حقيقي من الحافظة (مش كتابة)
  await pasteInto(b[0]!, "123456");
  for (let i = 0; i < 6; i++) await expect(b[i]!).toHaveValue(String(i + 1));
  expectNoPageErrors(page);
});

test("الكود اللي فيه مسافات أو شرطة بيتنضّف", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  await pasteInto(b[0]!, " 98-76 54 ");
  await expect(b[0]!).toHaveValue("9");
  await expect(b[5]!).toHaveValue("4");
  expectNoPageErrors(page);
});

test("الكود اللي بيتحط في خانة واحدة برمجيًا (autofill/مدير كلمات سر) بيتوزّع", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  // `maxLength=1` بيمنع الكتابة العادية لأكتر من رقم، إنما مديري كلمات السر
  // والـ autofill بيحطّوا القيمة **برمجيًا** وبيطلّعوا حدث input — ودي الحالة
  // اللي الكود بيمسكها (فرع «أكتر من رقم» في setDigit).
  await b[0]!.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, "246813");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (const [i, v] of [..."246813"].entries()) await expect(b[i]!).toHaveValue(v);
  expectNoPageErrors(page);
});

/**
 * **الخانات الستة بتتملا في نفس اللحظة** — مدير كلمات سر أو كيبورد موبايل
 * بيحطّ الكود موزّعًا على الحقول الستة في نفس الـ task، ومحدش بيستنى React
 * يعيد الرسم بين حقل وحقل.
 *
 * **حارس مش دليل — بيعدّي على الكود القديم كمان.** كانت فرضيتي الأولى لسبب
 * التذبذب إن `setDigit`/`fillFrom` بيبنوا المصفوفة من `digits` بتاعة الـ render
 * (`const next = [...digits]`)، فالنداءات المتلاحقة تشوف نفس الحالة القديمة
 * واللي يكتب الأخير يمسح اللي قبله. **والفرضية طلعت غلط:** React 18 بيفرّغ
 * أحداث `input` (discrete) **بالتزامن** بعد كل حدث، فكل معالج بيشوف حالة
 * جديدة ومفيش رقم بيضيع. السبب الحقيقي كان حاجة تانية خالص (شوف الاختبار اللي
 * بعده).
 *
 * فالاختبار فاضل لأنه بيثبّت السلوك ده: لو حد غيّر الحالة لتحديث مؤجّل
 * (`startTransition` أو تجميع يدوي) الأرقام تبدأ تضيع فعلًا وده بيكشفه.
 */
test("ملء الخانات الستة في نفس اللحظة مابيضيّعش ولا رقم", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const els = [...document.querySelectorAll<HTMLInputElement>('input[autocomplete="one-time-code"]')];
    [..."135790"].forEach((d, i) => {
      setter.call(els[i]!, d);
      els[i]!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  for (const [i, v] of [..."135790"].entries()) await expect(b[i]!).toHaveValue(v);
  expectNoPageErrors(page);
});

/**
 * **مفيش مؤقّت بيسرق التركيز بعد ما خطوة الكود تفتح.**
 *
 * `sendCode` كان بيعمل `setTimeout(() => refs.current[0]?.focus(), 50)` عشان
 * الخانة لسه ما اترسمتش وقت النداء. وتحت أي بطء المؤقّت بيولع **بعد** ما
 * المستخدم يبدأ يكتب، فالرقم ينزل في الخانة الأولى ويمسح اللي فيها — في سكوت.
 *
 * ودي كانت سبب تذبذب اختبارين (`اللصق من نص خانة` هنا و«نسيت كلمة السر» في
 * `auth.spec.ts`) لأيام من غير ما نعرف السبب. اتعاد إنتاجها ١ من ١٢٠ تشغيلة
 * تحت حمل، والصورة طلعت **«خانة ١ فيها رقم خانة ٢»** وخانة ٢ فاضية ومركَّز
 * عليها — يعني الكتابة نزلت في خانة تانية خالص.
 *
 * **وإزاي بنفحصها حتميًا: بنجمّد الوقت ونقلب السؤال.** محاولة «نسابق المؤقّت
 * ونشوف هو سرق التركيز ولا لأ» كشفت العطل **٢ من ١٠** بس — لأن اللي بيحدد
 * النتيجة هو هل الضغطة لحقت قبل الـ ٥٠ms ولا بعدها. فبدل كده: مع ساعة مجمّدة
 * (`page.clock.install` بلا `fastForward`) أي تركيز **بمؤقّت مستحيل يحصل
 * خالص**، أما التركيز بـ `useEffect` فبيحصل مع الـ commit. فالتأكيد إن الخانة
 * الأولى مركَّزة والوقت واقف = إثبات إن التركيز مش معلّق على مؤقّت. والسقوط
 * على الكود القديم **١٠٠٪** (اتأكد على ١٠ تشغيلات).
 */
test("خانة الكود الأولى بتتركّز من غير أي مؤقّت", async ({ page }) => {
  requireBuild();
  // بنسجّل الأخطاء بنفسنا: `expectNoPageErrors` بتقرا `rcErrors` اللي `open()`
  // بتحطّها، ومن غير التسجيل ده الفحص بيعدّي على قايمة فاضية بلا معنى.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as typeof page & { rcErrors?: string[] }).rcErrors = errors;
  // **`install()` لوحدها مش بتجمّد الوقت** — بتزيّف المؤقّتات وهي لسه ماشية،
  // فالمؤقّت بيولع جوه الـ ١٠ ثواني اللي التأكيد بيستناها والفحص يعدّي على كود
  // مكسور (حصل فعلًا). `pauseAt` هي اللي بتوقّف الوقت فعلًا.
  const T = new Date("2026-10-16T12:00:00Z");
  await page.clock.install({ time: T });
  await page.clock.pauseAt(T);
  await page.goto("file://" + DIST);
  await page.getByRole("button", { name: /^نسيت كلمة السر؟$|^Forgot password\?$/ }).click();
  await page.getByLabel(/^الإيميل$|^Email$/, { exact: false }).first().fill("dalia@example.com");
  await page.getByRole("button", { name: /^ابعتلي الكود$|^Send me the code$/ }).click();

  const b = boxes(page);
  await expect(b[0]!).toBeVisible();
  await expect(b[0]!, "الخانة الأولى مش مركَّزة والوقت واقف — يعني التركيز معلّق على مؤقّت، والمؤقّت ده بيسرق التركيز من المستخدم لو ولع وهو بيكتب").toBeFocused();
  expectNoPageErrors(page);
});

test("اللصق من نص خانة بيكمّل اللي بعدها بس", async ({ page }) => {
  await open(page);
  const b = boxes(page);
  await b[0]!.fill("1");
  await expect(b[0]!).toHaveValue("1");
  await b[1]!.fill("2");
  await expect(b[1]!).toHaveValue("2");
  await pasteInto(b[2]!, "789");
  await expect(b[0]!).toHaveValue("1");
  await expect(b[1]!).toHaveValue("2");
  await expect(b[2]!).toHaveValue("7");
  await expect(b[4]!).toHaveValue("9");
  await expect(b[5]!).toHaveValue("");
  expectNoPageErrors(page);
});
