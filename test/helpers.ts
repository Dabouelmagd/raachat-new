import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
export const DIST = path.join(root, "dist-single", "index.html");
export const legalUrl = (name: string) => "file://" + path.join(root, "dist-single", "legal", `${name}.html`);

/** الاسم الافتراضي للحساب التجريبي (زي ما هو في src/store/profile.ts) */
export const DEMO_NAME = "كريم الشناوي";

export function requireBuild() {
  if (!fs.existsSync(DIST)) {
    throw new Error(`مفيش ${DIST}\nابنيها الأول من جذر المشروع:\n  npx tsc -b && npx vite build -c vite.single.config.ts`);
  }
}

/**
 * النوافذ المنبثقة (طلب دفتر الأسماء، نافذة الإعلان) بتحجب الكليك.
 * بنشيلها بدل ما نستنى، عشان الاختبار يبقى عن الحاجة اللي بنفحصها.
 */
export const clearOverlays = (page: Page) =>
  page.evaluate(() => document.querySelectorAll(".fixed.inset-0").forEach((e) => e.remove()));

/** يفتح التطبيق ويدخل بالحساب التجريبي */
export async function openApp(page: Page) {
  requireBuild();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as Page & { rcErrors?: string[] }).rcErrors = errors;

  await page.goto("file://" + DIST);
  await page.getByRole("button", { name: /ادخل بالحساب التجريبي/ }).click();
  await expect(page.getByRole("link", { name: /الخدمات|Services/ })).toBeVisible();
  await clearOverlays(page);
}

/** يتأكد إن مفيش أخطاء JS طلعت في الصفحة */
export function expectNoPageErrors(page: Page) {
  expect((page as Page & { rcErrors?: string[] }).rcErrors ?? []).toEqual([]);
}

/** ينقل لتاب من الشريط السفلي */
export async function tab(page: Page, name: RegExp) {
  await clearOverlays(page);
  await page.getByRole("link", { name }).click();
}

/** الحساب ← الملف الشخصي (MemoryRouter: مفيش روابط مباشرة) */
export async function openProfile(page: Page) {
  await tab(page, /الحساب|Account/);
  await page.getByRole("button").filter({ hasText: DEMO_NAME }).first().click();
  await expect(page.locator("#rc-birth")).toBeVisible();
}

/** يحدّد تاريخ ميلاد ويحفظ */
export async function setBirthDate(page: Page, day: string) {
  await page.locator("#rc-birth").fill(day);
  await page.getByRole("button", { name: /حفظ التغييرات/ }).click();
  await expect(page.getByRole("button", { name: /تم الحفظ/ })).toBeVisible();
  await clearOverlays(page);
}

/** سنة ميلاد لعمر معيّن */
export const yearForAge = (age: number) => new Date().getUTCFullYear() - age;

/**
 * **جسر Capacitor وهمي بنفس شكل الحقيقي.**
 *
 * 🔴 الشكل هو بيت القصيد: الجسر الحقيقي بيبدأ بـ`Plugins` **فاضي** وبيعرّض
 * `registerPlugin` و`PluginHeaders` — ووكيل الـJS مابيتخلقش إلا لما الواجهة
 * تنادي `registerPlugin`. والنسخة القديمة من الاختبار كانت بتحقن
 * `Plugins: { App: … }` **مملوءًا**، فكانت بتعدّي على كود **ميت** في الجهاز
 * الحقيقي. نفس درس «البيانات لازم تفرّق بين الصح والغلط القريب».
 *
 * الإضافات نفسها بيحطّها كل اختبار في `window.__rcPlugins` بـ`addInitScript`
 * بتاعه قبل النداء ده.
 */
export async function stubCapacitor(page: Page, names: string[]) {
  await page.addInitScript((list: string[]) => {
    const w = window as unknown as { Capacitor?: unknown; __rcPlugins?: Record<string, unknown> };
    w.Capacitor = {
      Plugins: {}, // فاضي زي الحقيقي
      PluginHeaders: list.map((name) => ({ name })),
      isNativePlatform: () => true,
      registerPlugin: (name: string) => {
        const cap = (window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }).Capacitor;
        const made = w.__rcPlugins?.[name];
        cap.Plugins[name] = made;
        return made;
      },
    };
  }, names);
}
