import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * **أيقونة التطبيق وملف التثبيت (manifest).**
 *
 * اللوجو موجود في **خمس أماكن** على الأقل: أيقونة الويب، وأيقونة التثبيت
 * على شاشة الموبايل، وأيقونة آبل، وأيقونة مشغّل أندرويد في الـ APK،
 * والطبقة التكيّفية. وتغيير اللوجو في مكان ونسيانه في الباقي **مابيبوّظش
 * حاجة ظاهرة عند المطوّر** — بس المستخدم يشوف لوجو قديم أو أيقونة
 * Capacitor الافتراضية على جهازه.
 *
 * والفحص على **محتوى الملفات نفسها** (البصمة والمقاس) مش على وجودها.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const r = (p: string) => path.join(ROOT, p);
const RES = "mobile/android/app/src/main/res";

/** مقاس PNG من الهيدر مباشرةً — من غير أي مكتبة. */
function pngSize(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  expect(b.subarray(0, 8).toString("hex"), `مش PNG: ${file}`).toBe("89504e470d0a1a0a");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(r(p))).digest("hex");

describe("أيقونة التطبيق", () => {
  it("أيقونات الويب موجودة بمقاساتها", () => {
    for (const [file, size] of [["public/icon.png", 192], ["public/icon-512.png", 512],
      ["public/icon-maskable.png", 512], ["public/apple-touch-icon.png", 180]] as const) {
      const { w, h } = pngSize(r(file));
      expect({ file, w, h }).toEqual({ file, w: size, h: size });
    }
  });

  it("أيقونات مشغّل أندرويد بمقاساتها (الأيقونة والمدوّرة والطبقة التكيّفية)", () => {
    for (const [d, launcher, fg] of [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216],
      ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]] as const) {
      expect(pngSize(r(`${RES}/mipmap-${d}/ic_launcher.png`)), d).toEqual({ w: launcher, h: launcher });
      expect(pngSize(r(`${RES}/mipmap-${d}/ic_launcher_round.png`)), d).toEqual({ w: launcher, h: launcher });
      expect(pngSize(r(`${RES}/mipmap-${d}/ic_launcher_foreground.png`)), d).toEqual({ w: fg, h: fg });
    }
  });

  /**
   * 🔴 الحارس الحقيقي: لوجو الويب ولوجو الـ APK **نفس الصورة**.
   * من غيره تتغيّر أيقونة الويب وتفضل أيقونة Capacitor الافتراضية على
   * الموبايل، ومحدش ياخد باله غير لما يتثبّت التطبيق على جهاز.
   */
  it("🔴 لوجو الموبايل هو نفسه لوجو الويب (نفس البصمة)", () => {
    expect(sha(`${RES}/mipmap-xxxhdpi/ic_launcher.png`),
      "أيقونة أندرويد مختلفة عن أيقونة الويب — غالبًا اتغيّر واحد والتاني لأ").toBe(sha("public/icon.png"));
    expect(sha("src/assets/logo.png")).toBe(sha("public/icon.png"));
  });

  /** الأبيض هو قيمة قالب Capacitor — ومعاها بيظهر إطار أبيض حوالين اللوجو الغامق. */
  it("خلفية الأيقونة التكيّفية مش الأبيض الافتراضي", () => {
    const xml = fs.readFileSync(r(`${RES}/values/ic_launcher_background.xml`), "utf8");
    const color = /name="ic_launcher_background">\s*(#[0-9A-Fa-f]{6,8})\s*</.exec(xml)?.[1];
    expect(color, "مفيش لون خلفية").toBeTruthy();
    expect(color!.toUpperCase(), "لسه على أبيض القالب").not.toBe("#FFFFFF");
  });
});

describe("ملف التثبيت (manifest)", () => {
  const mf = JSON.parse(fs.readFileSync(r("public/manifest.webmanifest"), "utf8"));

  it("فيه الاسم والعرض المستقل وأيقونة قابلة للقصّ", () => {
    expect(mf.name).toBe("رع شات");
    expect(mf.display).toBe("standalone");
    expect(mf.start_url).toBe("/");
    expect(mf.dir).toBe("rtl");
    expect(mf.icons.some((i: { purpose?: string }) => i.purpose === "maskable"),
      "من غير maskable أندرويد بيحطّ اللوجو جوه مربع أبيض").toBe(true);
  });

  /**
   * 🔴 مسار غلط في الـ manifest = المتصفح يتجاهل الأيقونة **في سكوت**
   * ويحطّ أيقونة عامة على الشاشة.
   */
  it("🔴 كل أيقونة في الـ manifest ملفها موجود فعلًا", () => {
    for (const i of mf.icons as { src: string; sizes: string }[]) {
      const f = r(path.join("public", i.src));
      expect(fs.existsSync(f), `مفيش ${i.src}`).toBe(true);
      const { w } = pngSize(f);
      expect(`${w}x${w}`, i.src).toBe(i.sizes);
    }
  });

  it("الصفحة بتوصل للـ manifest وأيقونة آبل", () => {
    const html = fs.readFileSync(r("index.html"), "utf8");
    expect(html).toMatch(/rel="manifest"\s+href="\/manifest\.webmanifest"/);
    expect(html).toMatch(/rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"/);
    expect(html).toMatch(/name="theme-color"/);
  });
});

describe("علامة العدّاد في الـ service worker", () => {
  const sw = fs.readFileSync(r("public/sw.js"), "utf8");

  /**
   * من غير التحديث عند الوصول والقفل والضغط، العلامة بتعلق على رقم قديم:
   * المستخدم يقرا كل حاجة من جهاز تاني والنقطة تفضل على الأيقونة للأبد.
   */
  it("بيحدّث العلامة عند وصول الإشعار وعند قفله وعند الضغط عليه", () => {
    expect(sw).toContain("setAppBadge");
    expect(sw).toContain("clearAppBadge");
    expect((sw.match(/syncBadge\(\)/g) ?? []).length,
      "المفروض تتنادى من push و notificationclose و notificationclick").toBeGreaterThanOrEqual(3);
    expect(sw).toContain('self.addEventListener("notificationclose"');
  });
});
