import { expect, test } from "@playwright/test";
import { legalUrl } from "../helpers.js";

/**
 * الصفحات القانونية: الكلام اللي بيتقال للعميل لازم يطابق اللي التطبيق بيعمله فعلًا.
 * الاختبار ده بيحمي من إن حد يعدّل سلوك السن في الكود وينسى النصوص (أو العكس).
 */
const pages = [
  { file: "privacy", label: "سياسة الخصوصية" },
  { file: "terms", label: "شروط الاستخدام" },
];

for (const p of pages) {
  test.describe(p.label, () => {
    test.beforeEach(async ({ page }) => { await page.goto(legalUrl(p.file)); });

    test("بتقول إن التطبيق للبالغين ١٨+ بالعربي والإنجليزي", async ({ page }) => {
      const body = page.locator("body");
      await expect(body).toContainText(/للبالغين/);
      await expect(body).toContainText(/18 and over|adults/);
      // صياغة «مفتوح لكل الأعمار» اتشالت بقرار الـ ١٨+ (١٣ أكتوبر ٢٠٢٦) — ولو رجعت
      // تبقى الصفحات بتقول للعميل حاجة والتطبيق والمتاجر بيقولوا حاجة تانية
      await expect(body).not.toContainText("مفتوح لكل الأعمار");
      await expect(body).not.toContainText("open to all ages");
    });

    test("بتقول إن تاريخ الميلاد مطلوب لإنشاء الحساب وإنه إقرار مش مستند", async ({ page }) => {
      const body = page.locator("body");
      await expect(body).toContainText(/تاريخ الميلاد|تاريخ ميلادك/);
      await expect(body).toContainText(/إقرار/);          // مش تحقق هوية
      await expect(body).toContainText(/self-declaration/);
    });

    test("بتوضّح حدود المحفظة لحد ٢١ وتنبيه المسوّدة", async ({ page }) => {
      await expect(page.locator("body")).toContainText("٢١");
      await expect(page.locator("#draft")).toBeVisible();
    });

    test("النسختين العربية والإنجليزية موجودين ومفيش تمدد أفقي على الموبايل", async ({ page }) => {
      await expect(page.locator("h1")).toHaveCount(2);
      await expect(page.locator("div.en")).toBeVisible();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
      expect(fits, "الصفحة بتتمدّد أفقيًا على شاشة الموبايل").toBe(true);
    });
  });
}

test("سياسة الخصوصية بتوصّف حفظ أحداث إعلانات الحسابات غير محدَّدة السن", async ({ page }) => {
  await page.goto(legalUrl("privacy"));
  const body = page.locator("body");
  await expect(body).toContainText("أحداث الإعلانات");
  await expect(body).toContainText("يومان");
  await expect(body).toContainText("المراقبة السلوكية");
  await expect(body).toContainText(/وليّ? الأمر/); // بشدّة أو بدونها
  // الحسابات اللي قبل ١٣ أكتوبر سنّها غير محدَّد — ودي سبب مدة اليومين
  await expect(body).toContainText(/غير محدَّدة السن|غير محدَّد/);
});

/**
 * مراجعة المحامي (١٤ أكتوبر ٢٠٢٦): التصنيف العمري ١٨+ عند بلاي بيترفض لو
 * السياسة فيها **أي** فقرة توحي بوجود قاصرين متوقَّعين (IARC). فجدول الاحتفاظ
 * مابقاش يقول «من يثبت أنه دون ١٨» — القاصر لو اتكشف **بيتقفل حسابه وتتمسح
 * بياناته فورًا**، مش بتتحفظ له أحداث إعلانات يومين.
 */
test("السياسة مابتوحيش بوجود قاصرين متوقَّعين، والمسح فوري", async ({ page }) => {
  await page.goto(legalUrl("privacy"));
  const body = page.locator("body");
  await expect(body).not.toContainText("أو من يثبت أنه دون ١٨");
  await expect(body).not.toContainText("or found to be under 18");
  await expect(body).toContainText(/فورًا ودون انتظار طلب/);
  await expect(body).toContainText(/immediately, without waiting for a request/);
});

/**
 * شرط جوجل: Play Billing **حصرًا** لأي شراء رقمي داخل التطبيق، والدفع الخارجي
 * لفواتير العالم الحقيقي بس. البند ٧ كان بيقول «دفع فواتير عبر شريك دفع» من غير
 * التفرقة دي — وهي اللي بتتقاس عليها الموافقة.
 */
test("الشروط بتفرّق بين فواتير العالم الحقيقي والمشتريات الرقمية", async ({ page }) => {
  await page.goto(legalUrl("terms"));
  const body = page.locator("body");
  await expect(body).toContainText(/العالم الحقيقي/);
  await expect(body).toContainText("Google Play Billing");
  await expect(body).toContainText(/In-App Purchase/);
  await expect(body).toContainText(/real-world/);
});

