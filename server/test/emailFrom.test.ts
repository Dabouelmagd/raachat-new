/**
 * تبديل مرسِل الإيميلات — `scripts/set-email-from.sh`.
 *
 * 🔴 ليه السكربت ده موجود (٢٢ أكتوبر ٢٠٢٦، بطلب داليا تحويل المرسِل لدومين
 * `raachateg.com`): Resend بترفض أي إيميل من دومين **غير متحقَّق** بـ٤٠٣، فتعديل
 * `EMAIL_FROM` بالإيد لدومين لسه `pending` بيوقّف **كل أكواد التحقق لكل
 * المستخدمين** — والتسجيل معاها لأن SMS موقوف أصلًا — **وتنبيهات `monitor.sh`**
 * كمان (بتستخدم نفس المفتاح والمرسِل). والعطل صامت تمامًا: المستخدم بيشوف
 * «تعذّر إرسال الكود الآن» وبس.
 *
 * والاختبارات بتشغّل السكربت **فعلًا** ببديل لـ`docker`، فالحكم على سلوكه
 * (إيه اللي اتكتب في `.env.production` وإيه اللي اتراجع) مش على شكل نصّه —
 * نفس نمط `evidenceRotate.test.ts` و`backupDrive.test.ts` و`nginxSite.test.ts`.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OLD = "Raa Chat <no-reply@kenoz.org>";
const NEW = "Raa Chat <no-reply@raachateg.com>";
const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/**
 * بديل `docker`: بيفرّق بالمُعاملات.
 * - `RC_DOMAIN=` → فحص الدومين، بكود الخروج اللي الاختبار حدّده
 * - `RC_TEST_TO=` → إرسال إيميل التجربة
 * - `printenv`    → القيمة من ملف البيئة (أو تزييفها لاختبار «ما وصلتش للعملية»)
 * - `up`          → إعادة إنشاء الحاوية
 */
const DOCKER_STUB = `#!/bin/sh
case " $* " in
  *" RC_DOMAIN="*)  cat >/dev/null; echo "   [stub] domain probe"; exit \${RC_STUB_DOMAIN_RC:-0} ;;
  *" RC_TEST_TO="*) cat >/dev/null; echo "   [stub] send probe";   exit \${RC_STUB_SEND_RC:-0} ;;
  *" printenv "*)
    if [ -n "\${RC_STUB_PRINTENV+x}" ]; then printf '%s\\n' "\$RC_STUB_PRINTENV"
    else sed -n 's/^EMAIL_FROM=//p' "\$RC_ENVF" | head -1; fi
    exit 0 ;;
  *" up "*) echo " + Container rachat-api-1  Started"; exit 0 ;;
esac
exit 0
`;

function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-from-"));
  made.push(dir);
  const bin = path.join(dir, "bin");
  for (const d of [bin, path.join(dir, "scripts/lib")]) fs.mkdirSync(d, { recursive: true });

  fs.writeFileSync(path.join(dir, ".env.production"),
    `DOMAIN=raachateg.com\nJWT_SECRET=x\nRESEND_KEY=re_x\nEMAIL_FROM=${OLD}\n`);
  fs.writeFileSync(path.join(dir, "docker-compose.prod.yml"), "services:\n  api:\n    environment:\n      EMAIL_FROM: ${EMAIL_FROM:-}\n");
  fs.copyFileSync(path.join(ROOT, "scripts/set-email-from.sh"), path.join(dir, "scripts/set-email-from.sh"));
  for (const f of ["resendomain.mjs", "emailsend.mjs"]) {
    fs.copyFileSync(path.join(ROOT, "scripts/lib", f), path.join(dir, "scripts/lib", f));
  }
  fs.writeFileSync(path.join(bin, "docker"), DOCKER_STUB);
  fs.chmodSync(path.join(bin, "docker"), 0o755);
  return { dir, bin };
}

