/**
 * حوارس على **وظيفة وضع الـ API في الـ CI**.
 *
 * ليه اختبار على ملف الـ CI: العطلان اللي الوظيفة دي بتحميهم (نص الرسالة اللي
 * بيضيع بلا أي رسالة خطأ · والجروب العام اللي يبان فاضي بعد الانضمام) **مستحيل
 * يتكشفوا** في وظيفة الواجهة العادية، لأنها بتشتغل على بناء الديمو اللي مابيعملش
 * ولا نداء شبكة. فلو الوظيفة دي اتشالت أو اتسمّى سكربتها غلط، الطقم كله يفضل
 * أخضر والعطلان يرجعوا من غير ما حد ياخد باله.
 *
 * والدرس اللي خلّى ده ضروري: السكربتين كانوا **مكسّرين من ١٣ أكتوبر لـ ١٥** —
 * حارس الـ ١٨+ خلّى إنشاء الحساب يطلب `birthDate`، فتسجيل الدخول جوّه السكربت
 * بيفشل. محدش خد باله لأنهم مكانوش بيتشغّلوا. **الحارس اللي مابيتشغّلش بيبوظ في
 * سكوت** — فالحارس الحقيقي هو إنه يبقى في الـ CI، والاختبار ده بيثبّت ده.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
/** سطور الأوامر بس — التعليقات بتذكر أسماء السكربتين فبتخدع أي فحص نصّي */
const code = ci.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

/** كتلة وظيفة واحدة بحدودها (من عنوانها لعنوان اللي بعدها) — مش نافذة بايتات */
function job(name: string) {
  const start = code.search(new RegExp(`^ {2}${name}:`, "m"));
  if (start < 0) return "";
  const rest = code.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][\w-]*:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("وظيفة وضع الـ API في الـ CI", () => {
  it("الوظيفة موجودة ومعاها postgres", () => {
    expect(code, "وظيفة api-mode اتشالت من الـ CI").toMatch(/^ {2}api-mode:/m);
    const block = job("api-mode");
    expect(block, "محتاجة postgres حقيقي — السكربتين بيعملوا قاعدة ويمسحوها")
      .toMatch(/image: postgres:/);
  });

  it("بتشغّل السكربتين الاتنين فعلًا", () => {
    for (const s of ["send-failure.ts", "join-history.ts"]) {
      expect(code, `${s} مش بيتشغّل في الـ CI`).toContain(`test/manual/${s}`);
    }
  });

  it("وبتبني الواجهة في **وضع الـ API** مش بناء الديمو", () => {
    // من غير VITE_API_URL البناء بيبقى ديمو مابيعملش نداء شبكة — والسكربتان
    // يعدّيان على لا شيء: أخضر بلا معنى.
    // والعدّ **جوه كتلة الوظيفة** مش في الملف كله: وظيفة الواجهة بقى فيها
    // VITE_API_URL كمان (بناء اللوحة بوضع الـ API)، فالعدّ على الملف كله كان
    // بيخلّي الفحص يعدّي حتى لو بناءات api-mode اتشالوا.
    expect((job("api-mode").match(/VITE_API_URL=/g) ?? []).length, "بناء وضع الـ API ناقص")
      .toBeGreaterThanOrEqual(2);
  });

  it("والسكربتان بيحكمان بكود خروج — مش بطباعة للمراجعة البشرية", () => {
    for (const s of ["send-failure.ts", "join-history.ts"]) {
      const src = fs.readFileSync(path.join(ROOT, "server/test/manual", s), "utf8");
      // لازم يخرج بكود غير صفر على الفشل، وإلا الـ CI أخضر على أي عطل.
      // الشكل بيختلف بين السكربتين (`bad ? 2 : 0` و`ok ? 0 : 2`) فالفحص على
      // وجود الـ ٢ جوه نداء الخروج، و`\b` بيمنع مطابقة `has2` وما شابه.
      expect(src, `${s} بيخرج صفر دايمًا — الـ CI مش هيشوف الفشل`)
        .toMatch(/process\.exit\([^)]*\b2\b/);
    }
  });

  it("وتسجيل الدخول فيهما بيبعت birthDate (وإلا بيفشلان على حارس الـ ١٨+)", () => {
    for (const s of ["send-failure.ts", "join-history.ts"]) {
      const src = fs.readFileSync(path.join(ROOT, "server/test/manual", s), "utf8");
      expect(src, `${s} مش بيبعت birthDate — إنشاء الحساب هيترفض`).toMatch(/birthDate:/);
    }
  });
});

/**
 * ونفس الدرس على اختبارات اللوحة: الاتنين بيتخطّوا لوحدهم لو ناتج البناء مش
 * موجود (`test.skip`)، فلو الـ CI مابناهوش، الاختبار يبقى موجود في الريبو
 * ومابيشتغلش — وهو بالظبط «الحارس اللي مابيتشغّلش بيبوظ في سكوت».
 */
