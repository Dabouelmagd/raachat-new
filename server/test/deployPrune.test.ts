/**
 * حوارس على **تنضيف القرص في سكربت النشر** — السيرفر مشترك مع مشاريع تانية،
 * والفرق بين «تنضيف» و«مسح شغل حد تاني» هو فلتر واحد في سطر واحد.
 *
 * ليه اختبار على شكل سكربت: الأوامر دي بتشتغل على السيرفر بس، فمفيش طريقة
 * نفحصها بيها هنا — إنما **الفلاتر** هي كل الحماية، ولو حد شالها بالغلط
 * (أو زوّد `-a` عشان «ينضّف أكتر») التأثير بيبان على مشروع تاني مش علينا،
 * وممكن محدش ياخد باله. فالاختبار بيثبّت النص نفسه.
 *
 * والترتيب محمي كمان: التنضيف **بعد** فحص الصحة — لو النشرة فشلت لازم الصورة
 * القديمة تفضل موجودة عشان نرجع لها.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const sh = fs.readFileSync(path.join(ROOT, "scripts/deploy-rachat.sh"), "utf8");

/** سطور الأوامر الفعلية بس — من غير التعليقات (اللي فيها كلام عن `-a` بالمنع) */
const code = sh
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

/**
 * `-a` بأي شكل — **بما فيه المدموج** زي `-af`.
 * أول نسخة من الاختبار كانت `/\s-a\b/`، و`-af` **عدّت منها** لأن الحدّ `\b`
 * بيفشل والحرف اللي بعد `a` حرف. و`-af` هو بالظبط الشكل اللي حد هيكتبه لو
 * حاول «ينضّف أكتر» — يعني الحارس كان بيحمي من الشكل اللي محدش بيكتبه.
 */
const HAS_ALL = /(?:^|\s)-[a-zA-Z]*a[a-zA-Z]*(?=\s|$)|--all\b/;

describe("تنضيف القرص في سكربت النشر", () => {
  it("تنضيف الصور محدود بوسم رع شات — مش صور المشاريع التانية", () => {
    const line = code.split("\n").find((l) => l.includes("docker image prune"));
    expect(line, "سطر تنضيف الصور مش موجود").toBeTruthy();
    expect(line, "فلتر الوسم اتشال = بنمسح صور مشاريع تانية معلّقة")
      .toMatch(/--filter\s+label=project=rachat/);
    expect(line, "`-a` بيشيل الصور الموسومة غير المستخدمة كمان (مشاريع تانية موقوفة)")
      .not.toMatch(HAS_ALL);
  });

  it("الوسم اللي الفلتر بيعتمد عليه موجود فعلًا في الـ Dockerfiles", () => {
    // من غير الوسم، الفلتر مايطابقش ولا صورة — فالتنضيف يبقى بلا أثر **في سكوت**
    for (const f of ["server/Dockerfile", "Dockerfile.web"]) {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8"), `${f} مفيهوش LABEL project=rachat`)
        .toMatch(/^LABEL project=rachat$/m);
    }
  });

  it("تنضيف كاش البناء على الأقدم من أسبوع بس — والكاش الحديث يفضل للمشاريع التانية", () => {
    const line = code.split("\n").find((l) => l.includes("docker builder prune"));
    expect(line, "سطر تنضيف كاش البناء مش موجود — القرص بيزيد ~١٫٥ جيجا كل نشرة").toBeTruthy();
    expect(line, "بدون `until` بننضّف كاش المشاريع التانية الحديث وبناؤها يبدأ من الصفر")
      .toMatch(/--filter\s+until=\d+h/);
    expect(line, "`-a` بيشيل الكاش المستخدَم كمان — كل بناء بعده من الصفر")
      .not.toMatch(HAS_ALL);
  });

  it("التنضيف كله **بعد** فحص الصحة (عشان الرجوع يفضل ممكن لو النشرة فشلت)", () => {
    const health = code.indexOf("/health");
    const img = code.indexOf("docker image prune");
    const cache = code.indexOf("docker builder prune");
    expect(health).toBeGreaterThan(-1);
    expect(img, "تنضيف الصور قبل فحص الصحة = مفيش صورة نرجع لها").toBeGreaterThan(health);
    expect(cache, "تنضيف الكاش قبل فحص الصحة").toBeGreaterThan(health);
  });

  it("والاتنين جوه حارس `PRUNE` عشان `PRUNE=0` يتخطّاهم فعلًا", () => {
    const i = code.indexOf('"${PRUNE:-1}"');
    expect(i, "حارس PRUNE مش موجود").toBeGreaterThan(-1);
    expect(code.indexOf("docker image prune")).toBeGreaterThan(i);
    expect(code.indexOf("docker builder prune")).toBeGreaterThan(i);
  });
});

/**
 * اختيار اللي يتبني: `site/` ما يبنيش حاجة.
 *
 * 🔴 الموقع التعريفي ملفات ثابتة نجنكس بيقراها من نسخة الريبو — مش جوه أي
 * صورة. والشرط في السكربت «أي حاجة برّه server/ و docs/ و *.md → ابنِ caddy»،
 * فمن غير استثناء `site/` أي تعديل كلمة في الموقع بيعيد بناء الواجهة كلها:
 * دقايق، و~٥ جيجا كاش على سيرفر مشترك، **بلا أي أثر على الناتج**.
 *
 * والحكم بتشغيل الشرط نفسه بـ`sh` على مجموعات ملفات حقيقية — مش على شكل النصّ.
 */
describe("deploy-rachat.sh — اختيار الخدمات", () => {
  const SH = fs.readFileSync(path.join(ROOT, "scripts/deploy-rachat.sh"), "utf8");
  const rule = /grep -qvE '([^']+)' && SVC="\$SVC caddy"/.exec(SH);

  it("الشرط موجود (وإلا الاختبارات تحته بلا معنى)", () => {
    expect(rule, "مش لاقي شرط بناء caddy في السكربت").toBeTruthy();
  });

  /** بيشغّل نفس الشرط على قايمة ملفات ويقول: هيتبني caddy ولا لأ */
  const buildsCaddy = (files: string[]) => {
    const r = spawnSync(
      "sh",
      ["-c", `printf '%s\\n' "$@" | grep -qvE '${rule![1]}'`, "sh", ...files],
      { encoding: "utf8" },
    );
    return r.status === 0;
  };

  it("تعديل الموقع التعريفي وحده: مفيش بناء", () => {
    expect(buildsCaddy(["site/index.html"])).toBe(false);
    expect(buildsCaddy(["site/index.html", "site/logo.png", "docs/x.md"])).toBe(false);
  });

  it("الواجهة واللوحة والـCaddyfile: بناء", () => {
    expect(buildsCaddy(["src/App.tsx"])).toBe(true);
    expect(buildsCaddy(["admin/src/api.js"])).toBe(true);
    // deploy/ فيه الـCaddyfile وهو **جوه** صورة caddy — فلازم يفضل بيبني
    expect(buildsCaddy(["deploy/Caddyfile"])).toBe(true);
  });

  it("الموقع مع الواجهة: بناء (الواجهة هي السبب)", () => {
    expect(buildsCaddy(["site/index.html", "src/App.tsx"])).toBe(true);
  });
});
