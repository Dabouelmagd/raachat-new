import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * أول اختبار آلي للوحة الإدارة. (كانت مفيهاش ولا اختبار — الـ CI كان بيبنيها بس.)
 * بيشتغل على بناء الديمو بتاعها (من غير سيرفر، فمفيش تسجيل دخول).
 *
 * بيحمي الفصل اللي اتطلب في ١٢ أكتوبر: «البلاغات» و«المحتوى» كانوا قسم واحد
 * في نفس الصفحة، وهما شغلان مختلفان — البلاغات رد فعل على شكوى، والمحتوى
 * تصفّح لللي منشور دلوقتي.
 */
const ADMIN = path.resolve(import.meta.dirname, "../../admin/dist/index.html");

test.describe("لوحة الإدارة", () => {
  test.skip(!fs.existsSync(ADMIN), "محتاجة بناء لوحة الإدارة: cd admin && npx vite build");

  test("البلاغات والمحتوى قسمين منفصلين", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + ADMIN);
    const nav = (re: RegExp) => page.getByRole("button", { name: re });

    // «البلاغات» جنبه رقم البلاغات المفتوحة، فالمطابقة بالبداية مش بالتطابق التام
    await expect(nav(/^البلاغات/)).toHaveCount(1);
    await expect(nav(/^المحتوى$/)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /البلاغات والمحتوى/ })).toHaveCount(0);

    await nav(/^البلاغات/).click();
    await expect(page.getByRole("heading", { name: "البلاغات" })).toBeVisible();
    await expect(page.getByText("Stories النشطة")).toHaveCount(0);

    await nav(/^المحتوى$/).click();
    await expect(page.getByRole("heading", { name: "المحتوى" })).toBeVisible();
    await expect(page.getByText("Stories النشطة")).toBeVisible();
    await expect(page.getByText(/مفتوحة|تمت معالجتها/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
