import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { firstPublicOrigin } from "../src/lib/senders.js";

/**
 * حوارس على بناء الـ APK. السبب إن الأعطال هنا **صامتة**: الـ APK يتبني ويتنزّل
 * ويتثبّت، وبعدين يطلع تطبيق ديمو مابيكلّمش السيرفر — أو مفيش صلاحية جهات اتصال
 * فالميزة اللي عايزين نجرّبها هي بالظبط اللي مش هتشتغل.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("بناء الـ APK", () => {
  const wf = () => read(".github/workflows/android.yml");

  /**
   * **أهم حارس.** بناء الواجهة بلا `VITE_API_URL` بيطلّع **بناء الديمو** اللي
   * مابيعملش ولا نداء شبكة — فالـ APK يتثبّت ويفتح ويشتغل بالبيانات التجريبية،
   * ومحدش ياخد باله إن السيرفر مش متصل أصلًا. (نفس درس api-mode في CI.)
   */
  it("بيبني الواجهة بوضع الـ API مش الديمو", () => {
    const s = wf();
    expect(s).toContain("VITE_API_URL");
    expect(s, "لازم يفشل لو العنوان فاضي بدل ما يطلّع بناء ديمو").toContain('test -n "$VITE_API_URL"');
  });

  it("بينسخ الواجهة جوه المشروع وبيتأكد إنها وصلت", () => {
    const s = wf();
    expect(s).toContain("cap sync android");
    expect(s, "فحص إيجابي إن ملفات الواجهة دخلت الـ APK").toContain(
      "android/app/src/main/assets/public/index.html",
    );
  });

  /** `|| true` أو رفع artifact بلا فحص = ملف فاضي بيتنزّل وتتصرف عليه ساعة */
  it("بيفحص الناتج قبل ما يرفعه", () => {
    const s = wf();
    expect(s).toContain("app-debug.apk");
    expect(s, "حجم معقول — أقل من ميجا معناه بناء فاضي").toContain('test "$SIZE" -gt 1000000');
    expect(s, "والواجهة لازم تكون جوه الأرشيف فعلًا").toContain("unzip -l");
    // الحكم على الأوامر بعد شيل التعليقات: تعليق بيشرح **ليه** مفيش `|| true`
    // لازم يذكرها، وهو مش بيخفي أي فشل. نفس درس حارس `Capacitor.Plugins`،
    // اللي سقط على الملفين المتصلّحين لأن تعليقاتهم بتسمّي العطل.
    const commands = s.replace(/^\s*#.*$/gm, "");
    expect(commands, "`|| true` بيبلع الفشل فالوظيفة تخلص خضرا بناتج مكسور").not.toMatch(/\|\|\s*true/);
  });

  it("مابيتشغّلش على كل commit توثيق", () => {
    const s = wf();
    expect(s).toContain("paths:");
    expect(s).toContain("workflow_dispatch");
  });

  /** الـ placeholder في المتجر = اسم حزمة غلط **مابيتغيّرش بعد النشر** */
  it("appId اسم حقيقي مش placeholder", () => {
    const cfg = read("mobile/capacitor.config.ts");
    expect(cfg).not.toContain("YOURCOMPANY");
    expect(cfg).toMatch(/appId:\s*"[a-z][a-z0-9.]*\.[a-z][a-z0-9]*"/);
  });

  /**
   * 🔴 **الـ APK بياخد اسم الحزمة من `build.gradle` مش من `capacitor.config.ts`.**
   *
   * `cap sync` بينسخ بناء الواجهة والإضافات بس — **مابيعيدش تسمية حزمة
   * أندرويد**؛ الاسم بيتحدّد مرة واحدة وقت `cap add android` ويفضل. فحصل
   * فعلًا (اتكشف ١٨ أكتوبر ٢٠٢٦) إن `capacitor.config.ts` اتغيّر لـ
   * `com.datalifeai.raachat` والمشروع كله فاضل على `com.YOURCOMPANY.raachat`
   * — والحارس القديم كان بيقرا الملف اللي اتغيّر بس فعدّى، والـ APK
   * المثبَّت على الجهاز اسم حزمته placeholder.
   *
   * واسم الحزمة **مابيتغيّرش بعد أول رفع للمتجر**، فالفحص لازم يبقى على
   * الملفات اللي البناء بيقراها فعلًا.
   */
  it("🔴 اسم الحزمة في ملفات البناء نفسها مطابق لـ capacitor.config", () => {
    const appId = /appId:\s*"([^"]+)"/.exec(read("mobile/capacitor.config.ts"))?.[1];
    expect(appId, "مفيش appId").toBeTruthy();
    // ملحوظة: `assets/capacitor.config.json` **متجاهل في git** (بيتولّد من
    // `cap sync` في كل بناء) — فمش في القايمة، وإلا الاختبار يسقط في الـCI
    // على ملف مش موجود أصلًا.
    const files = [
      "mobile/android/app/build.gradle",
      "mobile/android/app/src/main/res/values/strings.xml",
      `mobile/android/app/src/main/java/${appId!.replace(/\./g, "/")}/MainActivity.java`,
    ];
    for (const f of files) {
      const s = read(f);
      expect(s, `${f} لسه فيه placeholder`).not.toContain("YOURCOMPANY");
      expect(s, `${f} مافيهوش ${appId}`).toContain(appId!);
    }
    const g = read("mobile/android/app/build.gradle");
    expect(g).toContain(`applicationId "${appId}"`);
    expect(g).toContain(`namespace "${appId}"`);
  });

  /**
   * الصلاحيات: من غيرها الميزة بتفشل **بلا رسالة** على الجهاز — وجهات الاتصال
   * بالظبط هي سبب وجود «الأصدقاء» وهي اللي عايزين نجرّبها.
   */
  it("المانيفست فيه صلاحيات جهات الاتصال والمايك والكاميرا والإشعارات", () => {
    const m = read("mobile/android/app/src/main/AndroidManifest.xml");
    for (const p of ["READ_CONTACTS", "RECORD_AUDIO", "CAMERA", "POST_NOTIFICATIONS", "INTERNET"]) {
      expect(m, `صلاحية ناقصة: ${p}`).toContain(`android.permission.${p}`);
    }
  });
});

