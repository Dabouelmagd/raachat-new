import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * **اسم الدومين إعداد، مش كود.** الدومين الحالي `kenoz.org` **مؤقت**، والانتقال
 * للنهائي لازم يبقى تغيير مفتاح واحد (`DOMAIN` في `.env.production`) + DNS +
 * شهادات — مش مطاردة في الملفات. الخطوات في `docs/domain-switch.md`.
 *
 * الحارس ده بيمنع الرجعة: أول ما حد يكتب الدومين بإيده في كود التطبيق، الانتقال
 * يبقى **ناقصًا في سكوت** — الواجهة أو الإيميل يفضلوا بيشاوروا على الدومين
 * القديم بعد ما يبقى مش ملكنا، والمستخدم يضغط رابط ميت.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");

/** دوميناتنا. أي دومين جديد يتضاف هنا **ويفضل القديم** عشان الحارس ما يعمى. */
const OUR_DOMAINS = ["kenoz.org"];

/** كود التطبيق بس — الاختبارات والتوثيق بيستخدموا الدومين كمثال عن قصد. */
const APP_DIRS = ["server/src", "src", "admin/src", "public", "mobile"];
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|html|css|json)$/;

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "dist", "generated", "build", ".git"].includes(e.name)) continue;
      out.push(...walk(rel));
    } else if (EXT.test(e.name)) out.push(rel);
  }
  return out;
}

describe("اسم الدومين مش مكتوب في الكود", () => {
  it("بيلفّ على كود التطبيق فعلًا (الحارس نفسه مش فاضي)", () => {
    const files = APP_DIRS.flatMap(walk);
    expect(files.length, "مفيش ولا ملف اتفحص — الحارس بيعدّي بلا معنى").toBeGreaterThan(50);
  });

  it("مفيش دومين إنتاج مكتوب بالإيد في كود التطبيق", () => {
    const hits: string[] = [];
    for (const f of APP_DIRS.flatMap(walk)) {
      const text = fs.readFileSync(path.join(ROOT, f), "utf8");
      text.split("\n").forEach((line, i) => {
        for (const d of OUR_DOMAINS) if (line.includes(d)) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(
      hits,
      `الدومين مكتوب بالإيد — خلّيه من الإعداد (DOMAIN/CORS_ORIGIN/APP_URL):\n  ${hits.join("\n  ")}`,
    ).toEqual([]);
  });
});
