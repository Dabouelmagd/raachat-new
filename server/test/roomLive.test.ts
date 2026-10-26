/**
 * تمييز الغرفة الصوتية الحيّة — حوارس نصّية.
 *
 * الدليل الحقيقي على السلوك في `test/ui/rooms-live.spec.ts` بقياس **وزن الخط
 * المحسوب** في المتصفح. الحوارس هنا بتمنع الارتداد الصامت: مصدر متفرّق تاني،
 * أو فاضية ترجع بولد، أو بيانات ديمو مالهاش غرفة فاضية تفرّق، أو بناء التمييز
 * على حقل `speaking` الميت.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** الحكم على الكود بعد شيل التعليقات — التعليق بيشرح العطل فبيسمّيه بالضرورة */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const SCREENS = ["src/screens/RoomsScreen.tsx", "src/screens/ChatsScreen.tsx"];

describe("شكل الغرفة الحيّة", () => {
  it("🔴 الحيّة بولد والفاضية **من غير بولد**", () => {
    const src = read("src/components/roomLive.tsx");
    const m = src.match(/count > 0 \? "([^"]+)" : "([^"]+)"/);
    expect(m, "شكل `roomNameClass` اتغيّر — صلّحي الحارس مع الكود").toBeTruthy();
    const [, hot, cold] = m!;
    expect(hot, "اللي فيها ناس لازم بولد").toMatch(/font-(extra)?bold/);
    expect(cold, "والفاضية ممنوعة تبقى بولد بأي درجة — ده الفرق كله").not.toMatch(
      /font-(semi|extra)?bold/,
    );
  });

  /**
   * الاسم بيتعرض في شاشتين، وكان `font-bold` دايمًا في الاتنين. لو شاشة رجعت
   * تكتب شكلها بنفسها، الفرق يختفي من عندها في سكوت.
   */
  it("🔴 الشاشتان بتاخدان الشكل من المصدر الواحد", () => {
    for (const f of SCREENS) {
      const s = code(f);
      // الفحص على **النداء** مش على وجود الاسم: سطر الاستيراد بيفضل موجود
      // وهو مش مستخدَم، فـ`includes` بتعدّي على الارتداد (درس ٢٦ أكتوبر).
      expect(s, `${f}: لازم ينادي roomNameClass`).toMatch(/roomNameClass\(/);
      expect(s, `${f}: ولازم يعرض الشارة`).toMatch(/<LiveBadge/);
    }
  });

  /**
   * 🔴 `RoomParticipant.speaking` حقل **ميت**: السيرفر عمره ما بيضبطه. فالتمييز
   * لو اتبنى عليه، الشارة عمرها ما تظهر في الإنتاج ومفيش ولا خطأ يقول كده —
   * نفس عطل `adsFor("story")`.
   */
  it("🔴 التمييز مبنيّ على الحضور مش على حقل `speaking` الميت", () => {
    expect(code("src/components/roomLive.tsx")).not.toMatch(/\bspeaking\b/);
    const server = fs
      .readdirSync(path.join(ROOT, "server/src/routes"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => read(`server/src/routes/${f}`))
      .join("\n");
    expect(server.length, "مفيش ولا ملف راوت اتقرا — الفحص بلا معنى").toBeGreaterThan(1000);
    expect(
      server,
      "السيرفر بقى بيضبط `speaking` — يبقى ينفع نميّز بالكلام فعلًا، عدّلي التمييز والتعليق",
    ).not.toMatch(/speaking\s*[:=]/);
  });

  /**
   * من غير غرفة فاضية في بيانات الديمو، اختبار المتصفح **مالوش حالة تفرّق**
   * بين الصح والغلط القريب — نفس درس الستوريتين لنفس الحساب.
   */
  it("🔴 بيانات الديمو فيها غرفة فيها ناس وغرفة فاضية", () => {
    const seed = read("src/store/seed.ts");
    const block = seed.slice(seed.indexOf("INITIAL_ROOMS"), seed.indexOf("INITIAL_STORIES"));
    expect(block.length, "كتلة الغرف مالقيتهاش — صلّحي الحارس").toBeGreaterThan(100);
    const empties = block.match(/participants:\s*\[\s*\]/g) ?? [];
    expect(empties.length, "لازم غرفة فاضية واحدة على الأقل").toBeGreaterThanOrEqual(1);
    // ولازم تفضل واحدة فيها ناس عشان المقارنة يكون لها معنى
    expect(block).toMatch(/participants:\s*\[\s*\n\s*\{/);
  });

  /**
   * «٠ مشارك» بيتقرا كأنه عطل — فالفاضية بتقول إنها فارغة صريح.
   *
   * 🔴 والحكم على **النصّ اللي بيترجع للمستخدم** مش على نصّ الملف: النسخة
   * الأولى كانت `toMatch(/فاضية/)` على الملف كله، فلما النصّ اتحوّل للفصحى
   * («فاضية» → «فارغة») الحارس **فضل أخضر** لأن كلمة «فاضية» باقية في
   * التعليقات. تالت مرة يتكرر الفخّ ده (حارس `Capacitor.Plugins` · منع
   * `|| true` في وظيفة الأندرويد) — فأي حارس على نصّ واجهة لازم يقرا
   * **الحرفيّة** مش الملف.
   */
  it("🔴 الفاضية بتقول إنها فارغة صريح — والحكم على الحرفيّة مش على التعليقات", () => {
    const src = code("src/components/roomLive.tsx");
    const m = src.match(/if \(count > 0\)[\s\S]*?return tx\(\s*"([^"]+)"/);
    const empty = src.match(/return tx\(\s*"([^"]+)"[^)]*\);\s*\}\s*$/m);
    expect(m, "فرع «فيها ناس» مالقيتهوش — صلّحي الحارس مع الكود").toBeTruthy();
    expect(empty, "فرع الغرفة الفاضية مالقيتهوش").toBeTruthy();
    expect(empty![1], "الفاضية لازم تقول إنها فارغة صريح").toMatch(/فارغ|فاضي/);
    expect(empty![1], "ومينفعش تبقى نفس نصّ الغرفة اللي فيها ناس").not.toBe(m![1]);
    // وممنوع يبقى «٠ مشارك» في أي صيغة
    expect(empty![1]).not.toMatch(/٠|\b0\b/);
  });
});