/**
 * **الفخّ اللي الدالة دي موجودة تمنعه:** الـ APK أصله `https://localhost`
 * (بسبب `androidScheme: "https"`), فلازم يتضاف لـ `CORS_ORIGIN`. و`APP_URL`
 * الفاضي بياخد أصلًا من القايمة — فلو انضاف في **أول** القايمة، كل إيميل تحقق
 * يبقى رابطه `https://localhost` **لكل المستخدمين**. فالاختيار بقى «أول أصل
 * غير محلّي» بدل «أول أصل».
 */
describe("أصل التطبيق المحلي مابيكسرش روابط الإيميل", () => {
  it("بيعدّي localhost مهما كان ترتيبه", () => {
    expect(firstPublicOrigin("https://localhost,https://app.example.com")).toBe("https://app.example.com");
    expect(firstPublicOrigin("http://127.0.0.1:5173, https://app.example.com")).toBe("https://app.example.com");
    expect(firstPublicOrigin("https://app.example.com,https://localhost")).toBe("https://app.example.com");
  });

  it("لو كله محلّي بيرجّع الأول — التطوير المحلي لازم يفضل شغّال", () => {
    expect(firstPublicOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(firstPublicOrigin("")).toBe("");
  });

  /** `localhost.evil.com` **مش** محلّي — لازم يتعامل كأصل عام عادي */
  it("مابيتخدعش باسم فيه localhost جوّاه", () => {
    expect(firstPublicOrigin("https://localhost.evil.com,https://app.example.com")).toBe(
      "https://localhost.evil.com",
    );
  });
});

/**
 * **🔴 عنوان الـ API في بناء الـ APK — لاحقة واحدة بتكسر التطبيق كله (١٨ أكتوبر ٢٠٢٦).**
 *
 * أول APK حقيقي اتبنى بـ `https://api.kenoz.org/api`، وبناء الواجهة في compose
 * بياخد `https://api.${DOMAIN}` **بلا مسار**. ونجنكس وCaddy بيمرّروا المسار زي
 * ما هو، فExpress بيستلم `/api/auth/otp/request` — مايطابقش أي راوت في
 * `/auth`، فيكمّل لراوتر فيه `r.use(requireAuth(ctx))` على **كل** المسارات
 * (١٠ راوترات كده) ويرجّع **401 `unauthorized` «غير مصرّح»**.
 *
 * **والعطل مضلّل مرتين:** الرد مش 404 فمفيش حاجة تقول «المسار غلط»، والرسالة
 * بتقول «غير مصرّح» — فالبلاغ جه «كود الإيميل بيقول غير مصرّح» والمطاردة بدأت
 * في المصادقة وResend، والسبب حرفان في عنوان.
 *
 * فالحكم هنا **على سلوك الحارس نفسه** مش على وجود نصّه: بناخد كتلة `case` من
 * الوظيفة ونشغّلها بـ`sh` على عنوان سليم وعنوان فيه مسار.
 */
describe("عنوان الـ API في بناء الـ APK", () => {
  const wf = read(".github/workflows/android.yml");
  const compose = read("docker-compose.prod.yml");

  /** الافتراضي في الوظيفة (آخر بديل في تعبير `||`) */
  const wfDefault = /\|\|\s*'([^']+)'\s*\}\}/.exec(wf)?.[1] ?? "";
  /** اللي بناء الواجهة بياخده فعلًا */
  const webBase = /VITE_API_URL:\s*(\S+)/.exec(compose)?.[1] ?? "";

  it("الافتراضي أصل بلا مسار — زي اللي الواجهة بتستخدمه", () => {
    expect(wfDefault, "مالقيتش الافتراضي في الوظيفة").toMatch(/^https:\/\//);
    expect(wfDefault.replace(/^https?:\/\//, ""), `فيه مسار: ${wfDefault}`).not.toContain("/");
  });

  it("نفس شكل عنوان الواجهة في compose (ما يتفرّقوش في سكوت)", () => {
    expect(webBase, "مالقيتش VITE_API_URL في compose").toMatch(/^https:\/\/api\./);
    expect(webBase.replace(/^https?:\/\//, ""), `عنوان الواجهة فيه مسار: ${webBase}`).not.toContain("/");
    expect(wfDefault).toMatch(/^https:\/\/api\./);
  });

  /**
   * الحارس نفسه: `vars.MOBILE_API_URL` أو مدخل التشغيل اليدوي يقدروا يحطّوا
   * عنوانًا فيه مسار، والاختبار فوق مابيشوفهومش — فلازم الوظيفة **تفشل** عندها
   * بدل ما تطلّع APK مكسورًا شكله سليم.
   */
  it("الوظيفة بترفض أي عنوان فيه مسار (متجرَّب بالتشغيل)", () => {
    const block = /case "\$\{VITE_API_URL#\*:\/\/\}" in[\s\S]*?esac/.exec(wf)?.[0];
    expect(block, "حارس الأصل مش موجود في الوظيفة — عنوان فيه /api هيعدّي").toBeTruthy();

    const script = `VITE_API_URL="$1"\nVITE_API_URL="\${VITE_API_URL%/}"\n${block}\nexit 0\n`;
    const run = (url: string) =>
      spawnSync("sh", ["-c", script, "sh", url], { encoding: "utf8" }).status;

    expect(run("https://api.example.com"), "عنوان سليم اترفض").toBe(0);
    expect(run("https://api.example.com/"), "الشرطة الأخيرة لوحدها مش مسار").toBe(0);
    expect(run("https://api.example.com/api"), "عنوان فيه /api عدّى — ده اللي كسر أول APK").not.toBe(0);
    expect(run("https://api.example.com/v1/x"), "عنوان فيه مسار أطول عدّى").not.toBe(0);
  });
});

/**
 * **🔴 المساحات الآمنة — الشرايط كانت بتغطّي التطبيق على أندرويد (بلاغ ١٨ أكتوبر ٢٠٢٦).**
 *
 * `targetSdkVersion = 35` معناه إن أندرويد ١٥ بيفرض **edge-to-edge**، فالـ WebView
 * بترسم تحت شريط الحالة وشريط التنقّل. البلاغ: «سهم الرجوع وسهم الإرسال والبار
 * اللي فوق واللي تحت مش واضحين».
 *
 * والعلاج **قطعتان مربوطتان**، وكل واحدة لوحدها بلا قيمة:
 *   - `viewport-fit=cover` في `index.html` — من غيرها `env(safe-area-inset-*)`
 *     بترجّع **صفر دايمًا**، فالحشو موجود في الـCSS ومابيعملش حاجة **في سكوت**.
 *   - حشو `env(safe-area-inset-*)` على `#root` — من غيره مفيش حاجة بتبعد المحتوى
 *     عن الشرايط أصلًا.
 * فالحارس بيفحص الاتنين **مع بعض**: شيل أي واحدة والعطل يرجع بلا أي رسالة.
 */
describe("المساحات الآمنة على أندرويد وiOS", () => {
  const html = read("index.html");
  const css = read("src/index.css");
  const manifest = read("mobile/android/app/src/main/AndroidManifest.xml");

  it("viewport فيه viewport-fit=cover (من غيرها كل القيم صفر)", () => {
    const meta = /<meta\s+name="viewport"[^>]*>/.exec(html)?.[0] ?? "";
    expect(meta, "مالقيتش وسم viewport").toContain("width=device-width");
    expect(meta, "`viewport-fit=cover` ناقصة — env(safe-area-*) هترجّع صفر والحشو مابيعملش حاجة").toContain(
      "viewport-fit=cover",
    );
  });

  it("الحشو على #root للجهات الأربعة", () => {
    for (const side of ["top", "bottom", "left", "right"]) {
      expect(css, `حشو المساحة الآمنة ناقص: ${side}`).toContain(`env(safe-area-inset-${side}`);
    }
  });

  /** الاحتياطي `0px` هو اللي بيضمن إن الويب مايتأثرش ولا يتكسر على متصفح قديم */
  it("كل env فيها احتياطي 0px — فالويب مايتأثرش", () => {
    const uses = css.match(/env\(safe-area-inset-[a-z]+[^)]*\)/g) ?? [];
    expect(uses.length, "مفيش ولا استخدام لـ env(safe-area-*)").toBeGreaterThanOrEqual(4);
    for (const u of uses) expect(u, `بلا احتياطي: ${u}`).toMatch(/,\s*0px\s*\)$/);
  });

  /**
   * من غيرها الكيبورد بيطلع **فوق** المحتوى بدل ما يقلّص الـWebView، فصندوق
   * الكتابة وسهم الإرسال يختفوا تحته — وهي تانية نصّ البلاغ.
   */
  it("المانيفست بيقلّص الشاشة للكيبورد مش بيغطّيها", () => {
    expect(manifest, "windowSoftInputMode=adjustResize ناقصة — الكيبورد هيبلع زرار الإرسال").toMatch(
      /android:windowSoftInputMode="adjustResize"/,
    );
  });
});

/**
 * **إضافات Capacitor بتتاخد بـ`registerPlugin` مش من `Capacitor.Plugins` مباشرةً.**
 *
 * 🔴 العطل (١٩ أكتوبر ٢٠٢٦، من أول تجربة حقيقية لجهات الاتصال على جهاز):
 * `window.Capacitor.Plugins.X` بترجّع **`undefined` دايمًا** في الـAPK — الجسر
 * بيبدأ `Plugins` فاضي و`Plugins[name]` بيتحطّ **جوه `registerPlugin` بس**
 * (`@capacitor/core/dist/index.js`). فالإضافة متركّبة ومسجَّلة في
 * `capacitor.plugins.json` والواجهة **مش شايفاها** — جهات الاتصال بتقول «جهازك
 * مش بيسمح»، وزرار الرجوع ميت في سكوت.
 *
 * الحارس ده على **كل** `src/` عشان أي إضافة جديدة تاخد نفس الطريق من أول يوم.
 */
describe("إضافات Capacitor في الواجهة", () => {
  const SRC = path.join(ROOT, "src");

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
    });

  it("مفيش ملف بيقرا Capacitor.Plugins مباشرةً غير المصدر الواحد", () => {
    const files = walk(SRC);
    expect(files.length, "الحارس لازم يلفّ على ملفات فعلًا").toBeGreaterThan(50);
    // التعليقات بتشرح العطل نفسه فبتذكر `Capacitor.Plugins` — الحكم على الكود
    const code = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const bad = files.filter((f) => path.basename(f) !== "capPlugin.ts" && /Capacitor\s*\??\.\s*Plugins/.test(code(f)));
    expect(bad.map((f) => path.relative(ROOT, f)), "استخدمي capPlugin() — القراءة المباشرة ميتة في الـAPK").toEqual([]);
  });

  it("المصدر الواحد بيسجّل الإضافة بالاسم", () => {
    const src = fs.readFileSync(path.join(SRC, "mobile/capPlugin.ts"), "utf8");
    expect(src).toMatch(/registerPlugin\?\.\(name\)/);
  });

  it("صلاحية جهات الاتصال معلنة في المانيفست", () => {
    const m = fs.readFileSync(path.join(ROOT, "mobile/android/app/src/main/AndroidManifest.xml"), "utf8");
    expect(m).toContain("android.permission.READ_CONTACTS");
  });

  it("إضافة جهات الاتصال مسجَّلة في مشروع أندرويد", () => {
    const plugins = fs.readFileSync(path.join(ROOT, "mobile/android/app/src/main/assets/capacitor.plugins.json"), "utf8");
    expect(plugins).toContain("@capacitor-community/contacts");
    const gradle = fs.readFileSync(path.join(ROOT, "mobile/android/app/capacitor.build.gradle"), "utf8");
    expect(gradle).toContain("capacitor-community-contacts");
  });

  /**
   * 🔴 زرار «نزّل ملف APK» في الموقع التعريفي بيودّي على
   * `releases/latest/download/raachat.apk` — فالوسم والاسم دول **عقد مع
   * الموقع**، مش تفصيلة داخلية. أي تغيير فيهم بيخلّي الزرار **٤٠٤** والموقع
   * مش هيعرف، لأن الموقع صفحة ثابتة مابتفحصش الرابط.
   *
   * والـartifact العادي مش بديل: تنزيله **محتاج تسجيل دخول في GitHub**،
   * فالزائر كان هيلاقي صفحة دخول مكان الملف.
   */
  describe("نشر الـAPK كـRelease", () => {
    const wf = () => read(".github/workflows/android.yml");

    it("الاسم والوسم ثابتان زي ما الموقع بيتوقّع", () => {
      const s = wf();
      expect(s, "الاسم ده مكتوب في رابط الموقع").toContain("raachat.apk");
      expect(s, "الوسم ده جزء من الرابط الثابت").toContain("apk-latest");
      expect(s).toMatch(/gh release create apk-latest raachat\.apk/);
      expect(s, "لازم يحدّث الأصل لو الإصدار موجود بدل ما يفشل").toMatch(/gh release upload apk-latest raachat\.apk --clobber/);
    });

    it("الوظيفة لها صلاحية كتابة (من غيرها الـRelease بيرجّع 403)", () => {
      const s = wf();
      expect(s).toMatch(/permissions:\s*\n\s*contents:\s*write/);
    });

    /**
     * من غير الفحص ده الوظيفة ممكن تخلص **خضرا** والأصل مرفوع ناقص أو الرابط
     * بيرجّع صفحة — فالزرار مكسور ومفيش حاجة بتقول كده.
     */
    it("بيتأكد إن الرابط العام بيردّ ٢٠٠ وبحجم معقول", () => {
      const s = wf();
      expect(s).toContain("releases/latest/download/raachat.apk");
      expect(s).toMatch(/test "\$CODE" = "200"/);
      expect(s).toMatch(/stat -c%s \/tmp\/dl\.apk\)" -gt 1000000/);
    });
  });
});
