import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * **نموذج الحملة في اللوحة: الرفع لازم يبقى موجود، والرجوع مايضيّعش الشغل.**
 *
 * اتبلّغ (١٨ أكتوبر ٢٠٢٦): «زر الابلود للاعلان لا يظهر» و«اضافة سهم للرجوع
 * في شاشة الاعلانات». والاتنين كانوا حقيقيين:
 *
 *   ١) `canUpload` كان مشروطًا بإن يكون فيه **موضع مختار**، والنموذج الجديد
 *      بيبدأ بـ `placements: []` — فالمعاينة بتعرض المواضع كلها و**ولا واحد
 *      فيها له زرار رفع**، والسبب مكتوب في سطر رمادي صغير تحت العنوان.
 *   ٢) النموذج بيحلّ محلّ شاشة الإعلانات كلها بلا تبويبات، والمخرج الوحيد
 *      «إلغاء» في آخر نموذج طويل — و«إلغاء» **بيمسح المسوّدة**.
 *
 * ليه بمتصفح حقيقي مش حارسًا نصيًّا: الحارس النصّي كان هيلاقي زرار «ارفعي
 * صورة» موجودًا في الكود **وهو مخفي فعلًا** على الشاشة — ودي بالظبط الغلطة
 * اللي البلاغ كشفها. فالحكم هنا على **ظهور الزرار للمستخدم**.
 *
 * نفس نمط `admin-retry.spec.ts`: بناء اللوحة بوضع الـ API على سيرفر حقيقي
 * بنفس المنفذ (نفس الأصل، فمفيش حوار CORS)، والردود مزيّفة بالشكل الحقيقي.
 */
const PORT = 4121;
const DIST = path.resolve(import.meta.dirname, "../../admin/dist-api");
const INDEX = path.join(DIST, "index.html");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json",
};

const DAY = "2026-10-18";
const PLACEMENTS = [
  { key: "banner", name: "بانر الدردشات", kind: "banner", width: 1200, height: 300, slots: 3, pricePerDay: 150, active: true, note: "أعلى قائمة الدردشات", dailyImpressions: 1000, effectiveCpm: 150, marketCpm: 120 },
  { key: "modal", name: "نافذة كاملة عند الدخول", kind: "modal", width: 1080, height: 1920, slots: 4, pricePerDay: 400, active: true, note: "شاشة كاملة 9:16", dailyImpressions: 1000, effectiveCpm: 400, marketCpm: 120 },
];
const INVENTORY = {
  from: DAY, to: DAY, days: [DAY], today: DAY,
  placements: PLACEMENTS.map((p) => ({
    ...p,
    cells: [{ day: DAY, booked: 0, held: 0, blocked: false, free: p.slots }],
    campaigns: [], blocks: [],
  })),
};
const ME = { user: { id: "u1", name: "داليا" }, isOwner: true, role: null, permissions: [], catalog: [] };

let server: http.Server | undefined;

test.describe("نموذج حملة الإعلانات في اللوحة", () => {
  test.skip(!fs.existsSync(INDEX), `محتاجة بناء اللوحة بوضع الـ API: cd admin && VITE_API_URL=http://127.0.0.1:${PORT}/api npx vite build --outDir dist-api`);

  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
      const json = (body: unknown, code = 200) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/admin/me") return json(ME);
        if (url.pathname === "/api/admin/ads/inventory") return json(INVENTORY);
        if (url.pathname === "/api/admin/ads/campaigns") return json({ items: [], total: 0 });
        return json({ code: "not_found", message: "مش موجود" }, 404);
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

  /** جلسة محفوظة + مسوّدة نضيفة: المسوّدة بتعيش في `localStorage` فلازم تتصفّر بين الاختبارات */
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem("rachat-admin-session", JSON.stringify({ access: "t", refresh: "r" }));
      } catch { /* التخزين مقفول */ }
    });
  });

  const openForm = async (page: import("@playwright/test").Page) => {
    await page.goto(`http://127.0.0.1:${PORT}/#ads`);
    await page.getByRole("button", { name: "+ حجز حملة" }).click();
    await expect(page.getByText("حجز حملة جديدة")).toBeVisible();
  };

  test("الرفع موجود للمستخدم: من غير موضع مختار فيه زرار اختيار، وبعده زرار الرفع", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await openForm(page);

    // الحالة اللي البلاغ عنها: نموذج جديد = مفيش موضع مختار
    const pick = page.getByRole("button", { name: "اختاري الموضع ده عشان ترفعي صورته" }).first();
    await expect(pick, "مفيش طريق للرفع من المعاينة — الزرار مخفي والسبب مش ظاهر").toBeVisible();
    // والسبب مكتوب بوضوح، مش سطرًا رماديًا
    await expect(page.getByRole("status")).toContainText("الرفع بيظهر بعد اختيار الموضع");

    // ضغطة واحدة بتحجز الموضع، والرفع بيبان
    await pick.click();
    await expect(page.getByText("ارفعي صورة").first(), "اخترت الموضع والرفع لسه مش ظاهر").toBeVisible();
    expect(errs, errs.join("\n")).toEqual([]);
  });

  test("الرفع بيبان كمان لو الموضع اتحجز من النموذج نفسه", async ({ page }) => {
    await openForm(page);
    // زرار الموضع في «المواضع المحجوزة» — نفس المسار القديم
    await page.getByRole("button", { name: /بانر الدردشات/ }).first().click();
    await expect(page.getByText("ارفعي صورة").first()).toBeVisible();
  });

  test("سهم الرجوع موجود، وبيخرج من النموذج **من غير** ما يضيّع المسوّدة", async ({ page }) => {
    await openForm(page);
    const name = page.locator(".inp").first();
    await name.fill("شركة النور");

    const back = page.getByRole("button", { name: "رجوع للإعلانات" });
    await expect(back, "مفيش مخرج من النموذج غير «إلغاء» اللي بيمسح المسوّدة").toBeVisible();
    await back.click();

    // رجعنا لشاشة الإعلانات (التبويبات بانت تاني)
    await expect(page.getByRole("button", { name: "خريطة المخزون" })).toBeVisible();

    // وأهم حاجة: اللي اتكتب لسه موجود
    await page.getByRole("button", { name: "+ حجز حملة" }).click();
    await expect(page.locator(".inp").first(), "الرجوع ضيّع اللي اتكتب — ده بقى نفس «إلغاء»").toHaveValue("شركة النور");
  });

  test("«إلغاء» لسه بيمسح المسوّدة — الفرق بينه وبين الرجوع مقصود", async ({ page }) => {
    await openForm(page);
    await page.locator(".inp").first().fill("شركة النور");
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await expect(page.getByRole("button", { name: "خريطة المخزون" })).toBeVisible();

    await page.getByRole("button", { name: "+ حجز حملة" }).click();
    await expect(page.locator(".inp").first(), "«إلغاء» ساب المسوّدة — فمفيش طريقة تبدأي بيها من جديد").toHaveValue("");
  });
});
