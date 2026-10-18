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
  { key: "banner", name: "بانر الدردشات", kind: "banner", width: 1200, height: 300, slots: 3, pricePerMonth: 4500, pricePerDay: 150, active: true, note: "أعلى قائمة الدردشات", dailyImpressions: 1000, effectiveCpm: 150, marketCpm: 120 },
  { key: "modal", name: "نافذة كاملة عند الدخول", kind: "modal", width: 1080, height: 1920, slots: 4, pricePerMonth: 12000, pricePerDay: 400, active: true, note: "شاشة كاملة 9:16", dailyImpressions: 1000, effectiveCpm: 400, marketCpm: 120 },
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

/**
 * حملات بحالات مختلفة — لوحة «شغّالة دلوقتي» لازم تعرض **الجارية المعتمدة بس**.
 * و`phase` جايّة من السيرفر عن قصد (محسوبة بيوم القاهرة)، فالاختبار بيبعتها
 * زي ما السيرفر بيبعتها.
 */
const camp = (o: Record<string, unknown>) => ({
  id: "c1", advertiser: "شركة النور", headline: "عرض الشتا", body: "", cta: "اعرف أكتر", link: "https://x.test",
  imageUrl: null, images: {}, grad: 0, start: "2026-10-01", end: "2026-10-30", days: 30,
  status: "approved", phase: "running", total: 3000, discount: 0, gross: 3000, giftCode: null, offerPct: 0,
  isHouse: false, shown: 1200, clicked: 30, placements: [{ key: "banner", name: "بانر الدردشات", pricePerMonth: 4500, pricePerDay: 150 }],
  ...o,
});
const CAMPAIGNS = [
  camp({}),
  camp({ id: "c2", advertiser: "مطعم الشام", headline: "توصيل مجاني", phase: "upcoming", start: "2026-11-01", end: "2026-11-30" }),
  camp({ id: "c3", advertiser: "معرض القاهرة", headline: "خصومات", phase: "ended", start: "2026-09-01", end: "2026-09-30" }),
  // شغّالة من أيام ومفيش ولا ظهور — ده العطل الصامت اللي اللوحة لازم تصرخ عليه
  camp({ id: "c4", advertiser: "صيدلية الشفا", headline: "خصم الأدوية", shown: 0, clicked: 0, start: "2026-10-02", end: "2026-10-31" }),
];

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
        // المسار بيرجّع **مصفوفة** مش كائن — الواجهة بتعمل عليها `.filter`
        if (url.pathname === "/api/admin/ads/campaigns") return json(CAMPAIGNS);
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

  test("«شغّالة دلوقتي» بتبان من أول الشاشة وبتعرض الجارية بس", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/#ads`);

    // من غير ما ندوس على أي تبويب — دي الشاشة الافتراضية (خريطة المخزون)
    const panel = page.locator(".card").filter({ hasText: "شغّالة دلوقتي" }).first();
    await expect(panel, "مفيش لوحة بتقول إيه الشغّال — السؤال الأول بلا إجابة").toBeVisible();
    await expect(panel).toContainText("شركة النور");
    await expect(panel).toContainText("بانر الدردشات");

    // والمش شغّال مايتعرضش: الجايّة والمنتهية
    await expect(panel, "حملة لسه ما بدأتش ظاهرة كأنها شغّالة").not.toContainText("مطعم الشام");
    await expect(panel, "حملة منتهية ظاهرة كأنها شغّالة").not.toContainText("معرض القاهرة");
    expect(errs, errs.join("\n")).toEqual([]);
  });

  test("وبتحذّر من الحملة الشغّالة اللي مفيش ليها ولا ظهور", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${PORT}/#ads`);
    const panel = page.locator(".card").filter({ hasText: "شغّالة دلوقتي" }).first();
    await expect(panel).toContainText("صيدلية الشفا");
    await expect(panel.getByRole("alert"), "حملة بتاخد فلوس ومفيش ولا ظهور عدّت في سكوت").toContainText("مفيش ولا ظهور");
  });

  test("ونسبة الخريطة مابتدّعيش إنها الشغّال", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${PORT}/#ads`);
    // «الإشغال» كانت بتوحي إن ده اللي ظاهر للمستخدمين، وهي بتعدّ المحجوز
    await expect(page.getByText("نسبة الحجز في الفترة")).toBeVisible();
    await expect(page.getByText("شامل اللي بانتظار الموافقة والمتوقف")).toBeVisible();
  });

  /**
   * 🔴 **البيع شهور كاملة بس** (قرار داليا ١٩ أكتوبر ٢٠٢٦). والفحص لازم يكون
   * في متصفح حقيقي: حارس نصّي بيلاقي `endOfMonths` في الملف ويعدّي، بينما
   * اللي بيكسر البيع هو إن خانة تاريخ **حرّة** لسه موجودة على الشاشة —
   * فاللي بيحجز يكتب فترة مش شهورًا كاملة والسيرفر يرفضها بـ٤٠٠ **بعد** ما
   * يملا النموذج كله.
   */
  test("🔴 مفيش خانة تاريخ نهاية حرّة — المدة بالشهور والنهاية محسوبة", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await openForm(page);

    await expect(page.getByText("عدد الشهور"), "مفيش اختيار شهور — البيع لسه باليوم").toBeVisible();
    const dates = page.locator('input[type="date"]');
    await expect(dates, "لسه فيه خانة تاريخ نهاية حرّة — بتسمح بفترة مش شهور").toHaveCount(1);

    // والنهاية بتتحرّك مع المدة: شهر ← ٣ شهور
    const start = dates.first();
    await start.fill("2026-11-01");
    const months = page.getByLabel("عدد الشهور");
    await expect(months).toHaveValue("1");
    await expect(page.getByText("30 نوفمبر 2026"), "نهاية الشهر الواحد مش معروضة").toBeVisible();
    await months.selectOption("3");
    await expect(page.getByText("29 يناير 2027"), "النهاية ما اتحسبتش على ٣ شهور").toBeVisible();

    // والسعر بالشهر مش باليوم
    await expect(page.getByText("/شهر").first(), "سعر الموضع لسه معروض باليوم").toBeVisible();
    expect(errs, errs.join("\n")).toEqual([]);
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
