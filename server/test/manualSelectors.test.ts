/**
 * 🔴 حارس على محدِّدات سكربتات التحقّق اليدوي (`server/test/manual/`).
 *
 * السكربتات دي بتشتغل في الـCI في وظيفة «وضع الـ API» — **مش** في طقم الاختبارات
 * اللي بشغّله قبل كل push. ولوج وظائف الـCI **مش متاح من بيئة Claude** (البلوبات
 * محجوبة في البروكسي)، فالنتيجة إن أي محدِّد بايظ فيها بيفضل مكسورًا في سكوت.
 *
 * وده حصل فعلًا: في تحويل الفصحى (٢٦ أكتوبر) غيّرت ١٩٠ نصًّا في التطبيق وصلّحت
 * ~٤٥ سطر محدِّد في `test/ui/`، ونسيت محدِّدَين في `send-failure.ts` — وواحد منهم
 * غيّرته لـ«ما أُرسِلتش» وهو نصّ **عمره ما كان في التطبيق** (صغته بالقياس بدل ما
 * أنسخه من الشاشة). فالـCI فضل **أحمر أسبوعًا** على ست نشرات، والخطوة الساقطة
 * واحدة في كل مرة، ومحدش خد باله.
 *
 * فالحارس بينقل الحكم من الـCI لطقم السيرفر: أي محدِّد عربي في السكربتات دي
 * لازم يكون نصّه **موجود فعلًا في `src/`**. والشرط «واحد على الأقل من بدائل
 * المحدِّد» مش «كلهم»، لأن فيه محدِّدات قايمة على قايمة احتمالات عن قصد (زرار
 * التخطّي: لاحقًا|تخطّى|ليس الآن…) والتطبيق فيه واحد منهم بس.
 *
 * **والحكم على البدائل العربية وحدها** — البديل الإنجليزي بيتجاهَل عن قصد: السكربت
 * بيشغّل البناء **العربي**، فوجود `wasn't sent` في الكود مابيخلّي الشريط يتلاقى.
 * ولولا الاستثناء ده كان الحارس بيعدّي على نفس العطل اللي اتكتب عشانه (السطر
 * المكسور كان `/ما أُرسِلتش|wasn't sent/` والإنجليزي فيه سليم).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MANUAL = path.join(ROOT, "server/test/manual");
const AR = /[؀-ۿ]/;

/** التشكيل والتطويل بيختلفوا بين المحدِّد والشاشة بلا أي فرق في المعنى. */
const bare = (s: string) => s.replace(/[ً-ْٰـ]/g, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const SRC = walk(path.join(ROOT, "src"))
  .map((p) => fs.readFileSync(p, "utf8"))
  .join("\n");
const SRC_BARE = bare(SRC);

/** شيل التعليقات: `/** … *\/` جوّه تعليق بيتلقّط كأنه regex (وقعت في ده فعلًا). */
function stripComments(code: string) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

type Found = { file: string; line: number; alts: string[] };

function matchersOf(file: string): Found[] {
  const raw = fs.readFileSync(path.join(MANUAL, file), "utf8");
  const found: Found[] = [];
  stripComments(raw)
    .split("\n")
    .forEach((line, i) => {
      // (أ) محدِّدات regex
      for (const m of line.matchAll(/\/([^/\n]{2,200})\/[gimsuy]*/g)) {
        const alts = m[1]
          .split("|")
          .map((a) => a.replace(/[\^$]/g, "").trim())
          .filter((a) => AR.test(a));
        if (alts.length) found.push({ file, line: i + 1, alts });
      }
      // (ب) `getByLabel` بقايمة نصوص — علامات الرسالة في `message-states.ts`
      //     بتتقرا كده (`exact: true`), فمن غير الفرع ده بتنحرف في سكوت كمان.
      const arr = line.match(/\[((?:\s*"[^"]+"\s*,?)+)\]/);
      if (arr) {
        for (const s of arr[1].matchAll(/"([^"]+)"/g)) {
          if (AR.test(s[1])) found.push({ file, line: i + 1, alts: [s[1]] });
        }
      }
    });
  return found;
}

const FILES = ["send-failure.ts", "join-history.ts", "message-states.ts"];

describe("محدِّدات سكربتات التحقّق اليدوي", () => {
  it("السكربتات التلاتة موجودة ومفيهاش محدِّد عربي مش في التطبيق", () => {
    const all = FILES.flatMap(matchersOf);

    // الحارس اللي مابيلاقيش حاجة بيعدّي بلا معنى — ودي غلطة متكرّرة في المشروع.
    expect(all.length, "مفيش ولا محدِّد عربي اتلقط — الاستخراج نفسه بايظ").toBeGreaterThan(8);
    expect(SRC.length, "مقراش كود الواجهة").toBeGreaterThan(10000);

    const stale = all.filter((f) => !f.alts.some((a) => SRC_BARE.includes(bare(a))));
    expect(
      stale.map((f) => `server/test/manual/${f.file}:${f.line} → «${f.alts.join(" | ")}»`),
      "محدِّد بيدوّر على نصّ مش موجود في `src/` — انسخ النصّ من الشاشة زي ما هو",
    ).toEqual([]);
  });

  it("الشريط وزرار إعادة النصّ بالظبط زي `ChatScreen.tsx`", () => {
    // الاتنين دول هما اللي كسروا الـCI، فمثبّتين بأسمائهم مش بالعدّ العام فوق.
    const chat = fs.readFileSync(path.join(ROOT, "src/screens/ChatScreen.tsx"), "utf8");
    expect(chat, "نصّ الشريط اتغيّر في الشاشة").toContain("لم تُرسَل الرسالة");
    expect(chat, "نصّ زرار إعادة النصّ اتغيّر في الشاشة").toContain("أعِد النصّ إلى الحقل");

    // **بعد شيل التعليقات** — النسخة الأولى من الفحص ده كانت بتقرا الملف خامًا
    // و**عدّت على الارتداد**، لأن النصَّين مذكورين في رسائل الفشل وفي التعليق
    // اللي بيشرح العطل. نفس فخّ حارس `Capacitor.Plugins` وحارس `threadNameClass`:
    // التعليق بالضرورة بيسمّي الحاجة اللي بيحذّر منها.
    const script = stripComments(fs.readFileSync(path.join(MANUAL, "send-failure.ts"), "utf8"))
      // ورسائل الفشل كمان بتسمّي النصّ، فالحكم على المحدِّدات وحدها
      .split("\n")
      .filter((l) => l.includes("getByRole") || l.includes(".test(txt)"))
      .join("\n");
    expect(script, "السكربت مش بيدوّر على نصّ الشريط الحالي").toContain("لم تُرسَل");
    expect(script, "السكربت مش بيدوّر على زرار إعادة النصّ الحالي").toContain("أعِد النصّ");
  });
});
