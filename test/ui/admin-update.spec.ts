import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { parseVersion, VERSION_URL } from "../../admin/src/update.js";

/**
 * حارس **بصمة النسخة** في التحديث التلقائي للوحة.
 *
 * الميزة كلها قايمة على إن البصمة اللي اللوحة مبنية منها (`__BUILD__` محقون
 * وقت البناء) تبقى **نفسها** اللي في `version.txt` اللي السيرفر بيردّ بيه. ولو
 * واحد من الاتنين غاب — الـ `define` اتشال، أو الملف ما اتكتبش، أو
 * `viteSingleFile` دمجه جوه الملف الواحد — الميزة **تسكت من غير أي خطأ**
 * واللوحة تقعد على نسخة قديمة بعد كل نشر ومحدش ياخد باله.
 *
 * فالفحص على **ناتج البناء الحقيقي** مش على نص بنكتبه في الاختبار، لأن الحاجة
 * اللي بتتغيّر هي ناتج Vite. (ودي بالظبط اللي كشفت إن أول نسخة من الميزة —
 * منقولة من التطبيق وبتقارن اسم ملف الـ JS — مستحيل تشتغل على اللوحة أصلًا:
 * بناء اللوحة ملف واحد ومفيش فيه `<script src>` خالص.)
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const DIST = path.join(ROOT, "admin/dist");
const INDEX = path.join(DIST, "index.html");
const VERSION = path.join(DIST, "version.txt");

test.describe("بصمة نسخة اللوحة", () => {
  test.skip(!fs.existsSync(INDEX), "محتاجة بناء لوحة الإدارة: cd admin && npx vite build");

  test("version.txt موجود في الناتج وبصمته صالحة", () => {
    expect(fs.existsSync(VERSION), `${VERSION_URL} ما اتكتبش في الناتج — اللوحة مش هتعرف إن فيه نشرة جديدة`).toBe(true);
    const v = parseVersion(fs.readFileSync(VERSION, "utf8"));
    expect(v, "البصمة مش سطر قصير صالح").not.toBeNull();
  });

  test("ونفس البصمة محقونة جوه الحزمة الشغّالة", () => {
    // ده الطرف التاني من المقارنة. لو `define: __BUILD__` اتشال من
    // vite.config.js، `buildId()` بترجّع null والفحص بيرجع من غير ما يقارن حاجة.
    const v = fs.readFileSync(VERSION, "utf8").trim();
    const html = fs.readFileSync(INDEX, "utf8");
    expect(html, "البصمة مش موجودة جوه الملف الواحد — الـ define مش بيوصل للحزمة")
      .toContain(`"${v}"`);
  });

  test("بناء جديد = بصمة جديدة", () => {
    // بناء وضع الـ API اتعمل في خطوة منفصلة، فبصمته لازم تختلف — وإلا البصمة
    // مش بتتغيّر مع النشرات والميزة مابتكتشف حاجة أبدًا.
    const other = path.join(ROOT, "admin/dist-api/version.txt");
    test.skip(!fs.existsSync(other), "محتاجة بناء وضع الـ API كمان");
    expect(fs.readFileSync(other, "utf8").trim()).not.toBe(fs.readFileSync(VERSION, "utf8").trim());
  });

  test("ردّ HTML مكان البصمة بيترفض (مفيش لفة إعادة تحميل)", () => {
    // لو `version.txt` مش موجود وسيرفر الملفات ردّ بـ`index.html` بدلًو، النص
    // بيبقى صفحة كاملة — ومختلفة عن بصمتنا دايمًا، فكل فحص يقول «فيه نشرة
    // جديدة» وتدخل اللوحة في لفة reload. الرفض هنا هو اللي بيمنع ده.
    expect(parseVersion(fs.readFileSync(INDEX, "utf8"))).toBeNull();
    expect(parseVersion("<!doctype html><html><body>x</body></html>")).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("  mh2k9x1  ")).toBe("mh2k9x1"); // المسافات والسطر الجديد بيتشالوا
  });
});
