/**
 * رفع النسخ الاحتياطية على جوجل درايف (قرار داليا ٢١ أكتوبر ٢٠٢٦).
 *
 * الاختبارات **بتشغّل السكربت فعلًا** على مجلدات مؤقتة ببدائل لـ`docker`
 * و`rclone` و`gpg` — فالحكم على **سلوكه** (إيه اللي اترفع، واتشفّر ولا لأ،
 * وإيه اللي اتشال) مش على شكل النصّ. نفس نمط `nginxSite.test.ts`.
 *
 * 🔴 وأهم اختبار هنا هو «gpg اللي مابيشفّرش»: لو التشفير عدّى البيانات زي ما
 * هي، فحص البصمة بعد التنزيل **بيعدّي** (الأصل = الناتج) — والنتيجة إن قاعدة
 * البيانات كلها، وفيها سجل أدلة بلاغات إيذاء الأطفال، بترفع **خام** على سيرفر
 * طرف تالت خارج مصر و✅ بتتطبع. ودي الحالة اللي فحص البصمة لوحده أعمى عنها.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/backup-to-drive.sh");
const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const DUMP = "db-20261021-040000.dump";
const TGZ = "uploads-20261021-040000.tgz";

/**
 * بديل gpg حقيقي الدورة: `base64` ذهابًا و`base64 -d` إيابًا.
 *
 * 🔴 أول نسخة استخدمت `rev` — و**علّقت الاختبار** على محتوى عربي: `rev`
 * بيشتغل على **المحارف** مش البايتات وبيتعثّر في UTF-8 حسب اللوكال. والنسخ
 * الحقيقية ملفات ثنائية أصلًا، فالبديل لازم يكون byte-safe.
 */
const GPG_REAL = `#!/bin/sh
mode=pass
for a in "$@"; do [ "$a" = "--decrypt" ] && mode=dec; done
if [ "$mode" = dec ]; then base64 -d; else base64; fi
`;
/** بديل gpg **مكسور**: بيعدّي البيانات زي ما هي (الثقب الصامت) */
const GPG_NOOP = `#!/bin/sh
cat
`;

