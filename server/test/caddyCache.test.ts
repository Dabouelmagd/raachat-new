/**
 * 🔴 **`index.html` لازم يتقدّم بـ`no-cache`، و`/assets/*` لازم يفضل immutable.**
 *
 * العطل اللي السطر ده موجود عشانه (اتبلّغ ١٩ أكتوبر ٢٠٢٦): الملف كان بيتقدّم
 * **بلا أي `Cache-Control`**، فالمتصفح بيكاشّه باجتهاده — وإعادة التحميل بعد
 * أي نشر بتقرا **نفس النسخة القديمة** من الكاش، وحارس اللفّة في التحديث
 * التلقائي بيشوف إن البصمة دي اتجرّبت فيسكت **للأبد**. يعني اللوحة تفضل على
 * كود نشرتين قديم ومفيش ولا خطأ في أي مكان.
 *
 * والاتنين لازم يبقوا مع بعض: لو حد حطّ `immutable` على `index.html` (أو شال
 * الـ`no-cache`) نرجع لنفس العطل؛ ولو شال `immutable` عن `/assets/*` كل نشرة
 * تبقى تحميلًا كاملًا للحزمة على كل مستخدم. الأسماء جوه `assets` فيها بصمة
 * Vite فالتكاش الأبدي عليها صح.
 *
 * ⚠️ والفحص ده **على نصّ الإعداد** — مش على Caddy شغّال (مفيش Docker daemon في
 * بيئة Claude). الدليل النهائي إن الإعداد سليم هو فحص الصحة في `deploy-rachat.sh`:
 * بيضرب على `127.0.0.1:8085` اللي هو Caddy نفسه، فإعداد مكسور بيفشّل النشر.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CADDY = fs.readFileSync(path.join(ROOT, "deploy/Caddyfile"), "utf8");

/** جسم بلوك موقع بحدوده (من سطر عنوانه لقفلته) — مش نافذة بايتات */
function site(host: string) {
  const start = CADDY.indexOf(`http://${host}.{$DOMAIN} {`);
  if (start < 0) return "";
  const rest = CADDY.slice(start);
  const end = rest.indexOf("\n}\n");
  return end < 0 ? rest : rest.slice(0, end);
}

describe("كاش الملفات في Caddy", () => {
  it("الملف فيه الموقعين اللي بنقدّم منهم صفحات", () => {
    // لو واحد اتسمّى تاني، الفحوص تحته بتبقى على نصّ فاضي وتعدّي بلا معنى
    for (const h of ["app", "admin"]) {
      expect(site(h).length, `مالقاش بلوك ${h} في الـCaddyfile`).toBeGreaterThan(50);
    }
  });

  it("🔴 index.html بـno-cache في التطبيق وفي اللوحة", () => {
    for (const h of ["app", "admin"]) {
      const b = site(h);
      expect(b, `${h}: مفيش مُطابِق لـindex.html — التحديث التلقائي هيرجع القديم من الكاش`)
        .toMatch(/@html\s+path\s+\/\s+\/index\.html/);
      expect(b, `${h}: المُطابِق موجود ومفيش header بيحطّ no-cache عليه`)
        .toMatch(/header\s+@html\s+Cache-Control\s+"no-cache"/);
    }
  });

  it("🔴 وindex.html ماينفعش يبقى immutable", () => {
    // الارتداد الصامت: `immutable` على الصفحة نفسها بيرجّع العطل بالظبط
    for (const h of ["app", "admin"]) {
      const m = /header\s+@html\s+Cache-Control\s+"([^"]+)"/.exec(site(h));
      expect(m, `${h}: مفيش هيدر لـindex.html`).toBeTruthy();
      expect(m![1], `${h}: index.html اتعلّم immutable`).not.toContain("immutable");
      expect(m![1], `${h}: index.html اتعلّم max-age`).not.toContain("max-age");
    }
  });

  it("و/assets/* يفضل immutable (أسماؤها فيها بصمة Vite)", () => {
    const b = site("app");
    expect(b, "تكاش الأصول اتشال — كل نشرة هتبقى تحميلًا كاملًا على كل مستخدم")
      .toMatch(/header\s+@assets\s+Cache-Control\s+"public,\s*max-age=31536000,\s*immutable"/);
  });
});
