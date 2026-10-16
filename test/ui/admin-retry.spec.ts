import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * **اللوحة لازم يبقى لها مخرج لما السيرفر مايردّش.**
 *
 * العطل اللي اتبلّغ (١٦ أكتوبر ٢٠٢٦): «تعذّر الاتصال بالسيرفر» على صفحة
 * الصلاحيات. السبب كان نشرة شغّالة — الـ api بيعيد التشغيل ثواني فأي طلب
 * بيروح بلا رد. والرسالة كانت نصًّا وخلاص: مفيش «حاول تاني» ومفيش إعادة
 * محاولة، فالصفحة تقعد واقفة لحد ما المستخدم يعمل تحديث بإيده. وأوحش من
 * كده: لو الفشل في `/admin/me`، شاشة `Gate` كانت بتعرض الخطأ ومعاه زرار
 * «تسجيل الخروج» **وبس** — فالمخرج الوحيد إنك تخرجي من حسابك.
 *
 * الاختبار بيشغّل بناء اللوحة **في وضع الـ API** على سيرفر حقيقي بيقطع
 * الاتصال (`res.destroy`) — نفس اللي بيحصل وقت النشر بالظبط — ويتأكد إن:
 *   ١) الزرار موجود  ٢) إعادة المحاولة بتحصل لوحدها  ٣) الزرار بيعيد الطلب
 *   ٤) والرد الحقيقي (403) **مابيتعادش** عليه، لأن إعادة المحاولة فيه بلا معنى.
 *
 * نفس المنفذ (4121) مثبّت في البناء وفي السيرفر هنا عشان الطلبات تبقى
 * **نفس الأصل** — من غير كده الطلب يبقى عابر للأصول ويدخل في حوار CORS
 * وpreflight، وده بيخلط «السيرفر مش بيردّ» بـ«المتصفح رفض الرد».
 */
const PORT = 4121;
const DIST = path.resolve(import.meta.dirname, "../../admin/dist-api");
const INDEX = path.join(DIST, "index.html");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json",
};

let server: http.Server | undefined;
let mode: "dead" | "forbidden" = "dead";
let hits = 0;

test.describe("اللوحة لما السيرفر مايردّش", () => {
  test.skip(!fs.existsSync(INDEX), `محتاجة بناء اللوحة بوضع الـ API: cd admin && VITE_API_URL=http://127.0.0.1:${PORT}/api npx vite build --outDir dist-api`);

  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
      if (url.pathname.startsWith("/api/")) {
        hits++;
        if (mode === "dead") return void res.destroy(); // الاتصال بيقع = خطأ شبكة
        res.writeHead(403, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ code: "forbidden", message: "مالكش صلاحية" }));
      }
      const file = path.join(DIST, url.pathname === "/" ? "/index.html" : url.pathname);
      if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        return void res.end();
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    });
    await new Promise<void>((ok) => server!.listen(PORT, "127.0.0.1", ok));
  });

  test.afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
  });

  test.beforeEach(async ({ page }) => {
    hits = 0;
    // جلسة محفوظة: من غيرها اللوحة تعرض شاشة الدخول ومابتنادي السيرفر أصلًا
    await page.addInitScript(() => {
      try {
        localStorage.setItem("rachat-admin-session", JSON.stringify({ access: "t", refresh: "r" }));
      } catch { /* التخزين مقفول */ }
    });
  });

  test("خطأ الشبكة: فيه «حاول تاني» وإعادة محاولة لوحدها", async ({ page }) => {
    mode = "dead";
    await page.goto(`http://127.0.0.1:${PORT}/`);

    await expect(page.getByRole("alert")).toContainText("تعذّر الاتصال بالسيرفر");
    const retry = page.getByRole("button", { name: "حاول تاني" });
    await expect(retry, "مفيش زرار «حاول تاني» — المستخدم محبوس").toBeVisible();

    // إعادة المحاولة التلقائية: أول فاصل ٣ ثواني
    const first = hits;
    expect(first).toBeGreaterThan(0);
    await expect.poll(() => hits, { timeout: 15_000, message: "مفيش إعادة محاولة تلقائية" }).toBeGreaterThan(first);

    // والزرار بيعيد الطلب كمان
    const before = hits;
    await retry.click();
    await expect.poll(() => hits, { timeout: 10_000, message: "الزرار مابيعيدش الطلب" }).toBeGreaterThan(before);

    // ولسه فيه مخرج تاني موجود زي ما كان
    await expect(page.getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();
  });

  test("الرد الحقيقي (403) مابيتعادش عليه", async ({ page }) => {
    mode = "forbidden";
    await page.goto(`http://127.0.0.1:${PORT}/`);

    await expect(page.getByRole("alert")).toContainText("مش من فريق الإدارة");
    expect(hits).toBe(1);
    // لو كانت إعادة المحاولة على طول، الرقم كان هيزيد في النافذة دي
    await page.waitForTimeout(6000);
    expect(hits, "بيعيد المحاولة على رد حقيقي — ده ضغط على السيرفر بلا فايدة").toBe(1);
  });
});