function world(opts: { gpg?: string; key?: string; files?: string[] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-drive-"));
  made.push(dir);
  const bin = path.join(dir, "bin");
  const backups = path.join(dir, "backups"); // جوّه «الحاوية»
  const drive = path.join(dir, "drive"); // «جوجل درايف»
  for (const d of [bin, backups, drive, path.join(dir, "scripts")]) fs.mkdirSync(d, { recursive: true });

  // محتوى **ثنائي** زي النسخ الحقيقية (pg_dump و tar) — مش نصّ
  for (const f of opts.files ?? [DUMP, TGZ]) {
    fs.writeFileSync(path.join(backups, f), Buffer.concat([Buffer.from(f), Buffer.from(Array.from({ length: 256 }, (_, i) => i))]));
  }
  fs.writeFileSync(path.join(dir, ".env.production"), `JWT_SECRET=x\nBACKUP_KEY=${opts.key ?? "test-backup-key"}\n`);
  fs.writeFileSync(path.join(dir, "docker-compose.prod.yml"), "services:\n  backup: {}\n");
  fs.copyFileSync(SCRIPT, path.join(dir, "scripts/backup-to-drive.sh"));

  // docker: بيحوّل `compose … exec -T backup <أمر>` لتنفيذ على مجلد النسخ المحلي
  // بيحوّل `compose … exec -T backup <أمر>` لتنفيذ على مجلد النسخ المحلي:
  // بيرمي كل حاجة لحد `exec`، وبيبدّل `/backups` بالمسار الحقيقي وينفّذ.
  fs.writeFileSync(path.join(bin, "docker"), `#!/bin/sh
while [ $# -gt 0 ]; do case "$1" in exec) shift; break;; *) shift;; esac; done
[ "$1" = "-T" ] && shift
shift
if [ "$1" = "sh" ]; then shift; [ "$1" = "-c" ] && shift; fi
eval "$(printf '%s' "$*" | sed 's#\\(^\\| \\)/backups/#\\1${backups}/#g')"
`);
  fs.writeFileSync(path.join(bin, "rclone"), `#!/bin/sh
D='${drive}'
sub="$1"; shift
tgt=$(printf '%s' "$1" | sed 's#^[^:]*:##')
case "$sub" in
  lsd) exit 0 ;;
  lsf) [ -d "$D/$tgt" ] && (cd "$D/$tgt" && ls -1 2>/dev/null) || { [ -f "$D/$tgt" ] && basename "$tgt"; } ; exit 0 ;;
  lsl) [ -d "$D/$tgt" ] && (cd "$D/$tgt" && ls -1 2>/dev/null) ; exit 0 ;;
  rcat) mkdir -p "$(dirname "$D/$tgt")"; cat > "$D/$tgt"; exit 0 ;;
  cat) cat "$D/$tgt" ; exit 0 ;;
  deletefile) rm -f "$D/$tgt" ; exit 0 ;;
esac
exit 0
`);
  fs.writeFileSync(path.join(bin, "gpg"), opts.gpg ?? GPG_REAL);
  for (const f of ["docker", "rclone", "gpg"]) fs.chmodSync(path.join(bin, f), 0o755);
  return { dir, bin, backups, drive };
}

function run(w: ReturnType<typeof world>, args: string[] = []) {
  const r = spawnSync("bash", [path.join(w.dir, "scripts/backup-to-drive.sh"), ...args], {
    cwd: w.dir, encoding: "utf8", input: "", timeout: 30_000,
    env: { ...process.env, PATH: `${w.bin}:${process.env.PATH}`, DRIVE_FOLDER: "bk" },
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const onDrive = (w: ReturnType<typeof world>) => {
  const d = path.join(w.drive, "bk");
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};

describe("رفع النسخ على جوجل درايف", () => {
  it("معايرة: السكربت موجود والبدائل شغّالة", () => {
    const w = world();
    const r = run(w, ["--check"]);
    expect(r.code, r.out).toBe(0);
  });

  it("🔴 بيرفع القاعدة والمرفوعات، ومشفّرتين — واللي على درايف مش النصّ الخام", () => {
    const w = world();
    const r = run(w);
    expect(r.code, r.out).toBe(0);
    expect(onDrive(w)).toEqual([`${DUMP}.gpg`, `${TGZ}.gpg`].sort());

    const raw = fs.readFileSync(path.join(w.backups, DUMP));
    const up = fs.readFileSync(path.join(w.drive, "bk", `${DUMP}.gpg`));
    expect(up.equals(raw), "اللي على درايف هو نفس الملف الخام").toBe(false);
    expect(up.toString("binary")).not.toContain(DUMP); // ولا حتى الاسم جوّه خام
    expect(r.out).toContain("متحقَّقة");
  });

  it("🔴 gpg اللي مابيشفّرش بيتمسك **قبل** أي رفع", () => {
    const w = world({ gpg: GPG_NOOP });
    const r = run(w);
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain("مش تشفير");
    // والأهم: مفيش حاجة خام وصلت درايف
    expect(onDrive(w)).toEqual([]);
  });

  it("بلا BACKUP_KEY بيقف ومابيرفعش", () => {
    const w = world({ key: "" });
    const r = run(w);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("BACKUP_KEY");
    expect(onDrive(w)).toEqual([]);
  });

  it("مابيرفعش نفس النسخة مرتين", () => {
    const w = world();
    expect(run(w).code).toBe(0);
    const r2 = run(w);
    expect(r2.code, r2.out).toBe(0);
    expect(r2.out).toContain("مرفوعة قبل كده");
  });

  it("🔴 بيشيل الأقدم ويسيب آخر KEEP لكل نوع", () => {
    const w = world();
    const d = path.join(w.drive, "bk");
    fs.mkdirSync(d, { recursive: true });
    for (let i = 1; i <= 6; i++) fs.writeFileSync(path.join(d, `db-2026100${i}-000000.dump.gpg`), "x");
    const r = spawnSync("bash", [path.join(w.dir, "scripts/backup-to-drive.sh")], {
      cwd: w.dir, encoding: "utf8", input: "", timeout: 30_000,
      env: { ...process.env, PATH: `${w.bin}:${process.env.PATH}`, DRIVE_FOLDER: "bk", KEEP: "3" },
    });
    expect(r.status, (r.stdout ?? "") + (r.stderr ?? "")).toBe(0);
    const left = fs.readdirSync(d).filter((f) => f.startsWith("db-")).sort();
    expect(left.length).toBe(3);
    // الأحدث (اللي لسه اترفعت) لازم تكون موجودة، والأقدم اتشالت
    expect(left).toContain(`${DUMP}.gpg`);
    expect(left).not.toContain("db-20261001-000000.dump.gpg");
  });

  it("🔴 فشل الرفع مابيسيبش نصّ ملف على درايف", () => {
    const w = world();
    // rclone بيفشل في rcat بس — زي انقطاع في النص
    fs.writeFileSync(path.join(w.bin, "rclone"), fs.readFileSync(path.join(w.bin, "rclone"), "utf8")
      .replace('rcat) mkdir -p "$(dirname "$D/$tgt")"; cat > "$D/$tgt"; exit 0 ;;',
               'rcat) mkdir -p "$(dirname "$D/$tgt")"; head -c 5 > "$D/$tgt"; exit 1 ;;'));
    fs.chmodSync(path.join(w.bin, "rclone"), 0o755);
    const r = run(w);
    expect(r.code).not.toBe(0);
    expect(onDrive(w)).toEqual([]);
  });

  it("🔴 ملف وصل مختلف عن الأصل بيتشال ومابيتحسبش نجاحًا", () => {
    const w = world();
    // الرفع بينجح بس اللي بيترجع ناقص — أسوأ حالة: نسخة شكلها موجودة ومش بترجع
    fs.writeFileSync(path.join(w.bin, "rclone"), fs.readFileSync(path.join(w.bin, "rclone"), "utf8")
      .replace('cat) cat "$D/$tgt" ; exit 0 ;;', 'cat) head -c 10 "$D/$tgt" ; exit 0 ;;'));
    fs.chmodSync(path.join(w.bin, "rclone"), 0o755);
    const r = run(w);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("مختلف عن الأصل");
    expect(onDrive(w)).toEqual([]);
  });
});
