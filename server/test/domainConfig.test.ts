import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * **اسم الدومين إعداد، مش كود.** النهائي `raachateg.com` (الانتقال اتعمل ١٩
 * أكتوبر ٢٠٢٦)، و`kenoz.org` لسه شغّال جنبه بـ`OLD_DOMAIN`. وأي انتقال بعد كده
 * لازم يبقى تغيير مفتاح واحد (`DOMAIN` في `.env.production`) + DNS + شهادات —
 * مش مطاردة في الملفات. الخطوات في `docs/domain-switch.md`.
 *
 * الحارس ده بيمنع الرجعة: أول ما حد يكتب الدومين بإيده في كود التطبيق، الانتقال
 * يبقى **ناقصًا في سكوت** — الواجهة أو الإيميل يفضلوا بيشاوروا على الدومين
 * القديم بعد ما يبقى مش ملكنا، والمستخدم يضغط رابط ميت.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * دوميناتنا. أي دومين جديد يتضاف هنا **ويفضل القديم** عشان الحارس ما يعمى.
 *
 * 🔴 والقاعدة دي اتكسرت فعلًا في ١٩ أكتوبر ٢٠٢٦: الانتقال لـ`raachateg.com`
 * اتعمل والقايمة فضلت `kenoz.org` لوحده — فالحارس بقى بيحرس دومينًا **مش** اللي
 * التطبيق شغّال عليه، وأي كتابة بالإيد للدومين الجديد كانت تعدّي **في سكوت**.
 * وعشان ما تتكرّرش، الاختبار التالت تحت بيقرا الدومين الشغّال من وظيفة بناء
 * الـAPK ويتأكد إنه مغطّى هنا — فنسيان القايمة بقى بيفشّل الاختبارات.
 */
const OUR_DOMAINS = ["raachateg.com", "kenoz.org"];

/** كود التطبيق بس — الاختبارات والتوثيق بيستخدموا الدومين كمثال عن قصد. */
const APP_DIRS = ["server/src", "src", "admin/src", "public", "mobile"];
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|html|css|json)$/;
const BUILD_DIRS = ["node_modules", "dist", "generated", "build", ".git", ".gradle"];

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (BUILD_DIRS.includes(e.name)) continue;
      // `cap sync` بينسخ بناء الواجهة (اللي فيه عنوان الـ API) جوه مشروع
      // أندرويد — ناتج بناء متجاهل في git، فلو ما اتعدّاش الحارس يسقط على
      // ناتج بناء بدل ما يسقط على كود مكتوب بالإيد. و`public/` بتاعة الريبو
      // نفسها **لازم** تتفحص، فالاستثناء على اللي جوه `assets` بس.
      if (e.name === "public" && dir.includes(path.join("main", "assets"))) continue;
      out.push(...walk(rel));
    } else if (EXT.test(e.name)) out.push(rel);
  }
  return out;
}

/**
 * الحكم على **الكود بعد شيل التعليقات**: تعليق بيشرح من فين جا `appId` لازم
 * يسمّي الدومين (`raachateg.com` بالمقلوب → `com.raachateg`)، وتعليق مش رابط
 * المستخدم بيضغطه. ودرس متكرر — نفس اللي حصل في حارس `Capacitor.Plugins` نفس
 * اليوم: أول نسخة منه سقطت على الملفين **المتصلّحين** لأن تعليقاتهم بتشرح
 * العطل فبتذكر الاسم. و`.json` مابيتلمسش: مافيهوش تعليقات أصلًا، وشيل تعليقات
 * الكتلة منه ممكن يبلع نصًّا حقيقيًا (فيه ملفات lock فيها مئات الروابط).
 */
function codeOf(file: string): string {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/\.json$/.test(file)) return text;
  let out = text;
  if (/\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(file)) {
    out = out.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }
  if (/\.html$/.test(file)) out = out.replace(/<!--[\s\S]*?-->/g, "");
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
      codeOf(f).split("\n").forEach((line, i) => {
        for (const d of OUR_DOMAINS) if (line.includes(d)) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(
      hits,
      `الدومين مكتوب بالإيد — خلّيه من الإعداد (DOMAIN/CORS_ORIGIN/APP_URL):\n  ${hits.join("\n  ")}`,
    ).toEqual([]);
  });

  /**
   * الحارس على الحارس. الدومين الشغّال مكتوب في **وظيفة بناء الـAPK**
   * (`VITE_API_URL` الافتراضي في `.github/workflows/android.yml`) ولازم يكون
   * صح وإلا الـAPK بيكلّم API ميت — ده عطل ١٨ أكتوبر بالظبط (كل نداء بيرجّع
   * ٤٠١ «غير مصرّح»). فهو أضمن مصدر في الريبو لاسم الدومين الحقيقي، على عكس
   * `.env.production.example` اللي مافيهوش غير `example.com` عن قصد.
   */
  it("الدومين اللي الـAPK بيتبني عليه مغطّى في القايمة", () => {
    const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/android.yml"), "utf8");
    const m = wf.match(/'https:\/\/api\.([A-Za-z0-9.-]+)'/);
    expect(m, "مش لاقي VITE_API_URL الافتراضي في وظيفة بناء الـAPK").toBeTruthy();
    expect(
      OUR_DOMAINS,
      `الدومين الشغّال ${m?.[1]} مش في OUR_DOMAINS — الحارس بيحرس دومينًا تاني، فأي كتابة بالإيد للشغّال بتعدّي في سكوت`,
    ).toContain(m![1]);
  });
});
