import { defineConfig, devices } from "@playwright/test";

/**
 * اختبارات الواجهة بتشتغل على نسخة الملف الواحد (`dist-single/index.html`) بوضع الديمو
 * (مفيش سيرفر). ابنيها الأول من جذر المشروع:
 *   npx tsc -b && npx vite build -c vite.single.config.ts
 * وبعدين من هنا:  npm ci && npx playwright install chromium && npm test
 */
export default defineConfig({
  testDir: "./ui",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // الديمو بيحفظ الملف الشخصي في الذاكرة، فالتوازي بيلغبط الحالة
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 420, height: 900 }, // الموبايل هو الحالة الأساسية
    locale: "ar-EG",
    screenshot: "only-on-failure",
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
});
