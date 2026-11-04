/**
 * `monitor.sh` لازم يخلص لما يتشغّل من **طرفية مفتوحة** (stdin مابيقفلش).
 *
 * 🔴 العطل اللي الاختبار ده موجود عشانه (اتكشف ٤ نوفمبر ٢٠٢٦):
 * `docker compose exec -T` بيوصّل stdin للحاوية ويفضل مستنيه يقفل **بعد** ما
 * الأمر الجوّاني يخلص. وكرون stdin بتاعه `/dev/null` فبيقفل فورًا — إنما من
 * الشِل بإيدك الطرفية عمرها ما بتقفل، فالمراقبة **بتعلّق عند فحص الداتابيز
 * (فحص ٥) للأبد** والفحوص من ٦ لـ١١ مابتشتغلش: القرص · عمر النسخة المحلية ·
 * أرشيف المرفوعات · الرفع على درايف · TURN · Push · الشهادة.
 *
 * والعطل كان **مخفيًا شهرًا** لأن الإنتاج (كرون) سليم — المكسور هو **الأداة
 * اللي بنتحقق بيها**، وهي اللي بنحكم بناتجها على كل حاجة تانية.
 *
 * والحكم هنا على **سلوك السكربت**: بيتشغّل بـstdin مفتوح (نفس حالة الطرفية
 * بالظبط — أنبوب الوالد مابيتقفلش)، ولازم يخلص ويوصل لآخر فحص.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MONITOR = path.join(ROOT, "scripts/monitor.sh");
const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/**
 * بديل `docker` **بيقرا stdin لحد ما يقفل** في نداءات `exec` — ده بالظبط
 * سلوك `docker compose exec -T`، وهو جوهر العطل. أي بديل مابيقراش stdin
 * **بيعدّي على الكود المكسور** فمايبقاش له معنى.
 */
const DOCKER = `#!/bin/sh
ARGS="$*"
case "$ARGS" in *exec*) cat > /dev/null ;; esac
case "$ARGS" in
  *--services*)        printf 'api\\nbackup\\ncaddy\\ndb\\n' ;;
  *pg_isready*)        : ;;
  *psql*)              echo 10 ;;
  *db-*.dump*)         echo "db-20261103-141950.dump 158815 12" ;;
  *uploads-*.tgz*)     echo "uploads-20261103-141950.tgz 8472789 12" ;;
esac
exit 0
`;

const CURL = `#!/bin/sh
case "$*" in
  *%{http_code}*) echo 200 ;;
  *) echo '{"ok":true}' ;;
esac
exit 0
`;

const OPENSSL = `#!/bin/sh
case "$*" in *x509*) echo "notAfter=$(date -u -d '+200 days' '+%b %e %H:%M:%S %Y GMT')" ;; esac
exit 0
`;

function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-mon-"));
  made.push(dir);
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });
  fs.copyFileSync(MONITOR, path.join(dir, "scripts/monitor.sh"));
  fs.copyFileSync(path.join(ROOT, "scripts/lib/drivemark.sh"), path.join(dir, "scripts/lib/drivemark.sh"));
  // BACKUP_KEY متضبط عشان فحص الرفع على درايف (٧ج) يشتغل كمان، وبلا
  // TURN/VAPID لأن نداءاتهم عندها `< ملف` صريح فمفيش منها خطر على stdin.
  fs.writeFileSync(path.join(dir, ".env.production"),
    "DOMAIN=example.com\nRESEND_KEY=\nALERT_EMAIL=\nBACKUP_KEY=k\n");
  fs.writeFileSync(path.join(dir, "docker-compose.prod.yml"), "services:\n  api: {}\n");
  for (const [n, body] of [["docker", DOCKER], ["curl", CURL], ["openssl", OPENSSL]] as const) {
    fs.writeFileSync(path.join(bin, n), body);
    fs.chmodSync(path.join(bin, n), 0o755);
  }
  return { dir, bin };
}

/** بيشغّل السكربت وسايب stdin **مفتوحًا** — أنبوب الوالد مابيتقفلش، زي الطرفية */
function runOpenStdin(w: { dir: string; bin: string }, ms = 25_000) {
  return new Promise<{ out: string; hung: boolean; code: number | null }>((resolve) => {
    const p = spawn("bash", [path.join(w.dir, "scripts/monitor.sh")], {
      cwd: w.dir,
      env: { ...process.env, PATH: `${w.bin}:${process.env.PATH}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    const t = setTimeout(() => { p.kill("SIGKILL"); resolve({ out, hung: true, code: null }); }, ms);
    p.on("close", (code) => { clearTimeout(t); resolve({ out, hung: false, code }); });
    // **ومفيش `p.stdin.end()` عن قصد** — ده اللي بيعيد إنتاج العطل.
  });
}

describe("المراقبة من طرفية مفتوحة", () => {
  it("🔴 بتخلص ومابتعلّقش عند فحص الداتابيز", async () => {
    const w = world();
    const r = await runOpenStdin(w);
    expect(r.hung, `المراقبة علّقت وstdin مفتوح. اللي طلع:\n${r.out}`).toBe(false);
    // الحكم على **وصولها لآخر فحص** مش على مجرد إنها خرجت: الخروج لوحده
    // ممكن يحصل لأي سبب، والمطلوب إثبات إن الفحوص اللي بعد الداتابيز اشتغلت.
    expect(r.out, "فحص الداتابيز ما اشتغلش").toContain("db:");
    expect(r.out, "فحص القرص ما اشتغلش — يعني وقفت عند الداتابيز").toContain("disk:");
    expect(r.out, "فحص الرفع على درايف ما اشتغلش").toContain("backup:drive");
    expect(r.out, "آخر فحص (الشهادة) ما اشتغلش").toContain("cert:");
  }, 40_000);

  /**
   * الحارس التاني: كل `timeout` معاه `-k`.
   *
   * ليه نصّي مش سلوكي: الإثبات السلوكي محتاج بديل `docker` بيتجاهل SIGTERM،
   * وساعتها `timeout -k 5 30` بيقتله بـSIGKILL بعد **٣٥ ثانية** — اختبار
   * بالدقيقة عشان سطر. و`timeout` بلا `-k` بيبعت SIGTERM للغلاف اللي
   * مابيوصّلهاش لإضافة compose، فيفضل مستني **للأبد** على أمر مدّته ٣٠ ثانية
   * (وده اللي شوفناه حيًّا: `timeout 30 docker compose … pg_isready` عايش
   * بعد دقايق).
   */
  it("كل نداء timeout معاه -k عشان أي docker واقف مايجمّدش الباقي", () => {
    const src = fs.readFileSync(MONITOR, "utf8")
      .split("\n").map((l) => l.replace(/#.*$/, "")).join("\n"); // الحكم على الأوامر بلا تعليقات
    const bare = [...src.matchAll(/\btimeout\s+(-k\s+\d+\s+)?\d+/g)].filter((m) => !m[1]);
    expect(bare.map((m) => m[0]), "فيه timeout بلا -k").toEqual([]);
    expect(src).toContain("timeout -k"); // والحارس مابيعدّيش على ملف مافيهوش timeout خالص
  });

  it("stdin مقفول في أول السكربت", () => {
    const src = fs.readFileSync(MONITOR, "utf8");
    expect(src).toMatch(/^exec < \/dev\/null$/m);
  });
});
