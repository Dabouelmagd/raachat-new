import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { parseVersion, VERSION_URL } from "../../admin/src/update.js";

/**
 * حارس **بصمة النسخة** في التحديث التلقائي للوحة.
 *
 * الميزة كلها قايمة على إن البصمة اللي اللوحة مبنية منها (`__BUILD__` محقون
 * وقت البناء) تبقى **نفسها** اللي في `version.txt` اللي السيرفر بيردّ بيه. ولو
 * واحد من الاتنين غاب — الـ `define` اتشال، أو الملف ما اتكتبش، أو
 * `viteSingleFile` دمجه جوه الملف الواحد — الميزة **تسكت من غير أي خطأ**
 * واللوحة تقعد على نسخة قديمة بعد كل نشر ومحدش ياخد باله.
 *
 * فالفحص على **ناتج البناء الحقيقي** مش على نص بنكتبه في الاختبار، لأن الحاجة
 * اللي بتتغيّر هي ناتج Vite. (ودي بالظبط اللي كشفت إن أول نسخة من الميزة —
 * منقولة من التطبيق وبتقارن اسم ملف الـ JS — مستحيل تشتغل على اللوحة أصلًا:
 * بناء اللوحة ملف واحد ومفيش فيه `<script src>` خالص.)
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const DIST = path.join(ROOT, "admin/dist");
const INDEX = path.join(DIST, "index.html");
const VERSION = path.join(DIST, "version.txt");

test.describe("بصمة نسخة اللوحة", () => {
  test.skip(!fs.existsSync(INDEX), "محتاجة بناء لوحة الإدارة: cd admin && npx vite build");

  test("version.txt موجود في الناتج وبصمته صالحة", () => {
    expect(fs.existsSync(VERSION), `${VERSION_URL} ما اتكتبش في الناتج — اللوحة مش هتعرف إن فيه نشرة جديدة`).toBe(true);
    const v = parseVersion(fs.readFileSync(VERSION, "utf8"));
    expect(v, "البصمة مش سطر قصير صالح").not.toBeNull();
  });

  test("ونفس البصمة محقونة جوه الحزمة الشغّالة", () => {
    // ده الطرف التاني من المقارنة. لو `define: __BUILD__` اتشال من
    // vite.config.js، `buildId()` بترجّع null والفحص بيرجع من غير ما يقارن حاجة.
    const v = fs.readFileSync(VERSION, "utf8").trim();
    const html = fs.readFileSync(INDEX, "utf8");
    expect(html, "البصمة مش موجودة جوه الملف الواحد — الـ define مش بيوصل للحزمة")
      .toContain(`"${v}"`);
  });

  test("بناء جديد = بصمة جديدة", () => {
    // بناء وضع الـ API اتعمل في خطوة منفصلة، فبصمته لازم تختلف — وإلا البصمة
    // مش بتتغيّر مع النشرات والميزة مابتكتشف حاجة أبدًا.
    const other = path.join(ROOT, "admin/dist-api/version.txt");
    test.skip(!fs.existsSync(other), "محتاجة بناء وضع الـ API كمان");
    expect(fs.readFileSync(other, "utf8").trim()).not.toBe(fs.readFileSync(VERSION, "utf8").trim());
  });

  test("ردّ HTML مكان البصمة بيترفض (مفيش لفة إعادة تحميل)", () => {
    // لو `version.txt` مش موجود وسيرفر الملفات ردّ بـ`index.html` بدلًو، النص
    // بيبقى صفحة كاملة — ومختلفة عن بصمتنا دايمًا، فكل فحص يقول «فيه نشرة
    // جديدة» وتدخل اللوحة في لفة reload. الرفض هنا هو اللي بيمنع ده.
    expect(parseVersion(fs.readFileSync(INDEX, "utf8"))).toBeNull();
    expect(parseVersion("<!doctype html><html><body>x</body></html>")).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("  mh2k9x1  ")).toBe("mh2k9x1"); // المسافات والسطر الجديد بيتشالوا
  });
});

/**
 * 🔴 **إعادة التحميل نفسها كانت بتجيب النسخة القديمة** (اتبلّغ ١٩ أكتوبر ٢٠٢٦:
 * لوحة على نسخة نشرتين قديمة).
 *
 * `index.html` بيتقدّم **بلا `Cache-Control`** (لا من Caddy ولا نجنكس)، فالمتصفح
 * بيكاشّه باجتهاده — و`location.reload()` بيعيد قراءته من الكاش. يعني الفحص
 * بيلاقي النشرة الجديدة صح، بيعمل reload، وبيرجع على **نفس القديم**؛ وبعدها
 * حارس اللفّة (`TRIED`) يشوف إن البصمة دي اتجرّبت فيسكت **للأبد**.
 *
 * والحارس لازم يكون في متصفح حقيقي: فحص نصّي بيلاقي `reloadNow` موجودة ويعدّي،
 * والمكسور هو **العنوان اللي الصفحة بتروح له**.
 */
import http from "node:http";

const UPORT = 4123;
const UDIST = path.join(ROOT, "admin/dist");
const UTYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".png": "image/png" };

test.describe("إعادة التحميل بتجيب النسخة الجديدة فعلًا", () => {
  test.skip(!fs.existsSync(INDEX), "محتاجة بناء لوحة الإدارة: cd admin && npx vite build");
  let srv: http.Server | undefined;

  test.beforeAll(async () => {
    srv = http.createServer((req, res) => {
      const u = new URL(req.url || "/", `http://127.0.0.1:${UPORT}`);
      // السيرفر بيقول إن فيه نشرة أحدث من اللي الصفحة مبنية منها
      if (u.pathname === VERSION_URL) {
        res.writeHead(200, { "content-type": UTYPES[".txt"] });
        return void res.end("zzznewbuild");
      }
      const f = path.join(UDIST, u.pathname === "/" ? "/index.html" : u.pathname);
      if (!f.startsWith(UDIST) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
        res.writeHead(404);
        return void res.end();
      }
      res.writeHead(200, { "content-type": UTYPES[path.extname(f)] || "application/octet-stream" });
      res.end(fs.readFileSync(f));
    });
    await new Promise<void>((ok) => srv!.listen(UPORT, "127.0.0.1", ok));
  });
  test.afterAll(async () => { await new Promise<void>((ok) => (srv ? srv.close(() => ok()) : ok())); });

  test("🔴 بتروح لعنوان جديد — مش reload بيقرا الكاش", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    // الفحص الأول بعد ١٥ ثانية — بنقدّم الساعة بدل ما نستنى
    await page.clock.install();
    await page.goto(`http://127.0.0.1:${UPORT}/`);
    await page.clock.runFor(20_000);

    const bar = page.getByRole("status").filter({ hasText: "فيه نسخة جديدة" });
    await expect(bar, "اللوحة ما اكتشفتش النشرة الجديدة أصلًا").toBeVisible();

    await bar.getByRole("button", { name: "حدّثي الآن" }).click();
    await page.waitForURL(/[?&]v=/, { timeout: 10_000 });
    const q = new URL(page.url()).searchParams.get("v") || "";
    // لازم قيمة حقيقية — `onClick={reloadNow}` كان بيبعت حدث الضغطة نفسه
    expect(q, `قيمة v مش صالحة: ${q}`).toMatch(/^[\w.-]+$/);
    expect(q.toLowerCase(), "حدث الضغطة اتبعت مكان رقم النسخة").not.toContain("object");
    expect(errs, errs.join("\n")).toEqual([]);
  });
});