test("معايير المجتمع فيها بند CSAE صريح وجهة اتصال لسلامة الأطفال", async ({ page }) => {
  await page.goto(legalUrl("community"));
  const body = page.locator("body");
  // بلاي بتطلب حظرًا **صريحًا** — «أي محتوى يمسّ القُصَّر» مكانش كفاية
  await expect(body).toContainText(/الاعتداء الجنسي على الأطفال واستغلالهم/);
  await expect(body).toContainText(/Child sexual abuse and exploitation/);
  await expect(body).toContainText(/مسؤولًا لسلامة الأطفال|مسؤول سلامة الأطفال/);
  await expect(body).toContainText(/child safety contact/);
  await expect(page.locator("#draft")).toBeVisible(); // لسه مسوّدة لحد المحامي
});

/**
 * **مسار التبليغ لازم يسمّي قناة فعلية — بلاي بتطلب الجهة بالاسم في الإقرار.**
 * «يُبلَّغ الأمر إلى الجهات المختصة» كلام صحيح ومابيقولش حاجة: المستخدم مايعرف
 * مين، والإقرار بيبقى ناقص. فالفحص على **رقم/اسم قناة حقيقية** مش على وجود
 * كلمة «الجهات المختصة» — دي بتعدّي على النصّ القديم بالظبط.
 *
 * **وعن قصد مفيش ذكر لـNCMEC هنا:** التبليغ له اختياري للشركات غير الأمريكية
 * ومحتاج تسجيل كـESP — وتسمية قناة في صفحة منشورة **وعد**. فلو اتكتبت قبل
 * التسجيل تبقى نفس عطل «نمحو بياناته فورًا» بلا آلية. تتضاف **بعد** التسجيل.
 * أمّا الجهات المصرية فمفيش لها شرط مسبق: ١٦٠٠٠ خط عام، والشكوى حق لأي حد.
 */
test("معايير المجتمع بتسمّي جهة التبليغ المصرية بقناة فعلية", async ({ page }) => {
  await page.goto(legalUrl("community"));
  const body = page.locator("body");
  // القناة بالرقم — بالأرقام العربية-الهندية في النسخة العربية والغربية في الإنجليزية
  await expect(body).toContainText(/خط نجدة الطفل ١٦٠٠٠/);
  await expect(body).toContainText(/Child Helpline 16000/);
  // والجهة اللي بتديرها، والمسار الجنائي
  // ⚠️ على الجذر مش بالتعريف: النصّ «التابع **للمجلس**» = ل+ل+مجلس، فمافيهوش
  // «المجلس» خالص — وأي سابقة عربية (ال/لل/بال/وال) بتكسر مطابقة حرفية.
  await expect(body).toContainText(/مجلس القومي للطفولة والأمومة/);
  await expect(body).toContainText(/National Council for Childhood and Motherhood/);
  await expect(body).toContainText(/النيابة العامة/);
  await expect(body).toContainText(/Public Prosecution/);
});

/**
 * **بريد مسؤول سلامة الأطفال لازم يكون بريدًا حقيقيًا قابلًا للنقر.**
 * بلاي بتطلب جهة اتصال معيَّنة لسلامة الأطفال، و«عيّنّا مسؤولًا» فوق بريد
 * بين أقواس (`[child-safety@]`) = إقرار غير صحيح في نموذج الرفع: الصفحة
 * بتقول إن فيه مسؤول وطريقة الوصول له مش موجودة.
 *
 * والفحص على **الـ mailto نفسه** مش على نصّ الصفحة: `[بريد مسؤول سلامة
 * الأطفال]` كان نصًّا جوه `<a href="mailto:[child-safety@]">`، فأي فحص على
 * «فيه كلمة بريد» كان بيعدّي وهو placeholder.
 */
test("بريد سلامة الأطفال بريد حقيقي — مفيش خانة فاضية في الصفحة", async ({ page }) => {
  await page.goto(legalUrl("community"));

  // كل `mailto:` في الصفحة لازم يكون بريدًا صالحًا — مش `mailto:[child-safety@]`
  const hrefs = await page
    .locator('a[href^="mailto:"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
  expect(hrefs.length, "مفيش ولا بريد في الصفحة").toBeGreaterThan(1);
  for (const h of hrefs) {
    expect(h, `mailto لسه خانة فاضية: ${h}`).toMatch(/^mailto:[^[\]\s@]+@[^[\]\s@]+\.[a-z]{2,}$/i);
  }

  // ومفيش أي خانة `[...]` فاضلة في نصّ الصفحة
  const text = await page.locator("main").innerText();
  expect(text, "لسه فيه خانة فاضية في معايير المجتمع").not.toMatch(/\[[^\]\n]{2,60}\]/);

  // ونسختا الصفحة لازم يبقى عليهما **نفس** رقم الإصدار — الإنجليزية كانت
  // فاضلة على ٢٫٠ بعد ما البند الجديد اتضاف للنسختين.
  const ver = text.match(/Version (\d+)\.(\d+)/);
  expect(ver, "رقم إصدار النسخة الإنجليزية مش موجود").toBeTruthy();
  // الأرقام العربية-الهندية والفاصلة العربية (٫) — مش نفس محارف الإنجليزي
  const ar = (s: string) => s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const arVer = `الإصدار ${ar(ver![1])}٫${ar(ver![2])}`;
  expect(text, `الإصدار العربي مش مطابق للإنجليزي (${ver![0]} ← ${arVer})`).toContain(arVer);
});

