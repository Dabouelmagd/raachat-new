/**
 * **أي ملف اختبارات السيرفر بتقراه لازم يكون متتبَّعًا في git.**
 *
 * 🔴 العطل اللي الحارس ده موجود عشانه (٢٠ أكتوبر ٢٠٢٦): اختبار اتضاف في
 * ١٩ أكتوبر بيقرا `mobile/android/app/src/main/assets/capacitor.plugins.json`
 * — و`.gitignore` بتاع Capacitor بيتجاهله. فالملف موجود على أي جهاز اتشغّل
 * عليه `cap sync`، و**مش موجود في نسخة CI النضيفة**، فالقراءة بترمي ووظيفة
 * السيرفر بقت حمرا.
 *
 * والأسوأ إنها فضلت حمرا **إحدى عشرة نشرة متتالية** (١٩–٢٠ أكتوبر) وإحنا
 * بنقول «الاختبارات عدّت» في كل مرة — لأن التشغيل المحلي بيعدّي. ده نفس
 * صنف «الحارس اللي مابيتشغّلش بيبوظ في سكوت»، بالعكس: الحارس كان بيصرخ
 * ومحدش بيبصّ.
 *
 * الحكم هنا على `git ls-files` مش على وجود الملف — لأن الوجود هو بالظبط
 * الحاجة اللي بتخدع في التشغيل المحلي.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
// 🔴 `ROOT/test` هو مجلد اختبارات **الواجهة** — اختبارات السيرفر هنا.
// أول نسخة غلطت فيها، وفحص «فيه ملفات أصلًا» هو اللي مسكها على طول.
const TESTS = import.meta.dirname;

/** مسارات نصّية جوه ملفات الاختبار — `path.join(ROOT, "x")` أو `read("x")` */
function literalPaths(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/"((?:[\w.-]+\/)+[\w.-]+)"/g)) out.add(m[1]);
  return [...out];
}

const files = fs
  .readdirSync(TESTS)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => ({ name: f, src: fs.readFileSync(path.join(TESTS, f), "utf8") }));

describe("ملفات الاختبارات بتقرا حاجات متتبَّعة في git", () => {
  it("فيه ملفات اختبار أصلًا (وإلا الحارس بيعدّي بلا معنى)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  // `safe.directory` لازم: الاختبارات بتشتغل كمستخدم عادي والريبو ملك root،
  // فـgit بيرفض بـ«dubious ownership» و**كل** ملف يبان متجاهَلًا.
  const tracked = (p: string) =>
    spawnSync("git", ["-c", "safe.directory=*", "ls-files", "--error-unmatch", p], {
      cwd: ROOT,
    }).status === 0;

  it("🔴 معايرة: git شغّال هنا أصلًا", () => {
    // من غير السطر ده الحارس بيطلّع **كل** الملفات كأنها متجاهَلة (حصل فعلًا)،
    // أو يعدّي على الكل لو `git` مش موجود — والحالتان بلا معنى.
    expect(tracked("package.json"), "git مش قادر يقرا الريبو — الحارس مش موثوق").toBe(true);
    expect(tracked("no/such/file.xyz")).toBe(false);
  });

  it("🔴 مفيش مسار موجود على القرص ومتجاهَل في git", () => {
    const bad: string[] = [];
    for (const { name, src } of files) {
      for (const p of literalPaths(src)) {
        if (p.startsWith("..")) continue; // مسارات نسبية مش من جذر الريبو
        // اللي مش موجود أصلًا مش شغلنا — الاختبار نفسه هيسقط عليه.
        // اللي بيخدع هو **الموجود محليًا والمتجاهَل**.
        if (!fs.existsSync(path.join(ROOT, p))) continue;
        if (!tracked(p)) bad.push(`${name} → ${p}`);
      }
    }
    expect(
      bad,
      "ملفات دي موجودة عندك ومتجاهَلة في git — هتسقط في CI على نسخة نضيفة:\n" + bad.join("\n"),
    ).toEqual([]);
  });
});
