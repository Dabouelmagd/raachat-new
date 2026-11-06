/**
 * رسالة `set-translate-key.sh --off` لازم تقول الحقيقة.
 *
 * 🔴 **القصة (٦ نوفمبر ٢٠٢٦):** السكربت كان بيطبع «✅ الترجمة المدفوعة اتوقفت
 * (التطبيق هيرجع لقاموس العبارات)» — وده كان صحيحًا لحد ٣٠ أكتوبر. وبعد ما
 * الترجمة بقت على خدمة `libretranslate` جوّه شبكة compose، شيل المفتاح المدفوع
 * **مابيوقّفش** الترجمة خالص: هي بتفضل شغّالة بالمجاني. فالرسالة بقت تقول إننا
 * عطّلنا ميزة وهي شغّالة — واللي بيقرأها بيحكم غلط على حالة الإنتاج، وممكن
 * يرجّع مفتاحًا مدفوعًا (وفاتورة) على أساس إن الترجمة وقعت.
 *
 * 🔴 **والفرق اللي الرسالة لازم تمسكه هو فخّ الشرطة من غير نقطتين:** الافتراضي
 * في compose `${LIBRETRANSLATE_URL-http://libretranslate:5000}` — فالسطر
 * **الغايب** من `.env.production` معناه «شغّال بالافتراضي»، و**الفاضي** معناه
 * «إيقاف صريح». فرسالة بتحكم بوجود السطر بدل قيمته بتقلب المعنى.
 *
 * والاختبار بيشغّل السكربت **فعلًا** ببديل لـ`docker`، فالحكم على اللي بيتطبع
 * وعلى اللي بيتكتب في الملف — مش على شكل النصّ (نمط `emailFrom.test.ts`).
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/** بديل `docker`: إعادة التشغيل تنجح وبس — السكربت مش محتاج منه غير ده في `--off`. */
const DOCKER_STUB = `#!/bin/sh
echo " + Container rachat-api-1  Started"
exit 0
`;

/** `ltLine`: السطر اللي يتحطّ في `.env.production` (أو `null` = السطر غايب خالص). */
function run(ltLine: string | null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-troff-"));
  made.push(dir);
  const bin = path.join(dir, "bin");
  for (const d of [bin, path.join(dir, "scripts")]) fs.mkdirSync(d, { recursive: true });

  const env = `DOMAIN=raachateg.com\nJWT_SECRET=x\nGOOGLE_TRANSLATE_KEY=AIzaSomethingSet\n`
    + (ltLine === null ? "" : `${ltLine}\n`);
  fs.writeFileSync(path.join(dir, ".env.production"), env);
  fs.writeFileSync(path.join(dir, "docker-compose.prod.yml"),
    "services:\n  api:\n    environment:\n      LIBRETRANSLATE_URL: ${LIBRETRANSLATE_URL-http://libretranslate:5000}\n");
  fs.copyFileSync(path.join(ROOT, "scripts/set-translate-key.sh"), path.join(dir, "scripts/set-translate-key.sh"));
  fs.writeFileSync(path.join(bin, "docker"), DOCKER_STUB);
  fs.chmodSync(path.join(bin, "docker"), 0o755);

  const r = spawnSync("bash", ["scripts/set-translate-key.sh", "--off"], {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
  return { out: `${r.stdout}${r.stderr}`, code: r.status, envf: fs.readFileSync(path.join(dir, ".env.production"), "utf8") };
}

describe("set-translate-key.sh --off", () => {
  it("بيفضّي المفتاح المدفوع فعلًا", () => {
    const r = run(null);
    expect(r.code, r.out).toBe(0);
    expect(r.envf).toMatch(/^GOOGLE_TRANSLATE_KEY=$/m);
    expect(r.envf).not.toContain("AIzaSomethingSet");
  });

  it("🔴 والسطر غايب (= شغّال بالافتراضي): الرسالة تقول إن الترجمة لسه شغّالة بالمجاني", () => {
    const r = run(null);
    expect(r.out).toMatch(/LibreTranslate|المجاني/);
    expect(r.out, "الرسالة القديمة المضلّلة رجعت — الترجمة مش راجعة للقاموس هنا")
      .not.toMatch(/قاموس العبارات/);
  });

  it("والسطر بقيمة (= المجاني مضبوط صريح): نفس الرسالة", () => {
    const r = run("LIBRETRANSLATE_URL=http://libretranslate:5000");
    expect(r.out).toMatch(/LibreTranslate|المجاني/);
    expect(r.out).not.toMatch(/قاموس العبارات/);
  });

  it("🔴 والسطر فاضي (= إيقاف صريح للمجاني): دي الحالة الوحيدة اللي فيها قاموس العبارات", () => {
    const r = run("LIBRETRANSLATE_URL=");
    expect(r.out, "فاضي معناه مفيش ترجمة آلية خالص — الرسالة لازم تقول كده")
      .toMatch(/قاموس العبارات/);
  });

  it("والفرضية قايمة: compose لسه بيحطّ الافتراضي بالشرطة من غير نقطتين", () => {
    // لو الشكل ده اتغيّر يومًا، معنى «السطر الغايب» بيتغيّر والرسالة تبقى غلط —
    // فالفحص ده بيسقط ويقول إن الفرضية اتغيّرت بدل ما يحرس جملة بقت غلط.
    const compose = fs.readFileSync(path.join(ROOT, "docker-compose.prod.yml"), "utf8");
    expect(compose).toMatch(/LIBRETRANSLATE_URL:\s*\$\{LIBRETRANSLATE_URL-http:\/\/libretranslate:5000\}/);
  });
});