/**
 * 🔴 **مذكرة المحامي ٢٨ أكتوبر ٢٠٢٦ — ما وافق عليه صراحةً، مكتوبًا كحارس.**
 *
 * وصل رد المحامي على مذكرتنا فوافق على ثلاث صياغات بعينها. والسبب في تثبيتها
 * هنا أن أيًّا منها لو ارتدّت لا يظهر أثرها في أي شاشة ولا في أي اختبار آخر:
 * الصفحة تُقرأ مرة واحدة عند الرفع للمتجر، والتراجع الصامت فيها يصل للعميل.
 */
test.describe("مذكرة المحامي (٢٨ أكتوبر ٢٠٢٦)", () => {
  test("🔴 المكالمات مشفّرة من طرف إلى طرف، والرسائل النصية لا — مفصولتان بوضوح", async ({ page }) => {
    await page.goto(legalUrl("privacy"));
    const body = page.locator("body");

    // الشقّ الذي كان ناقصًا: النصّ كان ينفي التشفير عن «المحادثات» عمومًا، وهو
    // دقيق للرسائل ويبخس حقّ المكالمات — والمحامي: «موافق وموصى به بشدة».
    await expect(body).toContainText(/المكالمات الصوتية والمرئية مشفّرة تمامًا من طرف إلى طرف/);
    await expect(body).toContainText(/لا تمر على خوادم الشركة/);
    await expect(body).toContainText(/Voice and video calls are fully end-to-end encrypted/);

    // والشقّ الذي لا يجوز أن يسقط مع التعديل: الرسائل النصية **ليست** مشفّرة
    // طرفًا لطرف. إسقاطه يحوّل الفقرة إلى ادعاء أمان عام يتصرّف المستخدم بناءً عليه.
    await expect(body).toContainText(/الرسائل النصية ليست مشفّرة من طرف إلى طرف/);
    await expect(body).toContainText(/Text messages are not end-to-end encrypted/);
  });

  test("🔴 سجل أدلة بلاغات إيذاء الأطفال مُفصَح عنه، وله سقف ثلاث سنوات", async ({ page }) => {
    await page.goto(legalUrl("privacy"));
    const text = await page.locator("body").innerText();

    // كان غير مذكور في السياسة **ولا مرة** رغم أنه يحوز محتوى مبلَّغًا عنه.
    expect(text, "سجل الأدلة لازم يكون مُفصَحًا عنه بسنده القانوني").toMatch(/أدلة بلاغات إيذاء الأطفال/);
    expect(text).toMatch(/AES-256/);
    expect(text).toMatch(/المصلحة المشروعة وحماية النظام العام/);
    expect(text).toMatch(/Child-safety report evidence/);

    // والسقف: كان الاحتفاظ **بلا مدة** (للأبد)، وهو نفسه مخالف — والمحامي حدّ ٣ سنوات.
    expect(text, "جدول الاحتفاظ لازم يذكر سقف الثلاث سنوات").toMatch(/ثلاث سنوات كحد أقصى/);
    expect(text).toMatch(/3 years maximum/);
  });

  test("🔴 عبارة زمن الاستجابة بلا أي رقم — رقم منشور = التزام تعاقدي ملزم", async ({ page }) => {
    await page.goto(legalUrl("community"));
    const text = await page.locator("body").innerText();

    await expect(page.locator("body")).toContainText(
      /نعمل على مراجعة البلاغات والرد عليها في أقرب وقت ممكن، وفقًا لأولوية البلاغ وحجم البلاغات الواردة/,
    );

    // 🔴 والحارس الحقيقي هو المنع: «لا تقم بنشر رقم زمني محدد أبدًا». ومهلة
    // الاعتراض (٣٠ يومًا) مهلة **للمستخدم** لا وعد منّا، فهي خارج النمط عمدًا.
    expect(text, "مفيش رقم زمني للرد — ده التزام تعاقدي").not.toMatch(
      /(نرد|الرد|نراجع|المراجعة)[^.\n]{0,20}خلال[^.\n]{0,12}[٠-٩0-9]/,
    );
    expect(text).not.toMatch(/within \d+ (hours?|business days?)/i);
  });

  test("المصطلحات موحَّدة: «المجموعات» و«القصص» في الصفحات العربية", async ({ page }) => {
    for (const f of ["privacy", "terms", "community"]) {
      await page.goto(legalUrl(f));
      const text = await page.locator("body").innerText();
      // النسخة الإنجليزية تُبقي Stories/groups لأن واجهة التطبيق الإنجليزية كذلك،
      // فالفحص على المصطلح العربي وحده: «الجروبات» و«الـ Stories» اختفتا.
      expect(text, `«جروب» لسه في ${f}`).not.toMatch(/جروب/);
      expect(text, `«الـ Stories» لسه في ${f}`).not.toMatch(/الـ\s*Stories/);
    }
  });
});
