/**
 * **حلقة النسخ الاحتياطي في `docker-compose.prod.yml` — متشغّلة فعلًا مش متقروءة.**
 *
 * الاختبار بياخد نصّ الحلقة من compose نفسه، يشيل `while true`، ويشغّلها مرة
 * واحدة بـ`sh` على مجلدات مؤقتة مع بدائل لـ`pg_dump`/`pg_isready`/`sleep` —
 * فالحكم على **سلوكها** (إيه الملفات اللي طلعت، وقد إيه نامت) مش على شكل
 * النصّ. ودي الطريقة الوحيدة اللي تمسك علّة زي اللي حصلت فعلًا.
 *
 * العلّة (اتصلحت للقاعدة ١٢ أكتوبر وللمرفوعات ١٦ أكتوبر): الأرشيف كان بيتكتب
 * **على الاسم النهائي مباشرة** وفشله بيتبلع بـ`|| echo` — فأرشيف ناقص يتحسب
 * نسخة سليمة **ويزحزح نسخة صح** من الـ ١٤ المحفوظة، والحلقة تنام يوم كامل
 * على الفشل. (`verify-backup.sh` و`monitor.sh` بيكشفوا الأرشيف التالف — إنما
 * الكشف بعد ما النسخة السليمة تروح مابيرجّعهاش.)
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const compose = fs.readFileSync(path.join(ROOT, "docker-compose.prod.yml"), "utf8");

/** جسم الحلقة من compose، بلا `while true; do … done` */
function loopBody() {
  const start = compose.indexOf("while true; do");
  const end = compose.indexOf("\n        done", start);
  expect(start, "مش لاقي حلقة النسخ في compose").toBeGreaterThan(0);
  expect(end, "مش لاقي نهاية الحلقة").toBeGreaterThan(start);
  // `$$` في compose معناها `$` للشِل
  return compose.slice(start + "while true; do".length, end).replace(/\$\$/g, "$");
}

/** بيشغّل الحلقة مرة واحدة ويرجّع الناتج وأسماء الملفات اللي طلعت */
function runOnce(opts: { dumpFails?: boolean; tarFails?: boolean; uploads?: string[] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rachat-backup-"));
  const backups = path.join(dir, "backups");
  const uploads = path.join(dir, "uploads");
  fs.mkdirSync(backups);
  fs.mkdirSync(uploads);
  for (const f of opts.uploads ?? ["avatar.png", "doc.pdf"]) fs.writeFileSync(path.join(uploads, f), "x".repeat(500));

  const stubs = [
    "set -u",
    // بدل ما ننام فعلًا: نطبع المدة عشان نتأكد من فاصل إعادة المحاولة
    'sleep() { echo "SLEPT $1"; }',
    "pg_isready() { return 0; }",
    opts.dumpFails
      ? 'pg_dump() { echo "connection refused" >&2; return 1; }'
      : 'pg_dump() { echo "PGDUMPDATA"; }',
    opts.tarFails ? 'tar() { echo "tar: broken" >&2; return 2; }' : "",
  ].join("\n");

  // ⚠️ `/uploads` لازم يتطابق كـ**مسار كامل** بس: `/backups/uploads-$ts.tgz` فيه
  // نفس الحروف، والاستبدال الساذج كان بيحوّل اسم الأرشيف لمسار مش موجود
  // فالـ`mv` يفشل و«الاختبار» يقول إن compose غلط وهو سليم.
  const body = loopBody()
    .replace(/\/backups(?![\w.-])/g, backups)
    .replace(/\/uploads(?![\w.-])/g, uploads)
    .replace(/\/tmp\/(u?err)/g, path.join(dir, "$1"));

  const r = spawnSync("sh", ["-c", `${stubs}\n${body}`], { encoding: "utf8" });
  const files = fs.readdirSync(backups);
  return { out: (r.stdout || "") + (r.stderr || ""), files, backups };
}

describe("حلقة النسخ الاحتياطي", () => {
  it("النجاح: نسخة قاعدة وأرشيف مرفوعات مقروء، ومفيش ملفات نص-مكتملة", () => {
    const { out, files, backups } = runOnce();
    const dump = files.find((f) => /^db-.*\.dump$/.test(f));
    const tgz = files.find((f) => /^uploads-.*\.tgz$/.test(f));
    expect(dump, "مفيش نسخة قاعدة").toBeTruthy();
    expect(tgz, "مفيش أرشيف مرفوعات").toBeTruthy();
    expect(fs.statSync(path.join(backups, dump!)).size).toBeGreaterThan(0);
    // الأرشيف لازم يبقى **مقروء** مش بس موجود
    expect(spawnSync("tar", ["-tzf", path.join(backups, tgz!)]).status).toBe(0);
    expect(files.filter((f) => f.endsWith(".part")), "ملفات .part فاضلة").toEqual([]);
    expect(out).toContain("ok");
    expect(out, "لازم ينام يوم بعد النجاح").toContain("SLEPT 86400");
  });

  it("فشل المرفوعات: مفيش أرشيف باسم نهائي، والإعادة بعد ربع ساعة مش يوم", () => {
    const { out, files } = runOnce({ tarFails: true });
    // ده قلب العلّة: الأرشيف الفاشل **ماياخدش** الاسم النهائي، فمايزحزحش نسخة سليمة
    expect(files.filter((f) => /^uploads-/.test(f)), "أرشيف فاشل أخد الاسم النهائي").toEqual([]);
    expect(files.filter((f) => f.endsWith(".part"))).toEqual([]);
    expect(out).toContain("uploads FAILED");
    expect(out, "نام يوم كامل على فشل").not.toContain("SLEPT 86400");
    expect(out).toContain("SLEPT 900");
  });

  it("فشل القاعدة: مفيش نسخة قاعدة، والمرفوعات بتتأرشف برضه", () => {
    const { out, files, backups } = runOnce({ dumpFails: true });
    expect(files.filter((f) => /^db-/.test(f)), "نسخة قاعدة فاشلة أخدت الاسم النهائي").toEqual([]);
    expect(files.filter((f) => f.endsWith(".part"))).toEqual([]);
    const tgz = files.find((f) => /^uploads-.*\.tgz$/.test(f));
    expect(tgz, "فشل القاعدة مايمنعش أرشيف المرفوعات").toBeTruthy();
    expect(spawnSync("tar", ["-tzf", path.join(backups, tgz!)]).status).toBe(0);
    expect(out).toContain("db FAILED");
    expect(out).toContain("SLEPT 900");
  });

  it("ومفيش `|| echo` على مسار الحكم في الحلقة", () => {
    // قاعدة الفحوص: `|| echo` على مسار الحكم بيخلّي الفشل ينجح في سكوت.
    // (مسموح في الأسطر اللي بتطبع بس، زي `tail -1 … 2>/dev/null`.)
    const judging = loopBody()
      .split("\n")
      .filter((l) => /\bpg_dump\b|\btar -czf\b|\bmv \b/.test(l));
    for (const l of judging) expect(l, `سطر حكم فيه || echo: ${l.trim()}`).not.toMatch(/\|\|\s*echo/);
  });
});
