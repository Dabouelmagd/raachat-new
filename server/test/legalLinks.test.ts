/**
 * **كل مفتاح في `LEGAL` لازم يكون له مستهلِك — في الواجهة أو في إقرارات المتاجر.**
 *
 * 🔴 العطلان اللي الحارس ده موجود عشانهما (اتكشفا ٢٠ أكتوبر ٢٠٢٦):
 *
 * ١) `LEGAL.dataRequests` و`LEGAL.deleteAccount` **معرَّفان ومحدش بينادیهما** —
 *    والصفحتان منشورتان فعلًا. يعني صفحة «طلبات البيانات» (اللي فيها الحقوق
 *    اللي مش منفَّذة في الشاشة: الاعتراض وتقييد المعالجة والشكوى لمركز حماية
 *    البيانات ومسؤول حماية البيانات — مطلوبة في ١٥١/٢٠٢٠) **مفيش منها أي طريق
 *    جوه التطبيق**، والصفحة نفسها بتقول «التطبيق ← الحساب ← …». رابط في اتجاه
 *    واحد. ثابت محدش بينادیه **بيبوظ في سكوت** — نفس درس `adsFor("story")`.
 *
 * ٢) وأخطر: إقرار المتاجر كان بيقول إن رابط حذف البيانات على الويب هو
 *    `legal/data-requests.html` — و**دي مافيهاش نموذج حذف خالص**، هي بتشرح
 *    الحقوق وبتحوّل. والنموذج الحقيقي في `delete-account.html` من ١١ أكتوبر.
 *    مراجع بلاي بيفتح الرابط بإيده، فكان هيلاقي شرحًا مش طريقًا للحذف.
 *
 * والحكم هنا على **وجود مستهلِك فعلي**، مش على وجود الثابت.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LEGAL_TS = path.join(ROOT, "src/legal.ts");
const DECL = path.join(ROOT, "docs/legal/store-declarations.md");

/**
 * مفاتيح مالهاش طريق جوه التطبيق **عن قصد**، ولكل واحد سبب ومستهلِك موثَّق.
 * أي مفتاح جديد لازم يتنادى من `src/` أو يتحطّ هنا بسببه — مش يتسيب معلّقًا.
 */
const STORE_ONLY: Record<string, string> = {
  // مستهلِكه خانة «رابط حذف الحساب» في Play Console مش شاشة في التطبيق:
  // الحذف جوه التطبيق موجود أصلًا (`DeleteAccountSheet`)، وزرار تاني يودّي
  // لصفحة ويب فيها نفس الإجراء = مدخلان للحذف ودي حيرة مش ميزة.
  deleteAccount: "رابط المتجر (Play Console) — الحذف جوه التطبيق في DeleteAccountSheet",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && p !== LEGAL_TS) out.push(p);
  }
  return out;
}

const legalSrc = fs.readFileSync(LEGAL_TS, "utf8");
const block = legalSrc.match(/export const LEGAL = \{([\s\S]*?)\n\};/);
const keys = [...(block?.[1] ?? "").matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);

const srcFiles = walk(path.join(ROOT, "src"));
const srcText = srcFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
const decl = fs.readFileSync(DECL, "utf8");

describe("روابط الصفحات القانونية", () => {
  it("معايرة: الثوابت والملفات اتقروا فعلًا", () => {
    // من غير المعايرة دي، أي غلطة في الـregex بتخلّي القايمة فاضية
    // و**كل** الفحوص اللي بعدها تعدّي بلا معنى.
    expect(block, "مالقيتش كتلة LEGAL في src/legal.ts").toBeTruthy();
    expect(keys.length, `مفاتيح LEGAL: ${keys.join(", ")}`).toBeGreaterThanOrEqual(4);
    expect(srcFiles.length, "ما لقيتش ملفات واجهة").toBeGreaterThan(50);
  });

  it("🔴 كل مفتاح في LEGAL له مستهلِك — في src/ أو موثَّق كرابط متجر", () => {
    const orphans = keys.filter((k) => !STORE_ONLY[k] && !srcText.includes(`LEGAL.${k}`));
    expect(
      orphans,
      "مفاتيح معرَّفة ومحدش بينادیها — صفحة منشورة مفيش منها طريق جوه التطبيق:\n" +
        orphans.map((k) => `  LEGAL.${k}`).join("\n") +
        "\nنادِها من الواجهة، أو حطّيها في STORE_ONLY بسببها.",
    ).toEqual([]);
  });

  it("🔴 كل مفتاح في STORE_ONLY لسه موجود في LEGAL", () => {
    // مفتاح اتشال من `legal.ts` وفضل هنا = سبب مكتوب لحاجة مش موجودة،
    // والحارس يفضل أخضر على ثابت تاني يتوه.
    for (const k of Object.keys(STORE_ONLY)) expect(keys).toContain(k);
  });

  it("🔴 رابط حذف البيانات في الإقرار هو صفحة النموذج على مضيف app.", () => {
    // الصفحة بتشتق عنوان الـAPI من اسم المضيف (`h.replace(/^app\./,'api.')`)،
    // فأي مضيف تاني = `API` فاضي والنموذج مايبعتش. والدومين المجرّد بيرجّع
    // ٤٠٤ لأن نجنكس بيخدم `site/` بس.
    const row = decl.split("\n").find((l) => l.includes("طريقة لطلب حذف البيانات"));
    expect(row, "مالقيتش سطر «طريقة لطلب حذف البيانات» في الإقرار").toBeTruthy();
    expect(row!).toContain("https://app.raachateg.com/delete-account.html");
    // ومابيشاورش على صفحة الحقوق كأنها نموذج الحذف (ده كان الغلط بالظبط).
    expect(row!).not.toMatch(/على الويب:\s*`?https:\/\/[^`\s]*data-requests\.html/);
  });

  it("🔴 صفحة نموذج الحذف موجودة فعلًا وفيها النموذج", () => {
    // رابط في إقرار متجر لصفحة مش موجودة = سبب إزالة. والفحص على
    // **محتوى** الصفحة مش على وجود الملف: ملف فاضي بيعدّي من فحص الوجود.
    const page = fs.readFileSync(path.join(ROOT, "public/delete-account.html"), "utf8");
    expect(page).toContain("RACHAT_API");
    expect(page).toMatch(/replace\(\/\^app\\\.\//);
    expect(page).toContain("<form");
  });
});