type W = { dir: string; bin: string };
/** الإجابات بتتغذّى على stdin بالترتيب اللي السكربت بيسألها بيه */
function run(w: W, args: string[] = [], input = "", env: Record<string, string> = {}) {
  const r = spawnSync("bash", [path.join(w.dir, "scripts/set-email-from.sh"), ...args], {
    cwd: w.dir, encoding: "utf8", input, timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${w.bin}:${process.env.PATH}`,
      RC_ENVF: path.join(w.dir, ".env.production"),
      ...env,
    },
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const fromOf = (w: W) =>
  fs.readFileSync(path.join(w.dir, ".env.production"), "utf8").match(/^EMAIL_FROM=(.*)$/m)?.[1] ?? "";

describe("تبديل مرسِل الإيميلات", () => {
  it("معايرة: دومين متحقَّق + إرسال ناجح + وصل → المرسِل بيتغيّر", () => {
    const w = world();
    const r = run(w, [NEW], "test@example.com\nنعم\n", { RC_STUB_DOMAIN_RC: "0" });
    expect(r.code, r.out).toBe(0);
    expect(fromOf(w)).toBe(NEW);
  });

  it("🔴 الدومين مش متحقَّق → مفيش أي كتابة", () => {
    const w = world();
    const r = run(w, [NEW], "", { RC_STUB_DOMAIN_RC: "2" });
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toMatch(/وقفنا بلا أي تغيير/);
    expect(fromOf(w), "ده اللي بيمنع وقف التسجيل لكل المستخدمين").toBe(OLD);
  });

  it("🔴 مش قادرين نحكم (فشل مقفول) → مفيش أي كتابة", () => {
    const w = world();
    const r = run(w, [NEW], "", { RC_STUB_DOMAIN_RC: "1" });
    expect(r.code, r.out).not.toBe(0);
    expect(fromOf(w)).toBe(OLD);
  });

  /**
   * مفتاح «الإرسال فقط» بيترفض على `/domains` بـ٤٠١ وهو **سليم للإرسال** (ده
   * وضع الإنتاج فعلًا). فالفحص الآلي مستحيل، والحكم بيتحوّل لإقرار بشري من
   * اللوحة — زي `owner-entered` في `set-birthdate.sh`.
   */
  it("🔴 مفتاح مقيّد: «لأ» على الإقرار → مفيش كتابة", () => {
    const w = world();
    const r = run(w, [NEW], "no\n", { RC_STUB_DOMAIN_RC: "3" });
    expect(r.code, r.out).not.toBe(0);
    expect(fromOf(w)).toBe(OLD);
  });

  it("مفتاح مقيّد: إقرار + وصل → بيتغيّر، والناتج بيقول إنه بإقرارها مش بفحص", () => {
    const w = world();
    const r = run(w, [NEW], "نعم\ntest@example.com\nنعم\n", { RC_STUB_DOMAIN_RC: "3" });
    expect(r.code, r.out).toBe(0);
    expect(fromOf(w)).toBe(NEW);
    expect(r.out, "مانقولش «متحقَّق» على حاجة محققناهاش بنفسنا").toMatch(/بإقرارك/);
  });

  it("🔴 الإيميل ماوصلش → تراجع تلقائي للمرسِل القديم", () => {
    const w = world();
    const r = run(w, [NEW], "test@example.com\nno\n", { RC_STUB_DOMAIN_RC: "0" });
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toMatch(/رجعنا للمرسِل القديم/);
    expect(fromOf(w), "ده اللي بيخلّي أسوأ حالة دقيقة بدل عطل مفتوح").toBe(OLD);
  });

  it("🔴 الإرسال نفسه فشل → تراجع تلقائي", () => {
    const w = world();
    const r = run(w, [NEW], "test@example.com\n", { RC_STUB_DOMAIN_RC: "0", RC_STUB_SEND_RC: "1" });
    expect(r.code, r.out).not.toBe(0);
    expect(fromOf(w)).toBe(OLD);
  });

  it("🔴 القيمة ما وصلتش للعملية (درس RETENTION) → تراجع تلقائي", () => {
    const w = world();
    // الحاوية بتقول إن اللي جوّاها لسه القديم — يعني الإعداد ما وصلش
    const r = run(w, [NEW], "", { RC_STUB_DOMAIN_RC: "0", RC_STUB_PRINTENV: OLD });
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toMatch(/ما وصلتش للعملية/);
    expect(fromOf(w)).toBe(OLD);
  });

  it("‏--check مابيكتبش حاجة", () => {
    const w = world();
    const r = run(w, ["--check"], "", { RC_STUB_DOMAIN_RC: "3" });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(OLD);
    expect(fromOf(w)).toBe(OLD);
  });

  it.each([
    ["no-at-sign.example.com", "مفيش @"],
    ["a@b@c.com", "أكتر من @"],
    ["x@localhost", "دومين بلا نقطة"],
  ])("مرسِل غلط (%s) → رفض قبل أي فحص أو كتابة", (bad) => {
    const w = world();
    const r = run(w, [bad], "", { RC_STUB_DOMAIN_RC: "0" });
    expect(r.code, r.out).not.toBe(0);
    expect(fromOf(w)).toBe(OLD);
  });

  it("نفس المرسِل الحالي → بيقول مفيش حاجة تتغيّر ومابيعملش إعادة تشغيل", () => {
    const w = world();
    const r = run(w, [OLD], "", { RC_STUB_DOMAIN_RC: "0" });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/مضبوط أصلًا/);
    expect(r.out).not.toMatch(/Started/);
  });
});
