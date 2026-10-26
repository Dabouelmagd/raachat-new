/**
 * شكل «فيه رسايل ما اتقرتش» في قوايم المحادثات — حوارس نصّية.
 *
 * 🔴 السبب (٢٦ أكتوبر ٢٠٢٦، بلاغ داليا «مفيش فرق»): الفرق كان مكتوب في
 * `ChatsScreen` **لوحده**، و«جروباتي» و«قنواتي» كانوا بولد **دايمًا** بلا
 * عدّاد. وكمان الفرق نفسه كان `font-bold` (٧٠٠) مقابل `font-extrabold` (٨٠٠)
 * — **١٠٠ درجة مابتتشاف بالعين**.
 *
 * والدليل الحقيقي على السلوك في المتصفح (`test/ui/unread-ticks.spec.ts` و
 * `test/ui/unread-everywhere.spec.ts`) بقياس **وزن الخط المحسوب**. الحوارس هنا
 * بتمنع الارتداد الصامت: مصدر متفرّق تاني، أو مقروء يرجع بولد، أو بيانات ديمو
 * مالهاش الحالة اللي بتفرّق.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SCREENS = path.join(ROOT, "src/screens");

describe("شكل غير المقروء في القوايم", () => {
  it("🔴 المقروء **من غير بولد** وغير المقروء بولد", () => {
    const src = read("src/components/unread.tsx");
    const m = src.match(/unread \? "([^"]+)" : "([^"]+)"/);
    expect(m, "شكل `threadNameClass` اتغيّر — صلّحي الحارس مع الكود").toBeTruthy();
    const [, hot, cold] = m!;
    expect(hot, "اللي فيه جديد لازم بولد").toMatch(/font-(extra)?bold/);
    expect(cold, "والمقروء ممنوع يبقى بولد بأي درجة — ده كان العطل بالظبط").not.toMatch(
      /font-(semi|extra)?bold/,
    );
  });

  it("‏`truncate text-sm` بيفضلوا — فيه لوكيتورات اختبار عليهم", () => {
    expect(read("src/components/unread.tsx")).toMatch(/truncate text-sm/);
  });

  /**
   * أي شاشة بتفلتر `threads` وبترسم اسمها لازم تاخد الشكل من المصدر الواحد —
   * وإلا شاشة جديدة تطلع بولد دايمًا وتكرّر نفس البلاغ.
   */
  it("🔴 كل شاشة بتعرض أسماء محادثات بتستخدم `threadNameClass`", () => {
    const files = fs.readdirSync(SCREENS).filter((f) => f.endsWith(".tsx"));
    const lists = files.filter((f) => {
      const s = fs.readFileSync(path.join(SCREENS, f), "utf8");
      return s.includes("threads.filter(") && s.includes(".name}");
    });
    // الحارس اللي مابيلفّ على حاجة بيعدّي بلا معنى
    expect(lists.length, "مفيش ولا شاشة اتفحصت — الفلتر بايظ").toBeGreaterThanOrEqual(3);
    // 🔴 الفحص على **النداء** مش على وجود الاسم: أول نسخة كانت
    // `.includes("threadNameClass")` و**عدّت على الارتداد** لأن سطر الاستيراد
    // بيفضل موجود وهو مش مستخدَم — حارس بيحرس حاجة تانية.
    const bad = lists.filter((f) => !/threadNameClass\(/.test(fs.readFileSync(path.join(SCREENS, f), "utf8")));
    expect(bad, "الشاشات دي بتعرض أسماء محادثات بشكل بتاعها").toEqual([]);
  });

  /**
   * من غير جروب وقناة فيهم `unread` في بيانات الديمو، اختبارات المتصفح
   * **مالهاش حالة تفرّق** بين الصح والغلط — نفس درس الستوريتين لنفس الحساب.
   */
  it("🔴 بيانات الديمو فيها جروب وقناة فيهم رسايل ما اتقرتش", () => {
    const seed = read("src/store/seed.ts");
    const rows = seed.split("\n").filter((l) => l.includes("INITIAL_THREADS") === false && l.includes("type:"));
    const withUnread = (kind: string) =>
      rows.filter((l) => l.includes(`type: "${kind}"`) && /unread:\s*[1-9]/.test(l)).length;
    expect(withUnread("group"), "لازم جروب واحد على الأقل فيه جديد").toBeGreaterThanOrEqual(1);
    expect(withUnread("channel"), "ولازم قناة").toBeGreaterThanOrEqual(1);
    // ولازم يفضل واحد **مقروء** عشان المقارنة يكون لها معنى
    expect(
      rows.filter((l) => l.includes('type: "group"') && !/unread:\s*[1-9]/.test(l)).length,
      "ولازم جروب مقروء عشان الاختبار يقارن",
    ).toBeGreaterThanOrEqual(1);
  });
});
