/**
 * فلتر الكلمات الممنوعة: فحص القايمة قبل الضبط (`scripts/lib/bannedcheck.mjs`)
 * والفحص الإيجابي جوه الكونتينر (`scripts/lib/bannedprobe.mjs`).
 *
 * الخلفية: `assertClean` منادى في ١٥ موضع، بس `BANNED_WORDS` مكانش في
 * `environment:` بتاعة الـ api — فالقايمة بتوصل فاضية و`contentFilter.ts` بيرجع
 * من غير ما يفحص حرف **في سكوت**، وسياسة الخصوصية (بند ١١) بتوعد العميل بمرشّح
 * آلي. السطر اتضاف في ١٤ أكتوبر ٢٠٢٦، والملفين دول هما اللي بيمنعوا رجوع العطل
 * بشكل تاني: **قايمة فاضية** أو **قايمة بتحجب كلامًا سليمًا**.
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertClean, norm as serverNorm } from "../src/lib/contentFilter.js";
import { INNOCENT, MIN_LEN, falsePositives, norm, parseList } from "../../scripts/lib/bannedcheck.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ctx = (BANNED_WORDS: string) => ({ config: { BANNED_WORDS } }) as never;

/** cwd = مجلد السيرفر عشان `tsx` يتحلّ من تبعياته (مش موجود في جذر الريبو) */
const run = (args: string[], env: Record<string, string> = {}, stdin?: string) =>
  new Promise<{ code: number; out: string }>((resolve) => {
    const child = execFile("node", args, { encoding: "utf8", env: { ...process.env, ...env }, cwd: path.join(ROOT, "server") },
      (err, stdout, stderr) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr }));
    if (stdin !== undefined) { child.stdin!.write(stdin); child.stdin!.end(); }
  });
const CHECK = path.join(ROOT, "scripts/lib/bannedcheck.mjs");

/** زي `run` بس بيحذف متغيرًا من البيئة خالص (مش يفضّيه) — الفرق بين الحالتين مهم */
const runWithout = (drop: string, args: string[], env: Record<string, string>, stdin?: string) => {
  const clean = { ...process.env, ...env } as Record<string, string | undefined>;
  delete clean[drop];
  return new Promise<{ code: number; out: string }>((resolve) => {
    const child = execFile("node", args, { encoding: "utf8", env: clean as NodeJS.ProcessEnv, cwd: path.join(ROOT, "server") },
      (err, stdout, stderr) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr }));
    if (stdin !== undefined) { child.stdin!.write(stdin); child.stdin!.end(); }
  });
};

describe("تطبيع الكلمات", () => {
  it("فحص القايمة بيستخدم **نفس** تطبيع السيرفر — لو اختلفوا الفحص يبقى بيفحص حاجة تانية", () => {
    for (const s of ["الأَحْمَر", "مــدرسة", "نهايه", "عـلى", "ABCd"]) {
      expect(norm(s)).toBe(serverNorm(s));
    }
  });
});

describe("فحص القايمة قبل الضبط", () => {
  it("بيرفض الكلمة الأقصر من الحد — دي بتطابق كلام سليم كتير", () => {
    const { words, problems } = parseList("في\nعلى\nكلمةطويلةكفاية");
    expect(words).toEqual(["كلمهطويلهكفايه"]);
    expect(problems.some((p) => p.includes(`أقصر من ${MIN_LEN}`))).toBe(true);
  });

  it("بيكشف المكرّر بعد التطبيع والمتداخل", () => {
    const { words, problems } = parseList("إهانة\nاهانه\nاهانهكبيره");
    expect(words).toHaveLength(1); // التانية مكرّرة والتالتة متداخلة
    expect(problems.some((p) => p.includes("مكرّرة"))).toBe(true);
    expect(problems.some((p) => p.includes("متداخلة"))).toBe(true);
  });

  it("بيتجاهل التعليقات والفواصل والأسطر الفاضية", () => {
    const { words } = parseList("# تعليق\n\nكلمهاولى, كلمهتانيه\n  كلمهتالته  \n");
    expect(words).toEqual(["كلمهاولي", "كلمهتانيه", "كلمهتالته"]);
  });

  it("**بيكشف القايمة اللي بتحجب كلامًا سليمًا** — وده أهم فحص فيهم", () => {
    // «مدرسه» كلمة عادية — لو دخلت القايمة بالغلط تحجب «البنت في المدرسة»
    const { words } = parseList("مدرسه\nكلمهمسيئهجدا");
    const hits = falsePositives(words);
    expect(hits.length).toBeGreaterThan(0);
    // وقايمة نظيفة مابتطابقش ولا جملة
    expect(falsePositives(["كلمهمسيئهجدا", "اهانهصريحه"])).toEqual([]);
  });

  it("جُمل الفحص السليمة فيها عربي وإنجليزي والمصايد الحقيقية", () => {
    expect(INNOCENT.length).toBeGreaterThanOrEqual(20);
    expect(INNOCENT.some((s) => /hello/i.test(s))).toBe(true);
    // مصايد اتكشفت وقت تجهيز أول مسوّدة: كلمة شكلها مسيئة وهي جوه كلام عادي
    for (const trap of ["الجنسية", "كلبه", "متخلف عن السداد", "النصاب", "احتيال", "عنصري"]) {
      expect(INNOCENT.some((s) => s.includes(trap)), `المصيدة «${trap}» اختفت من جُمل الفحص`).toBe(true);
    }
  });

  it("**كلمات الأزمة ممنوعة تدخل الفلتر** — الحجب بيسكّت اللي محتاج يوصل لحد", () => {
    // اللي بيقول «بفكر في الانتحار» محتاج يتكلم، والفلتر لو حجبه بيمنعه في سكوت.
    // الجملة دي في جُمل الفحص عن قصد: أي قايمة فيها «انتحار» بتترفض من الأساس.
    const crisis = INNOCENT.find((s) => s.includes("الانتحار"));
    expect(crisis, "جملة الأزمة اختفت من جُمل الفحص").toBeTruthy();
    expect(falsePositives(parseList("انتحار").words)).not.toEqual([]);
  });
});