describe("اختبارات لوحة الإدارة في الـ CI", () => {
  const web = job("web");

  it("بتبني اللوحة مرتين: ديمو + وضع الـ API", () => {
    expect(web, "بناء الديمو بتاع اللوحة اتشال — admin.spec.ts هيتخطّى").toMatch(/working-directory: admin/);
    expect(web, "بناء اللوحة بوضع الـ API اتشال — admin-retry.spec.ts هيتخطّى في سكوت")
      .toMatch(/VITE_API_URL=http:\/\/127\.0\.0\.1:4121\/api[\s\S]*--outDir dist-api/);
  });

  it("والمنفذ في البناء هو نفسه اللي الاختبار بيسمع عليه", () => {
    // لو اتفرقوا: البناء بيشاور على منفذ محدش سامع عليه، فالطلب بيفشل بخطأ
    // شبكة **لأي سبب** — والاختبار يبقى أخضر على كود مكسور.
    const spec = fs.readFileSync(path.join(ROOT, "test/ui/admin-retry.spec.ts"), "utf8");
    const port = /const PORT = (\d+)/.exec(spec)?.[1];
    expect(port, "مش لاقي المنفذ في الاختبار").toBeTruthy();
    expect(web, `البناء مش على المنفذ ${port}`).toContain(`127.0.0.1:${port}/api`);
  });

  it("والاختبارات موجودة فعلًا", () => {
    for (const s of ["admin-retry.spec.ts", "admin-update.spec.ts", "admin-ads.spec.ts"]) {
      expect(fs.existsSync(path.join(ROOT, "test/ui", s)), `${s} مش موجود`).toBe(true);
    }
  });

  /**
   * اختبار نموذج الإعلانات بيحكم على **ظهور** زرار الرفع للمستخدم — وده
   * اللي الحارس النصّي مابيشوفهوش: الزرار كان موجودًا في الكود ومخفيًا على
   * الشاشة. فلو الفحوص دي اتشالت منه، نرجع لنفس العمى اللي سبّب البلاغ.
   */
  it("واختبار نموذج الإعلانات بيفحص الرفع والرجوع فعلًا", () => {
    const spec = fs.readFileSync(path.join(ROOT, "test/ui/admin-ads.spec.ts"), "utf8");
    expect(spec, "مفيش فحص على ظهور زرار الرفع").toContain("ارفعي صورة");
    expect(spec, "مفيش فحص على سهم الرجوع").toContain("رجوع للإعلانات");
    expect(spec, "مفيش فحص إن الرجوع مابيضيّعش المسوّدة").toMatch(/toHaveValue\("شركة النور"\)/);
    // 🔴 والبيع بالشهر: الفحص إن مفيش خانة تاريخ نهاية حرّة لازم يفضل. حارس
    // نصّي بيلاقي `endOfMonths` في الملف ويعدّي، واللي بيكسر البيع هو إن
    // الخانة الحرّة لسه على الشاشة — فالمتصفح هو الوحيد اللي بيشوف ده.
    expect(spec, "مفيش فحص إن مفيش خانة تاريخ نهاية حرّة").toMatch(/input\[type="date"\][\s\S]*?toHaveCount\(1\)/);
    expect(spec, "مفيش فحص على اختيار عدد الشهور").toContain("عدد الشهور");
  });
});

/**
 * 🔴 **حالات الرسالة لازم تتجرّب في وضع الـ API** — الاختبار اللي مابيتشغّلش
 * بيبوظ في سكوت، وده بالظبط اللي حصل: الأعمدة كانت متفحوصة والعلامة اللي
 * المستخدم بيشوفها مكانتش بتتحرّك لأن مفيش حاجة بتجرّب الطريق كله.
 */
describe("حالات الرسالة في الـ CI", () => {
  it("السكربت بيتشغّل ومعاه بناء بوضع الـ API", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const yml = fs.readFileSync(path.resolve(import.meta.dirname, "../../.github/workflows/ci.yml"), "utf8");
    const job = yml.slice(yml.indexOf("api-mode:"), yml.indexOf("\n  admin:"));
    expect(job, "سكربت حالات الرسالة مش في الـ CI").toContain("test/manual/message-states.ts");
    // المنفذ لازم يطابق اللي السكربت سامع عليه، وإلا الواجهة بتبني على عنوان
    // تاني والسكربت يعدّي على لا شيء
    const script = fs.readFileSync(path.resolve(import.meta.dirname, "manual/message-states.ts"), "utf8");
    const port = /const API = (\d+)/.exec(script)![1]!;
    expect(job, `البناء مش على نفس منفذ السكربت (${port})`).toContain(`VITE_API_URL=http://localhost:${port}`);
    // وبيحكم بكود خروج — مش بيطبع للمراجعة البشرية (درس send-failure.ts)
    expect(script).toContain("process.exit(2)");
  });
});
