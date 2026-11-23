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
const LIB = path.join(ROOT, "scripts/lib/drivemark.sh");
const MONITOR = path.join(ROOT, "scripts/monitor.sh");
const MARK = ".drive-backup-ok";
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
  // الترتيب بالـ mtime مقصود: `locals` بتستخدم `ls -1t`، فالأحدث لازم يكون
  // محدَّدًا بالظبط — من غير كده اختبار التدارك بيحكم على ترتيب عشوائي.
  const files = opts.files ?? [DUMP, TGZ];
  files.forEach((f, i) => {
    const p = path.join(backups, f);
    fs.writeFileSync(p, Buffer.concat([Buffer.from(f), Buffer.from(Array.from({ length: 256 }, (_, i2) => i2))]));
    const t = new Date(Date.now() - (files.length - i) * 86_400_000);
    fs.utimesSync(p, t, t);
  });
  fs.writeFileSync(path.join(dir, ".env.production"), `JWT_SECRET=x\nBACKUP_KEY=${opts.key ?? "test-backup-key"}\n`);
  fs.writeFileSync(path.join(dir, "docker-compose.prod.yml"), "services:\n  backup: {}\n");
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(dir, "scripts/backup-to-drive.sh"));
  fs.copyFileSync(LIB, path.join(dir, "scripts/lib/drivemark.sh"));

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
echo "$sub" >> '${dir}/rclone-calls'
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
  // بديل `sleep`: مابينامش وبيسجّل كل انتظار. التراجع الحقيقي بالدقايق، فبدون
  // البديل ده أي اختبار فشل بياخد ٣ دقايق ويضرب مهلة الاختبار — والأهم إننا
  // بنحكم على **التراجع نفسه** (كام محاولة وكل واحدة استنت قد إيه).
  fs.writeFileSync(path.join(bin, "sleep"), `#!/bin/sh
echo "$1" >> '${dir}/slept'
`);
  for (const f of ["docker", "rclone", "gpg", "sleep"]) fs.chmodSync(path.join(bin, f), 0o755);
  return { dir, bin, backups, drive };
}

/** الانتظارات اللي السكربت طلبها (بالثواني) — دليل التراجع الزمني */
const slept = (w: { dir: string }) =>
  fs.existsSync(path.join(w.dir, "slept"))
    ? fs.readFileSync(path.join(w.dir, "slept"), "utf8").trim().split("\n").filter(Boolean).map(Number)
    : [];
/** عدد نداءات rclone بنوعها — دليل استهلاك الحصة */
const calls = (w: { dir: string }) =>
  fs.existsSync(path.join(w.dir, "rclone-calls"))
    ? fs.readFileSync(path.join(w.dir, "rclone-calls"), "utf8").trim().split("\n").filter(Boolean)
    : [];
/** rclone بيفشل في `rcat` أول `n` مرات وبعدها ينجح — زي ضرب حدّ الاستعلامات */
function rcatFailsTimes(w: { bin: string; dir: string }, n: number) {
  const p = path.join(w.bin, "rclone");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(
    'rcat) mkdir -p "$(dirname "$D/$tgt")"; cat > "$D/$tgt"; exit 0 ;;',
    `rcat) c=$(cat '${w.dir}/rcat-n' 2>/dev/null || echo 0); c=$((c+1)); echo "$c" > '${w.dir}/rcat-n'
       if [ "$c" -le ${n} ]; then cat > /dev/null; exit 1; fi
       mkdir -p "$(dirname "$D/$tgt")"; cat > "$D/$tgt"; exit 0 ;;`));
  fs.chmodSync(p, 0o755);
}
/** rclone بيفشل في `rcat` من النداء رقم `k` وطالع — عشان نستهدف التدارك وحده */
function rcatFailsFrom(w: { bin: string; dir: string }, k: number) {
  const p = path.join(w.bin, "rclone");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(
    'rcat) mkdir -p "$(dirname "$D/$tgt")"; cat > "$D/$tgt"; exit 0 ;;',
    `rcat) c=$(cat '${w.dir}/rcat-n' 2>/dev/null || echo 0); c=$((c+1)); echo "$c" > '${w.dir}/rcat-n'
       if [ "$c" -ge ${k} ]; then cat > /dev/null; exit 1; fi
       mkdir -p "$(dirname "$D/$tgt")"; cat > "$D/$tgt"; exit 0 ;;`));
  fs.chmodSync(p, 0o755);
}

