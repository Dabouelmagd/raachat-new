/**
 * مشروع iOS — الحوارس اللي مستحيل نجرّبها هنا بالبناء.
 *
 * بناء iOS محتاج Mac وXcode وCocoaPods، ومفيش منهم حاجة في بيئة Claude — فأول
 * بناء حقيقي بيحصل على جهاز داليا. يعني كل غلطة في الإعداد بتتكشف **هناك**،
 * وبعضها مابيتكشفش غير بعد الرفع للمتجر. فالحوارس دي بتمسك اللي ينفع يتمسك من
 * هنا: الملفات اللي `cap sync` **مابيكتبش فوقها** واللي غلطها صامت.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { firstPublicOrigin } from "../src/lib/senders.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const PLIST = "mobile/ios/App/App/Info.plist";
const PBX = "mobile/ios/App/App.xcodeproj/project.pbxproj";
const CONFIG = "mobile/capacitor.config.ts";

describe("مشروع iOS", () => {
  /**
   * 🔴 جملة إذن ناقصة = **التطبيق بيقع** (crash) أول ما الميزة تتنادى — مش
   * إذن مرفوض، العملية بتموت. وآبل بتقرأ الجُمل دي في المراجعة.
   *
   * وقبل كده الجُمل كانت في ملف `mobile/ios-infoplist-snippet.xml` المفروض
   * حد ينقله بإيده — نفس نمط «ثابت محدش بينادیه»: الملف موجود، والمشروع
   * بيتبني من غيره، ومفيش حاجة تقول إنه ما اتطبّقش. دلوقتي هي في الملف
   * الحقيقي (و`cap sync` مابيكتبش فوقه) والحارس ده على مكانها الحقيقي.
   */
  const NEEDED = [
    "NSMicrophoneUsageDescription",
    "NSCameraUsageDescription",
    "NSContactsUsageDescription",
    "NSPhotoLibraryUsageDescription",
  ];

  it("جُمل الأذونات موجودة في Info.plist نفسه ومش فاضية", () => {
    const plist = read(PLIST);
    for (const key of NEEDED) {
      const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist);
      expect(m, `${key} مش في ${PLIST}`).toBeTruthy();
      // الفاضية بتعدّي من فحص الوجود وبتوقّع التطبيق بالظبط زي الناقصة
      expect(m![1].trim().length, `${key} جملته فاضية`).toBeGreaterThan(10);
    }
  });

  it("مفيش ملف لصق يدوي للأذونات تاني", () => {
    // رجوعه معناه إن فيه مصدرَين للجملة الواحدة، وواحد منهم هيُنسى.
    expect(fs.existsSync(path.join(ROOT, "mobile/ios-infoplist-snippet.xml"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "mobile/android-manifest-snippet.xml"))).toBe(false);
  });

  /**
   * اسم الحزمة لازم يطابق `appId` — و`cap sync` **مابيعيدش التسمية** (نفس درس
   * أندرويد في ١٨ أكتوبر: `capacitor.config.ts` اتغيّر و`build.gradle`
   * و`strings.xml` فضلوا على placeholder). وبعد أول رفعة للمتجر الاسم
   * **مابيتغيّرش**: اسم تاني = تطبيق منفصل بلستة جديدة.
   */
  it("اسم الحزمة في مشروع Xcode مطابق لـ appId", () => {
    const appId = /appId:\s*"([^"]+)"/.exec(read(CONFIG))?.[1];
    expect(appId, "مفيش appId").toBeTruthy();
    const ids = [...read(PBX).matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    expect(ids.length, "مفيش PRODUCT_BUNDLE_IDENTIFIER في المشروع").toBeGreaterThan(0);
    for (const id of ids) expect(id, `اسم حزمة مختلف عن ${appId}`).toBe(appId);
  });

  it("اسم التطبيق المعروض عربي ومطابق لـ appName", () => {
    const appName = /appName:\s*"([^"]+)"/.exec(read(CONFIG))?.[1];
    expect(appName).toBeTruthy();
    expect(read(PLIST)).toContain(`<string>${appName}</string>`);
  });

  /**
   * 🔴 `iosScheme: "https"` ممنوع — **بيترفض في سكوت**.
   *
   * قريت `CAPInstanceDescriptor.swift` في `@capacitor/ios`: `normalize()`
   * بتقبل سكيمة مخصّصة بشرط `WKWebView.handlesURLScheme(scheme) == false`،
   * و`https` الـWebView بيتعامل معاها أصلًا فالشرط بيفشل والقيمة بترجع
   * للافتراضي `capacitor`. يعني اللي يكتب السطر ده بيفتكر إن أصل التطبيق
   * `https://localhost` زي أندرويد، والحقيقة `capacitor://localhost` —
   * فيضبط CORS على الأصل الغلط وكل طلب يترفض و**مفيش ولا خطأ يقول السبب**.
   */
  it("مفيش iosScheme مكتوبة في إعداد Capacitor", () => {
    const cfg = read(CONFIG).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(cfg, "iosScheme بتترفض في سكوت — الأصل بيفضل capacitor://localhost").not.toMatch(
      /iosScheme/,
    );
  });

  /**
   * 🔴 الفحص الحاسم — على **السلوك** مش على نصّ ملف:
   *
   * أصل iOS لازم يتضاف لـ`CORS_EXTRA` (وإلا كل طلب وكل سوكت من التطبيق
   * يترفض والتطبيق يبان شغّالًا بلا ولا رسالة). و`APP_URL` الفاضي بياخد أول
   * أصل **غير محلّي** من القايمة — فلو `firstPublicOrigin` ماعدّتش
   * `capacitor://localhost`، كل إيميل تحقق لكل المستخدمين رابطه يبقى
   * `capacitor://localhost` واللوجو مايظهرش. ده بالظبط العطل اللي حصل مع
   * `https://localhost` بتاعة أندرويد.
   */
  it("أصل iOS بيتعدّى في firstPublicOrigin فمابيبقاش APP_URL", () => {
    const list = "https://app.raachateg.com,https://admin.raachateg.com,https://localhost,capacitor://localhost";
    expect(firstPublicOrigin(list)).toBe("https://app.raachateg.com");
    // ولو الأصل المحلي اتحطّ في الأول (الغلطة الطبيعية) لسه بيتعدّى
    expect(firstPublicOrigin("capacitor://localhost,https://app.raachateg.com")).toBe(
      "https://app.raachateg.com",
    );
    // ومابيتخدعش باسم مضيف بيبدأ بـlocalhost
    expect(firstPublicOrigin("capacitor://localhost.evil.com,https://app.raachateg.com")).toBe(
      "capacitor://localhost.evil.com",
    );
  });

  /**
   * 🔴 أيقونة المتجر — تلات طرق للسقوط، كلها بعد الرفع:
   *
   * 1. **قناة شفافية**: آبل بترفض الحزمة («can't be transparent») — وقالب
   *    Capacitor بيجي RGB فالغلطة بتحصل لما حد يحطّ لوجو PNG عادي بـalpha.
   * 2. **مقاس غير ١٠٢٤×١٠٢٤**: نفس الرفض.
   * 3. **أيقونة القالب نفسها** (مربع **أبيض** فاضي): بتعدّي الرفع عادي،
   *    وبتظهر في المتجر وعلى شاشة كل مستخدم — عطل صامت بالكامل.
   *
   * والبصمة تحت هي بصمة أيقونة القالب بالظبط، فأي أيقونة حقيقية بتعدّي —
   * الحارس مابيثبّتش أيقونة معيّنة (تبديلها بنسخة أحدّ لازم يفضل ممكنًا).
   */
  it("أيقونة المتجر ١٠٢٤ بلا شفافية ومش أيقونة القالب", () => {
    const p = "mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";
    const buf = fs.readFileSync(path.join(ROOT, p));
    expect(buf.subarray(12, 16).toString("ascii"), "مش PNG").toBe("IHDR");
    expect(buf.readUInt32BE(16), "العرض لازم ١٠٢٤").toBe(1024);
    expect(buf.readUInt32BE(20), "الارتفاع لازم ١٠٢٤").toBe(1024);
    // نوع اللون: ٤ و٦ فيهم alpha — وآبل بترفض أيقونة المتجر بشفافية
    expect([4, 6], "الأيقونة فيها قناة شفافية").not.toContain(buf[25]);

    const sha = createHash("sha256").update(buf).digest("hex");
    expect(sha, "دي أيقونة قالب Capacitor البيضا — مش لوجو رع شات").not.toBe(
      "29e4777e319de3ee5a52c3a8004ec19d0568414004257e36d7c94a077d71c93b",
    );
  });

  /**
   * ناتج البناء مايدخلش git: `App/App/public` فيه بناء الواجهة (وجوّاه عنوان
   * الـAPI)، و`capacitor.config.json` بيتولّد من `capacitor.config.ts`.
   * المصدر الواحد لازم يفضل واحدًا.
   */
  it("ناتج البناء والإعداد المولَّد متجاهلين في git", () => {
    const ig = read("mobile/ios/.gitignore");
    for (const p of ["App/App/public", "App/Pods", "App/build", "App/App/capacitor.config.json"]) {
      expect(ig, `${p} مش متجاهل`).toContain(p);
    }
  });
});
