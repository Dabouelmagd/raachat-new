/**
 * **إقرارات المتاجر لازم تطابق الكود — والانحراف هنا عدّى خمسة أسابيع.**
 *
 * 🔴 **القصة:** في ١٤ أكتوبر ٢٠٢٦ أقرّينا في جدول Data Safety إن «رسائل داخل
 * التطبيق» **تُشارَك مع Google Cloud Translation** — وكان صحيحًا وقتها. وفي
 * ٣٠ أكتوبر الترجمة بقت على خدمة `libretranslate` جوّه شبكة compose بتاعتنا،
 * فالنصّ **بطّل يخرج من السيرفر خالص** — **والإقرار فضل زي ما هو**. يعني مستند
 * بنملا منه استمارة رسمية للمتجرين كان بيعلن مشاركة **مش حاصلة**، ومحدش خد باله
 * إلا لما داليا سألت «فيه حاجة ناقصة؟» في ٦ نوفمبر.
 *
 * 🔴 **والحارس مشروط بالإعداد مش بجملة محفوظة:** طالما compose بيحطّ الافتراضي
 * للمزوّد **المجاني**، الإقرار **لازم** يقول «مفيش مشاركة». ولو الافتراضي اتشال
 * يومًا (أو اتحوّل للمدفوع)، الفحص ده بيسقط ويقول إن الفرضية اتغيّرت — بدل ما
 * يفضل بيحرس جملة بقت غلط (درس `OUR_DOMAINS` اللي فضل بيحرس الدومين القديم).
 *
 * وليه الإقرار الزايد مش «الاتجاه الآمن» هنا: استمارة Data Safety بيتطلّب
 * **الدقة**، وإقرار بمشاركة مش حاصلة بيجبر السياسة المنشورة تسمّي مزوّدًا
 * مابيستلمش حاجة — فبقى عندنا صفحة بتدّعي والكود بينفي.
 *
 * وملف لوحده بلا قاعدة بيانات عن قصد — نفس سبب `retentionDisclosure.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const DOC = read("docs/legal/store-declarations.md");
const COMPOSE = read("docker-compose.prod.yml");

/** صفّ «رسائل داخل التطبيق» من جدول Data Safety. */
const MSG_ROW = DOC.match(/^\| رسائل داخل التطبيق \|.*$/m)?.[0] ?? "";
/** قسم ٢-٢ بحدوده — من عنوانه لعنوان اللي بعده، مش بنافذة بايتات (درس `turn_host_of`). */
const SAFETY = (() => {
  const a = DOC.indexOf("### ٢-٢)");
  const b = DOC.indexOf("### ٢-٣)");
  return a >= 0 && b > a ? DOC.slice(a, b) : "";
})();

describe("إقرارات المتاجر vs. المزوّد المتضبط فعلًا", () => {
  it("الحارس لقى الصفّ والقسم (وإلا بيفحص نصًّا فاضيًا ويعدّي بلا معنى)", () => {
    expect(MSG_ROW, "صفّ «رسائل داخل التطبيق» مش موجود في جدول Data Safety").not.toBe("");
    expect(SAFETY, "قسم ٢-٢ (أمان البيانات) مش موجود").not.toBe("");
  });

  it("الفرضية قايمة: compose بيحطّ الافتراضي للمزوّد المجاني داخل السيرفر", () => {
    // الشرطة من غير نقطتين مقصودة: غايب من .env = شغّال بالافتراضي، وفاضي = إيقاف صريح.
    expect(COMPOSE).toMatch(/LIBRETRANSLATE_URL:\s*\$\{LIBRETRANSLATE_URL-http:\/\/libretranslate:5000\}/);
  });

  it("🔴 وعليه: صفّ الرسائل مايقرّش بمشاركة نصّها مع أي طرف تالت", () => {
    expect(MSG_ROW, "الصفّ لازم يقول «لا» في خانة «يُشارَك»").toContain("❌");
    expect(MSG_ROW, "الصفّ مايسمّيش جوجل كمستلم — النصّ مابيخرجش من السيرفر").not.toMatch(/Google|جوجل/);
    expect(MSG_ROW).not.toMatch(/يُشارَك\s*=\s*أيوه/);
  });

  it("ومفيش احتياطي وقت التشغيل يخرّج النصّ لو المجاني وقع", () => {
    // 🔴 ودرس من كتابة الحارس ده نفسه: شيل تعليقات `//` **بياكل الروابط** —
    // `https://translation.googleapis.com` فيها `//` فاتشالت والفحص سقط على كود
    // سليم وقال «نداء جوجل مش موجود». فالاستثناء على `://` لازم.
    const src = read("server/src/routes/extras.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(?<!:)\/\/.*$/gm, "");
    // المزوّد بيتحدّد بالإعداد: جوجل في فرع `else` بتاع `lt`، والفشل بيرجّع 502 مش بيحوّل.
    expect(src).toMatch(/if\s*\(\s*lt\s*\)/);
    expect(src).toMatch(/translate_failed/);
    const g = src.indexOf("translation.googleapis.com");
    const e = src.indexOf("} else {");
    expect(g, "نداء جوجل مش موجود؟").toBeGreaterThan(0);
    expect(e, "فرع else مش موجود — الشكل اتغيّر، راجعي الفرضية").toBeGreaterThan(0);
    expect(g, "نداء جوجل لازم يفضل جوّه فرع else مش في مسار الفشل").toBeGreaterThan(e);
  });

  it("والنسخة الاحتياطية على درايف مُفصَح عنها في قسم أمان البيانات", () => {
    // السكربت شغّال في الإنتاج وبيرفع نسخة كاملة — فغيابه من القسم إقرار ناقص.
    expect(fs.existsSync(path.join(ROOT, "scripts/backup-to-drive.sh"))).toBe(true);
    expect(SAFETY, "قسم ٢-٢ لازم يذكر رفع النسخة على جوجل درايف").toMatch(/درايف/);
  });
});