describe("السكربت من سطر الأوامر", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rc-bw-"));
  const write = (name: string, body: string) => { const f = path.join(tmp, name); fs.writeFileSync(f, body); return f; };

  it("القايمة السليمة بتطلع مفصولة بفاصلة على stdout", async () => {
    const r = await run([CHECK, write("ok.txt", "# قايمة\nكلمهمسيئهجدا\nاهانهصريحه\n")]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("✅");
  });

  it("**القايمة الفاضية بتترفض** — لأنها معناها فلتر مقفول في سكوت", async () => {
    const r = await run([CHECK, write("empty.txt", "# كله تعليق\n\n")]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/فاضية/);
  });

  it("القايمة اللي بتحجب كلامًا سليمًا بتترفض ومفيش حاجة تتكتب", async () => {
    const r = await run([CHECK, write("fp.txt", "مدرسه\n")]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/بتحجب كلامًا سليمًا/);
  });

  it("الملف المش موجود بيرجّع خطأ واضح", async () => {
    const r = await run([CHECK, path.join(tmp, "nope.txt")]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/مش قادر أقرا/);
  });
});

describe("الفحص جوه الكونتينر (bannedprobe)", () => {
  const probeArgs = ["--input-type=module", "-"];
  const src = fs.readFileSync(path.join(ROOT, "scripts/lib/bannedprobe.mjs"), "utf8");
  // بنوجّهه على فلتر السيرفر المبني لو موجود، وإلا على السورس عبر tsx
  const lib = path.join(ROOT, "server/src/lib/contentFilter.ts");

  it("بينجح لما الفلتر يرفض الممنوع ويعدّي السليم", async () => {
    const r = await run(["--import", "tsx", ...probeArgs],
      { RC_FILTER_LIB: lib, RC_PROBE: "كلمهمسيئهجدا", BANNED_WORDS: "كلمهمسيئهجدا,اهانهصريحه" }, src);
    expect(r.code).toBe(0);
    expect(r.out).toContain("✅");
  });

  it("**بيفرّق بين «مش واصل» و«واصل وفاضي»** — حالتان مختلفتان وإصلاحهما مختلف", async () => {
    // (أ) المتغير مش موجود خالص = السطر ناقص من compose → خطأ (exit 1)
    const missing = await runWithout("BANNED_WORDS", ["--import", "tsx", ...probeArgs],
      { RC_FILTER_LIB: lib, RC_PROBE: "كلمهمسيئهجدا" }, src);
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/مش واصل للعملية/);
    expect(missing.out).toMatch(/docker-compose/);

    // (ب) موجود وفاضي = السطر تمام والقايمة لسه مش متحدّدة → حالة معروفة (exit 2)
    const empty = await run(["--import", "tsx", ...probeArgs],
      { RC_FILTER_LIB: lib, RC_PROBE: "كلمهمسيئهجدا", BANNED_WORDS: "" }, src);
    expect(empty.code).toBe(2);
    expect(empty.out).toMatch(/القايمة فاضية/);
    expect(empty.out).not.toMatch(/مش واصل للعملية/);
  });

  it("بلا كلمة فحص = يطمّن على التوصيل بس (قبل ما القايمة تتحدّد)", async () => {
    const r = await run(["--import", "tsx", ...probeArgs],
      { RC_FILTER_LIB: lib, BANNED_WORDS: "كلمهمسيئهجدا,اهانهصريحه" }, src);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/واصل للعملية/);
    expect(r.out).toContain("2");
  });

  it("بيفشل لو الفلتر رفض جملة سليمة", async () => {
    const r = await run(["--import", "tsx", ...probeArgs],
      { RC_FILTER_LIB: lib, RC_PROBE: "صباح", BANNED_WORDS: "صباح" }, src);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/رفض جملة سليمة/);
  });
});

describe("الفلتر نفسه", () => {
  it("القايمة الفاضية = بيعدّي كل حاجة (ده سبب كل اللي فوق)", () => {
    expect(() => assertClean(ctx(""), "أي كلام مسيء")).not.toThrow();
  });

  it("بيمسك الكلمة ولو فيها تشكيل أو تطويل أو ألف بأشكالها", () => {
    const c = ctx("اهانه");
    expect(() => assertClean(c, "إهانة صريحة")).toThrow();
    expect(() => assertClean(c, "إهـــانة")).toThrow();
    expect(() => assertClean(c, "كلام عادي خالص")).not.toThrow();
  });

  it("بيفحص كل النصوص اللي بتتمرر له مش أولها", () => {
    expect(() => assertClean(ctx("اهانه"), "عنوان نظيف", null, "جوه النص إهانة")).toThrow();
  });
});
