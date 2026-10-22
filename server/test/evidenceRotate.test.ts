/**
 * تبديل مفتاح سجل أدلة بلاغات إيذاء الأطفال — `set-evidence-key.sh --rotate`.
 *
 * ليه الوضع ده موجود (٢٢ أكتوبر ٢٠٢٦): المفتاح اتعرض في محادثة فاتكشف، فلازم
 * يتبدّل. والسكربت **بيرفض** تبديل مفتاح موجود عن قصد، لأن التبديل بيخلّي كل
 * دليل محفوظ مستحيل يتفتح — وده «إتلاف أدلة» اللي السجل كله موجود عشان يمنعه.
 *
 * 🔴 والبديل السهل («امسحي سطر EVIDENCE_KEY وشغّلي السكربت») هو بالظبط اللي
 * الاختبارات دي موجودة تمنعه: هو بيتخطّى الحارس **في كل الحالات**، فنفس الحركة
 * يوم ما يبقى فيه أدلة بتحرقها. فوضع `--rotate` **بيعدّ الصفوف بنفسه**، والحكم
 * على سلوك السكربت الحقيقي مش على ذاكرة اللي بيشغّله.
 *
 * والاختبارات بتشغّل السكربت فعلًا على مجلد مؤقت ببديل لـ`docker` — نفس نمط
 * `backupDrive.test.ts` و`nginxSite.test.ts`.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/set-evidence-key.sh");
const OLD_KEY = "old-evidence-key-that-leaked-0000000000000000000000";
const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/**
 * بديل `docker`: بيفرّق بالأمر اللي جوّه الحاوية.
 * - `psql` → بيطبع العدّ اللي الاختبار حدّده (أو ناتج بايظ)
 * - `node` → الفحص الإيجابي، بيبلع stdin ويرجّع نجاح
 * - `up`   → إعادة إنشاء الحاوية
 */
function dockerStub(count: string) {
  return `#!/bin/sh
case " $* " in
  *" psql "*) printf '%s' '${count}'; [ -n '${count}' ] && printf '\\n' ;;
  *" node "*) cat >/dev/null; echo "evidence probe ok" ;;
  *" up "*)   echo " + Container rachat-api-1  Started" ;;
esac
exit 0
`;
}

function world(count: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-ev-"));
  made.push(dir);
  const bin = path.join(dir, "bin");
  for (const d of [bin, path.join(dir, "scripts/lib")]) fs.mkdirSync(d, { recursive: true });

  fs.writeFileSync(path.join(dir, ".env.production"), `JWT_SECRET=x\nEVIDENCE_KEY=${OLD_KEY}\nRETENTION=on\n`);
  // السطر ده شرط الفحص القبلي ① (درس RETENTION: المفتاح لازم يوصل للعملية)
  fs.writeFileSync(path.join(dir, "docker-compose.prod.yml"), "services:\n  api:\n    environment:\n      EVIDENCE_KEY: ${EVIDENCE_KEY:-}\n");
  fs.copyFileSync(SCRIPT, path.join(dir, "scripts/set-evidence-key.sh"));
  fs.writeFileSync(path.join(dir, "scripts/lib/evidenceprobe.mjs"), "console.log('ok');\n");

  fs.writeFileSync(path.join(bin, "docker"), dockerStub(count));
  fs.chmodSync(path.join(bin, "docker"), 0o755);
  return { dir, bin };
}

function run(w: { dir: string; bin: string }, args: string[] = []) {
  const r = spawnSync("bash", [path.join(w.dir, "scripts/set-evidence-key.sh"), ...args], {
    cwd: w.dir, encoding: "utf8", input: "", timeout: 60_000,
    env: { ...process.env, PATH: `${w.bin}:${process.env.PATH}` },
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const keyOf = (w: { dir: string }) =>
  (fs.readFileSync(path.join(w.dir, ".env.production"), "utf8").match(/^EVIDENCE_KEY=(.*)$/m)?.[1] ?? "");

describe("تبديل مفتاح سجل الأدلة", () => {
  it("معايرة: الخزنة فاضية فالتبديل بينجح والمفتاح بيتغيّر فعلًا", () => {
    const w = world("0");
    const r = run(w, ["--rotate"]);
    expect(r.code, r.out).toBe(0);
    const k = keyOf(w);
    expect(k).not.toBe(OLD_KEY);
    expect(k.length).toBeGreaterThanOrEqual(40);
    // والمفتاح نفسه **مابيتطبعش** على الشاشة
    expect(r.out).not.toContain(k);
    expect(r.out).not.toContain(OLD_KEY);
  });

  it("🔴 فيه أدلة محفوظة → بيرفض التبديل والمفتاح مابيتغيّرش", () => {
    const w = world("3");
    const r = run(w, ["--rotate"]);
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toMatch(/دليل محفوظ/);
    expect(keyOf(w), "المفتاح ما يتغيّرش والأدلة تفضل قابلة للفتح").toBe(OLD_KEY);
  });

  it.each([["", "ناتج فاضي"], ["abc", "ناتج مش رقم"], ["ERROR: relation does not exist", "خطأ استعلام"]])(
    "🔴 %s → فشل مقفول: وقوف بلا تبديل",
    (count) => {
      // من ناتج مش رقم **مفيش طريق** نفرّق بين «صفر» و«الاستعلام بايظ» — فالوقوف
      // هو الصح. نفس حالة orphan-files: ملفات موجودة + صفر مرجع = مفيش مسح.
      const w = world(count);
      const r = run(w, ["--rotate"]);
      expect(r.code, r.out).not.toBe(0);
      expect(r.out).toMatch(/وقوف بلا تبديل/);
      expect(keyOf(w)).toBe(OLD_KEY);
    },
  );

  it("حارس: من غير --rotate المفتاح الموجود مابيتلمسش (السلوك الأصلي)", () => {
    const w = world("0");
    const r = run(w);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/مش هنبدّله/);
    expect(keyOf(w)).toBe(OLD_KEY);
  });

  it("حارس: --rotate بلا مفتاح موجود بيقول شغّلي بلا --rotate", () => {
    const w = world("0");
    const p = path.join(w.dir, ".env.production");
    fs.writeFileSync(p, "JWT_SECRET=x\n");
    const r = run(w, ["--rotate"]);
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toMatch(/بلا --rotate/);
  });
});
