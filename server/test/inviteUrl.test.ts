/**
 * رابط الدعوة وروابط الصفحات القانونية — **مينفعش يكونوا محليين**.
 *
 * 🔴 العطل اللي الاختبارات دي موجودة عشانه (٢٠ أكتوبر ٢٠٢٦، اتبلّغ بصورة من
 * واتساب): `VITE_SITE_URL` مكانش متضبط في **أي** بناء، فـ`SITE` فاضي
 * و`inviteUrl()` كان بيقع على `location.origin`. على الويب ده سليم، وفي
 * الـAPK أصل Capacitor هو `https://localhost` — فالرسالة اللي بتتبعت لصاحبك
 * فيها رابط **مستحيل يفتح عنده**، ومعاها كل روابط `legal` ميتة جوه التطبيق
 * وشاشة التسجيل بتقول «بالمتابعة أنت توافق على الشروط وسياسة الخصوصية».
 *
 * والعطل **صامت تمامًا**: الرسالة بتتبعت عادي ومفيش أي خطأ في أي مكان —
 * نفس عيلة `firstPublicOrigin` في `senders.ts` بالحرف.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const legalSrc = fs.readFileSync(path.join(ROOT, "src/legal.ts"), "utf8");

/** بيشغّل `inviteUrl` الحقيقية بقيم مختلفة — الحكم على سلوكها مش على نصّها */
function invite(pub: string, site: string, origin: string): string {
  const body = legalSrc
    .replace(/export const SITE =.*$/m, `const SITE = ${JSON.stringify(site)};`)
    .replace(/export const PUBLIC_SITE =.*$/m, `const PUBLIC_SITE = ${JSON.stringify(pub)};`)
    .replace(/export const /g, "const ")
    .replace(/typeof location === "undefined" \? "" : location\.origin/, JSON.stringify(origin));
  const r = spawnSync("node", ["-e", `${body}\nprocess.stdout.write(inviteUrl());`], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}

const APP = "https://app.raachateg.com";
const PUB = "https://raachateg.com";
const APK = "https://localhost";

describe("رابط الدعوة", () => {
  it("🔴 أصل الـAPK المحلي مابيخرجش أبدًا", () => {
    expect(invite("", "", APK)).toBe("");
    expect(invite("", "", "https://localhost:5173")).toBe("");
    expect(invite("", "", "https://127.0.0.1")).toBe("");
  });

  it("الموقع التعريفي أولًا — فيه الشرح وأزرار التنزيل", () => {
    expect(invite(PUB, APP, APK)).toBe(PUB);
  });

  it("من غير موقع تعريفي بيقع على أصل التطبيق، مش على المحلي", () => {
    expect(invite("", APP, APK)).toBe(APP);
  });

  it("على الويب بلا إعداد بيستخدم أصل الصفحة — وهو عام هناك", () => {
    expect(invite("", "", APP)).toBe(APP);
  });

  it("مابيتخدعش باسم بيبدأ بـlocalhost", () => {
    expect(invite("", "", "https://localhost.evil.com")).toBe("https://localhost.evil.com");
  });
});

describe("بناء الـAPK بيضبط الموقعين", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/android.yml"), "utf8");

  it("المتغيّران موجودان في بيئة البناء", () => {
    expect(wf).toMatch(/VITE_SITE_URL:/);
    expect(wf).toMatch(/VITE_PUBLIC_SITE:/);
  });

  it("🔴 الوظيفة بتفشل على أصل محلي أو فيه مسار — متجرَّب بتشغيل الحارس", () => {
    const m = /for v in VITE_SITE_URL VITE_PUBLIC_SITE; do[\s\S]*?\n          done/.exec(wf);
    expect(m, "مش لاقي كتلة الحارس في الوظيفة").toBeTruthy();
    const run = (site: string, pub: string) =>
      spawnSync("sh", ["-c", `set -e\n${m![0]}\necho "$VITE_SITE_URL $VITE_PUBLIC_SITE"`], {
        encoding: "utf8",
        env: { ...process.env, VITE_SITE_URL: site, VITE_PUBLIC_SITE: pub },
      }).status;
    expect(run(APP, PUB), "عنوانان سليمان المفروض يعدّوا").toBe(0);
    expect(run(`${APP}/`, `${PUB}/`), "الشرطة الأخيرة بتتشال مش بتفشّل").toBe(0);
    expect(run(APK, PUB), "أصل محلي لازم يفشل").not.toBe(0);
    expect(run(`${APP}/legal`, PUB), "مسار لازم يفشل").not.toBe(0);
    expect(run("", PUB), "فاضي لازم يفشل").not.toBe(0);
    expect(run(APP, "http://x.com"), "http مش https لازم يفشل").not.toBe(0);
  });
});
