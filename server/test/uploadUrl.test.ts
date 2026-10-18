import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error دالة خالصة بـ JS عادي — مفيش types ولا تبعيات
import { fileUrl } from "../../admin/src/fileUrl.js";

/**
 * **رابط الملف المرفوع لازم يتحلّ على الـ API مش على دومين الصفحة.**
 *
 * `PUBLIC_URL` **فاضي في الإنتاج** (ده الافتراضي في `config.ts`)، فـ
 * `POST /uploads` بيرجّع `/uploads/<اسم>` — رابط **نسبي**. والملفات بيقدّمها
 * الـ API على دومينه، فالرابط ده جوه اللوحة (`admin.kenoz.org`)
 * بيتحلّ على دومين اللوحة، وCaddy بيردّ بصفحة اللوحة نفسها بدل الصورة.
 *
 * **والنتيجة صورة مكسورة من غير أي خطأ** — لا في الكونسول ولا في لوج
 * السيرفر (الطلب رجع ٢٠٠!). حصل فعلًا في ١٨ أكتوبر ٢٠٢٦: صورة الإعلان
 * اترفعت بنجاح وما ظهرتش. والتطبيق مكانش بيقع في ده لأن عنده `toAbs`
 * في `api/client.ts` من الأول — اللوحة هي اللي مكانش عندها.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("رابط الملف المرفوع في اللوحة", () => {
  const API = "https://api.example.com";

  it("🔴 الرابط النسبي بياخد أصل الـ API", () => {
    expect(fileUrl("/uploads/a1b2c3d4.png", API)).toBe(`${API}/uploads/a1b2c3d4.png`);
  });

  it("الرابط الكامل بيعدّي زي ما هو", () => {
    const full = `${API}/uploads/a1b2c3d4.png`;
    expect(fileUrl(full, API)).toBe(full);
    expect(fileUrl("https://cdn.example.com/x.png", API)).toBe("https://cdn.example.com/x.png");
  });

  it("الفاضي بيفضل فاضي، والشرطة الأخيرة في الأصل مابتعملش شرطتين", () => {
    expect(fileUrl("", API)).toBe("");
    expect(fileUrl(undefined as unknown as string, API)).toBe("");
    expect(fileUrl("/uploads/x.png", `${API}/`)).toBe(`${API}/uploads/x.png`);
  });

  /** وضع الديمو: مفيش API، فالرابط النسبي يفضل نسبيًا بدل ما يبقى مكسورًا بأصل فاضي. */
  it("من غير أصل بيرجّع المسار النسبي", () => {
    expect(fileUrl("/uploads/x.png", "")).toBe("/uploads/x.png");
  });
});

/**
 * الحارس: أي `<img>` بيعرض ملفًا مرفوعًا **لازم** يمرّ على المحوّل. من غير
 * ده بيتضاف موضع عرض جديد بصورة مكسورة ومحدش ياخد باله — الصورة بتفشل في
 * سكوت، ومفيش اختبار متصفح بيغطي اللوحة في وضع الـ API.
 */
describe("كل عرض لصورة الإعلان بيمرّ على المحوّل", () => {
  for (const f of ["admin/src/adPreview.jsx", "admin/src/liveAds.jsx"]) {
    it(`${f} — مفيش src={…imageUrl} بلا toAbs`, () => {
      const s = read(f);
      const bad = [...s.matchAll(/src=\{([^}]*)\}/g)]
        .map((m) => m[1].trim())
        .filter((e) => /imageUrl|\burl\b/.test(e) && !e.includes("toAbs("));
      expect(bad, `صور بتتعرض بلا toAbs: ${bad.join(" · ")}`).toEqual([]);
    });
  }

  it("كتالوج الإعلانات في التطبيق بيحوّل الصورة كمان", () => {
    const s = read("src/ads/ads.ts");
    expect(s).toMatch(/imageUrl:\s*c\.imageUrl\s*\?\s*toAbs\(c\.imageUrl\)/);
  });
});
