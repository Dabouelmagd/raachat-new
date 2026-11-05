/**
 * **جدول الاحتفاظ المنشور لازم يقول الحقيقة — في الاتجاه الصح.**
 *
 * 🔴 الصفّ كان بيقول «ثلاث سنوات كحد أقصى … **أيهما أقرب**» — يعني وعد صريح
 * بألّا يتعدّى الاحتفاظ ٣ سنين. والكود بيقول العكس: البلاغ **المفتوح**
 * مابيتمسحش أبدًا (`status: "resolved"` شرط في الحذف)، والدليل مابيتمسحش طالما
 * فيه بلاغ مفتوح على نفس الواقعة **مهما طال** (`openCases`). يعني صفحة منشورة
 * **بتقلّل** مدة الاحتفاظ عن الحقيقة — وده الاتجاه الخطر (بنحتفظ أطول من
 * المنشور)، مش الاتجاه الآمن اللي بيزيد التحفّظ.
 *
 * والمحامي طلبها صراحةً في مذكرته (٥ نوفمبر ٢٠٢٦): «**ويجب الاستثناء صراحة في
 * "جدول الاحتفاظ بالبيانات" من شرط المحو التلقائي**».
 *
 * 🔴 **والحارس مشروط بالكود مش بجملة محفوظة:** طالما `retention.ts` فيه حماية
 * البلاغ المفتوح، الصفحة **لازم** تقولها. ولو الحماية اتشالت يومًا، الفحص ده
 * بيسقط ويقول إن الفرضية اتغيّرت — بدل ما يفضل بيحرس جملة بقت غلط (نفس درس
 * `OUR_DOMAINS` اللي فضل بيحرس الدومين القديم بعد الانتقال).
 *
 * وملف لوحده بلا قاعدة بيانات **عن قصد**: `retention.test.ts` بيقوم بـ
 * `startTestEnv`، فلو postgres وقع الملف كله بيسقط في التجهيز والحارس ده
 * مابيشتغلش أصلًا — والحارس اللي مابيتشغّلش بيبوظ في سكوت.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const PRIVACY = read("public/legal/privacy.html");
/** الحكم على الكود **بعد شيل التعليقات** — التعليق بيشرح العطل فبيسمّي بالضرورة
 *  الحاجة اللي بيحذّر منها (تكرر ٤ مرات في المشروع). */
const RETENTION = read("server/src/lib/retention.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const rowOf = (head: string): string => {
  const m = PRIVACY.match(new RegExp(`<tr><td>${head}</td><td>[\\s\\S]*?</tr>`));
  return m ? m[0] : "";
};
const AR = rowOf("بلاغات إيذاء الأطفال وأدلتها");
const EN = rowOf("Child-safety reports and their evidence");

describe("جدول الاحتفاظ المنشور vs. سلوك الكنس الفعلي", () => {
  it("الحارس لقى الصفّين فعلًا (وإلا بيفحص نصًّا فاضيًا ويعدّي بلا معنى)", () => {
    expect(AR, "صفّ «بلاغات إيذاء الأطفال وأدلتها» مش موجود في privacy.html").not.toBe("");
    expect(EN, "الصفّ الإنجليزي مش موجود في privacy.html").not.toBe("");
  });

  it("الفرضية قايمة: الكود بيستثني البلاغ المفتوح من الكنس", () => {
    // البلاغ: الحذف مشروط بـ resolved، فالمفتوح مابيتمسحش مهما قدم.
    expect(RETENTION).toContain('status: "resolved"');
    // الدليل: بيتستثنى لو فيه بلاغ مفتوح على نفس الواقعة.
    expect(RETENTION).toContain("openCases");
    expect(RETENTION).toMatch(/openCases\.has\(/);
  });

  it("الصفّ العربي بيقول الاستثناء من المحو التلقائي", () => {
    expect(AR).toContain("مستثناة من المحو التلقائي");
    expect(AR).toMatch(/مفتوح/);
  });

  it("الصفّ الإنجليزي بيقول نفس الاستثناء", () => {
    expect(EN).toMatch(/excluded from automatic deletion/i);
    expect(EN).toMatch(/still open/i);
  });

  it("🔴 والسقف المطلق ممنوع يرجع — «أيهما أقرب» كانت بتوعد بمحو أبكر من الواقع", () => {
    expect(AR).not.toMatch(/أيهما أقرب/);
    expect(EN).not.toMatch(/whichever comes first/i);
  });
});