function run(w: ReturnType<typeof world>, args: string[] = [], env: Record<string, string> = {}) {
  const r = spawnSync("bash", [path.join(w.dir, "scripts/backup-to-drive.sh"), ...args], {
    cwd: w.dir, encoding: "utf8", input: "", timeout: 30_000,
    env: { ...process.env, PATH: `${w.bin}:${process.env.PATH}`, DRIVE_FOLDER: "bk", ...env },
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

  it("🔴 بيطبع وقت التشغيلة، و**بـUTC فعلًا** مش بتوقيت السيرفر المحلي", () => {
    const w = world();
    // ليه الاختبار ده: تشغيلتان بتتخطّيا نفس النسخة بتطلّعا **نفس النصّ
    // بالظبط**، فلوج بلا وقت مابيفرّقش بين تشغيلة النهاردة وتشغيلة الأسبوع
    // اللي فات — حصل فعلًا ٢٢ أكتوبر ٢٠٢٦ واضطرينا نسأل `stat`.
    //
    // والحكم على **السلوك** مش على وجود كلمة UTC: منطقة زمنية بعيدة، فلو حد
    // شال `-u` من `date` السطر يطبع توقيت طوكيو ومكتوب جنبه UTC — لوج بيكدب،
    // وده أسوأ من لوج بلا وقت (الواحد بيقراه وقت عطل ويحكم بساعة غلط).
    const r = run(w, [], { TZ: "Asia/Tokyo" });
    expect(r.code, r.out).toBe(0);
    const m = r.out.match(/(\d{4}-\d\d-\d\d) (\d\d):(\d\d):\d\d UTC/);
    expect(m, "مفيش سطر وقت في الناتج").toBeTruthy();
    const printed = Date.parse(`${m![1]}T${m![2]}:${m![3]}:00Z`);
    // هامش دقيقتين يكفي للفرق بين تشغيل السكربت وقراءة الساعة هنا، وأصغر
    // بكتير من أي إزاحة منطقة زمنية (أصغر إزاحة في العالم ١٥ دقيقة).
    expect(Math.abs(printed - Date.now()), `الوقت المطبوع ${m![0]} مش UTC`)
      .toBeLessThan(2 * 60_000);
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

  /**
   * علامة النجاح اللي المراقبة بتفحص عمرها.
   *
   * 🔴 ليه موجودة: من غيرها **مفيش أي تنبيه لو الرفع على درايف وقف** — التوكن
   * يتلغي أو درايف يمتلي، والنسخ المحلية تفضل سليمة والمراقبة تقول تمام، وكرون
   * يكتب الخطأ في لوج محدش بيقراه، وأحدث نسخة على درايف تقدم في سكوت.
   */
  const markOf = (w: ReturnType<typeof world>) =>
    fs.existsSync(path.join(w.dir, MARK)) ? fs.readFileSync(path.join(w.dir, MARK), "utf8").trim() : null;

  it("🔴 بيكتب علامة نجاح بوقتها، وبـUTC فعلًا", () => {
    const w = world();
    expect(run(w, [], { TZ: "Asia/Tokyo" }).code).toBe(0);
    const line = markOf(w);
    expect(line, "مفيش علامة نجاح").toBeTruthy();
    const epoch = Number(line!.split(" ")[0]);
    expect(Number.isInteger(epoch), `أول حقل في العلامة مش رقم: ${line}`).toBe(true);
    // الحكم على الوقت نفسه مش على وجود الكلمة: `date` بلا `-u` بتطلّع توقيت
    // طوكيو والعلامة تبقى بتكدب في عمرها — والمراقبة تحكم بساعة غلط.
    expect(Math.abs(epoch * 1000 - Date.now()), `وقت العلامة مش UTC: ${line}`).toBeLessThan(2 * 60_000);
    expect(line).toContain(DUMP); // ومكتوب فيها اللي اترفع، للقراءة بالعين
  });

  it("🔴 الرفع الفاشل **مابيسيبش** علامة نجاح", () => {
    const w = world();
    fs.writeFileSync(path.join(w.bin, "rclone"), fs.readFileSync(path.join(w.bin, "rclone"), "utf8")
      .replace('rcat) mkdir -p "$(dirname "$D/$tgt")"; cat > "$D/$tgt"; exit 0 ;;',
               'rcat) mkdir -p "$(dirname "$D/$tgt")"; cat > /dev/null; exit 1 ;;'));
    fs.chmodSync(path.join(w.bin, "rclone"), 0o755);
    expect(run(w).code).not.toBe(0);
    // لو العلامة اتكتبت فوق الحارس، كل فشل رفع كان بيسيب علامة طازة
    // والمراقبة تقول تمام على رفع واقف.
    expect(markOf(w), "علامة نجاح على رفع فاشل").toBeNull();
  });

  it("🔴 التشغيلة اللي مفيش فيها جديد **بتجدّد** العلامة (وإلا تنبيه كاذب)", () => {
    const w = world();
    expect(run(w).code).toBe(0);
    fs.rmSync(path.join(w.dir, MARK));
    const r2 = run(w);
    expect(r2.code, r2.out).toBe(0);
    expect(r2.out).toContain("مرفوعة قبل كده");
    // الوصول لدرايف متحقَّق وأحدث نسخة محلية موجودة هناك، فالرفع مش واقف.
    // ولو العلامة على الرفع الجديد وحده، أي يوم النسخة المحلية ما اتجدّدتش فيه
    // (عطل **فحص ٧**) كان هيطلّع تنبيهًا تانيًا على نفس السبب.
    expect(markOf(w), "مفيش علامة بعد تشغيلة ناجحة بلا جديد").toBeTruthy();
  });

  it("--check بيقول عمر آخر رفع ناجح", () => {
    const w = world();
    expect(run(w, ["--check"]).out).toContain("الرفع عمره ما نجح");
    expect(run(w).code).toBe(0);
    // 🔴 المطابقة على **الرقم** مش على جملة «آخر رفع ناجح»: دي موجودة في فرع
    // «مفيش علامة» كمان، فالفحص عليها كان **بيعدّي** على سكربت مابيكتبش علامة
    // خالص (ظهر في ارتداد فعلي). نفس درس «الحالة اللي بتفرّق بين الصح والغلط
    // القريب لازم تكون متفحوصة، وإلا الحارس بيوافق على الاتنين».
    expect(run(w, ["--check"]).out).toMatch(/آخر رفع ناجح: قبل \d+ ساعة/);
  });

  /**
   * 🔴 الثقوب الدائمة — العطل اللي حصل فعلًا (١٠ و١٤ نوفمبر ٢٠٢٦).
   *
   * جوجل ردّت `403 Quota exceeded ... 'Requests per minute' ... consumer
   * 'project_number:202264815644'` (مشروع rclone المشترك، مش مشروعنا). القاعدة
   * عدّت لأنها بتترفع الأول، والمرفوعات أكلت الضربة. و`newest` بتاخد **أحدث
   * ملف وبس**، فتشغيلة بكرة مشيت على نسخة أحدث و**عمرها ما رجعت** — فالفشلة
   * العابرة بقت ثقبًا **دايمًا**، والتنبيه قفل من نفسه تاني يوم والثقب فضل
   * مكانه في سكوت: `uploads-20261109` و`uploads-20261113` ناقصتان من درايف
   * والقاعدة كاملة ١٤ يوم.
   */
  const D1 = "db-20261001-000000.dump";
  const D2 = "db-20261002-000000.dump";
  const D3 = "db-20261003-000000.dump";
  /** درايف فيه D1 بس — فـD2 ثقب وD3 هي الأحدث */
  const withHole = () => {
    const w = world({ files: [D1, D2, D3, TGZ] });
    const d = path.join(w.drive, "bk");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `${D1}.gpg`), "x");
    return w;
  };

  it("🔴 بيتدارك نسخة قديمة ناقصة — الثقب مابقاش دايمًا", () => {
    const w = withHole();
    const r = run(w);
    expect(r.code, r.out).toBe(0);
    // الأحدث لازم توصل، **والناقصة كمان** — دي اللي الكود القديم مكانش بيرجع لها
    expect(onDrive(w)).toContain(`${D3}.gpg`);
    expect(onDrive(w), "النسخة الناقصة ما اتداركتش").toContain(`${D2}.gpg`);
  });

  it("🔴 الفشل العابر بيتعاد بتراجع **بالدقايق** بدل ما يبقى ثقبًا", () => {
    const w = world();
    rcatFailsTimes(w, 1); // أول رفع يفشل زي ضرب الحد، والتاني ينجح
    const r = run(w);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("إعادة المحاولة");
    expect(onDrive(w)).toEqual([`${DUMP}.gpg`, `${TGZ}.gpg`].sort());
    // 🔴 الحكم على **قد إيه استنى**: الحد نفسه «لكل دقيقة»، فإعادة محاولة بعد
    // ثواني بتضرب نفس الحائط — تراجع بالثواني بيبقى شكل إصلاح بلا إصلاح.
    expect(slept(w)[0], `الانتظارات: ${slept(w).join(",")}`).toBeGreaterThanOrEqual(60);
  });

  it("🔴 فشل التدارك **مابيفشّلش** التشغيلة ولا بيلغي العلامة", () => {
    const w = withHole();
    rcatFailsFrom(w, 3); // الأحدث والمرفوعات ينجحوا، والتدارك يفشل
    const r = run(w);
    // ثقب قديم مش انقطاع جاري: لو قلب العلامة هيفضل تنبيه دائم على ملف ممكن
    // يكون اتدوّر محليًا أصلًا — ضجيج بيدرّب الواحد إنه يتجاهل التنبيه.
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("التدارك ما نجحش");
    expect(fs.existsSync(path.join(w.dir, MARK)), "التدارك الفاشل لغى علامة النجاح").toBe(true);
  });

  it("🔴 --check بيسمّي النسخ الناقصة، وبيقول «مفيش ثقوب» لما تكمل", () => {
    const w = withHole();
    const r = run(w, ["--check"]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(D2);
    expect(r.out).not.toContain("مفيش ثقوب");
    // ولما تكمل: نفس الأمر لازم يقول إنها كاملة — وإلا التقرير بيصرخ للأبد
    expect(run(w, [], { CATCHUP_MAX: "9" }).code).toBe(0);
    expect(run(w, ["--check"]).out).toContain("مفيش ثقوب");
  });

  it("🔴 التشغيلة بتسأل درايف **مرة واحدة** — ده استهلاك الحصة نفسه", () => {
    const w = world();
    expect(run(w).code).toBe(0);
    fs.rmSync(path.join(w.dir, "rclone-calls"));
    const r2 = run(w);
    expect(r2.code, r2.out).toBe(0);
    // قبل كده: نداءا `lsf` لكل نسخة لمجرد «هي مرفوعة؟» + نداءين للتنضيف = ٦،
    // وكلها من نفس الحصة اللي بتوقّعنا. دلوقتي قايمة واحدة بتتفحص محليًا.
    const lsf = calls(w).filter((c) => c === "lsf").length;
    expect(lsf, `نداءات rclone: ${calls(w).join(",")}`).toBe(1);
  });

  it("سقف التدارك بيمنع محاولة ١٤ يوم مرة واحدة (وده نفسه بيفجّر الحد)", () => {
    const w = world({ files: [D1, D2, D3, TGZ] }); // التلاتة ناقصة
    const r = run(w, [], { CATCHUP_MAX: "1" });
    expect(r.code, r.out).toBe(0);
    expect(onDrive(w).filter((f) => f.startsWith("db-")).length).toBe(2); // الأحدث + واحدة
    expect(r.out).toContain("التشغيلة الجاية");
  });
});

/**
 * فحص المراقبة على عمر الرفع.
 *
 * الحكم على **سلوك الكتلة نفسها**: بناخد قسم `٧ج` من `monitor.sh` بحدوده
 * ونشغّله ببدائل لـ`fail`/`ok` — فأي ارتداد في الشرط بيبان، والاختبار مش
 * بيعدّي على وجود النصّ في الملف (نفس نمط `deployPrune` و`turnCheck`).
 */
describe("المراقبة: عمر الرفع على درايف", () => {
  const section = () => {
    const src = fs.readFileSync(MONITOR, "utf8");
    const a = src.indexOf("# ٧ج)");
    const b = src.indexOf("# ٨)", a);
    expect(a, "قسم ٧ج مش موجود في monitor.sh").toBeGreaterThan(0);
    expect(b, "قسم ٨ مش موجود بعده").toBeGreaterThan(a);
    const body = src.slice(a, b);
    expect(body).toContain("drive_mark_age_h"); // الكتلة بتنادي الفاحص فعلًا
    return body;
  };

  /** بيشغّل القسم في مجلد مؤقت: `key` = قيمة BACKUP_KEY، و`mark` = محتوى العلامة */
  function runCheck(opts: { key?: string; mark?: string | null } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-drivemon-"));
    made.push(dir);
    fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });
    fs.copyFileSync(LIB, path.join(dir, "scripts/lib/drivemark.sh"));
    fs.writeFileSync(path.join(dir, ".env.production"), `JWT_SECRET=x\nBACKUP_KEY=${opts.key ?? "k"}\n`);
    if (opts.mark != null) fs.writeFileSync(path.join(dir, MARK), opts.mark);
    const script = [
      "set -uo pipefail",
      "MAX_DRIVE_AGE_H=${MAX_DRIVE_AGE_H:-26}",
      'fail() { echo "FAIL $1: $2"; }',
      'ok() { echo "OK $1: $2"; }',
      section(),
    ].join("\n");
    fs.writeFileSync(path.join(dir, "sec.sh"), script);
    const r = spawnSync("bash", [path.join(dir, "sec.sh")], { cwd: dir, encoding: "utf8", timeout: 20_000 });
    return (r.stdout ?? "") + (r.stderr ?? "");
  }

  const mark = (hoursAgo: number) => {
    const t = Math.floor(Date.now() / 1000) - hoursAgo * 3600;
    return `${t} ${new Date(t * 1000).toISOString().slice(0, 19).replace("T", " ")}UTC db-x.dump\n`;
  };

  it("رفع حديث = ✅", () => {
    expect(runCheck({ mark: mark(2) })).toContain("OK backup:drive");
  });

  it("🔴 رفع واقف من يومين = ❌ (ودي الحالة اللي مكانش فيها ولا تنبيه)", () => {
    const out = runCheck({ mark: mark(48) });
    expect(out).toContain("FAIL backup:drive");
    expect(out).toContain("48");
  });

  it("🔴 مفيش علامة خالص مع BACKUP_KEY متضبط = ❌", () => {
    expect(runCheck({ mark: null })).toContain("FAIL backup:drive");
  });

  it("🔴 **الحكم على الوقت المكتوب جوّه الملف مش على mtime**", () => {
    // علامة عمرها يومين اتعمل لها `cp` أو `touch` النهاردة: `mtime` بيبقى
    // اللحظة دي فتبان **طازة** والمراقبة تقول تمام على رفع واقف. والسطر اللي
    // السكربت كتبه مابيكدبش على نفسه.
    const out = runCheck({ mark: mark(48) }); // الملف اتكتب دلوقتي، ومحتواه قديم
    expect(out, "العلامة اتحكم عليها بـmtime بدل محتواها").toContain("FAIL backup:drive");
  });

  it("🔴 علامة مبهدلة مابتتحسبش نجاحًا", () => {
    expect(runCheck({ mark: "ok\n" })).toContain("FAIL backup:drive");
    expect(runCheck({ mark: "" })).toContain("FAIL backup:drive");
  });

  it("🔴 وقت في المستقبل مابيتحسبش نجاحًا", () => {
    const t = Math.floor(Date.now() / 1000) + 86_400;
    expect(runCheck({ mark: `${t} future\n` })).toContain("FAIL backup:drive");
  });

  it("بلا BACKUP_KEY مفيش فحص ومفيش تنبيه (الرفع الخارجي مش متضبط = حالة معروفة)", () => {
    const out = runCheck({ key: "", mark: null });
    expect(out).not.toContain("FAIL");
    expect(out).not.toContain("OK backup:drive");
  });
});
