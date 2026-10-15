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

describe("وظيفة وضع الـ API في الـ CI", () => {
  it("الوظيفة موجودة ومعاها postgres", () => {
    expect(code, "وظيفة api-mode اتشالت من الـ CI").toMatch(/^ {2}api-mode:/m);
    const block = code.slice(code.search(/^ {2}api-mode:/m));
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
    expect((code.match(/VITE_API_URL=/g) ?? []).length, "بناء وضع الـ API ناقص")
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
