/**
 * **المفتاح اللي الكود بيقراه وcompose مابيمرّرهوش = ميزة ميتة في سكوت.**
 *
 * compose بيمرّر المتغيرات **واحد واحد بالاسم** في `environment:`، فمفتاح موجود في
 * `.env.production` ومش مكتوب هناك **مابيوصلش للعملية خالص**. العلّة دي ضربتنا مرتين:
 *   - `RETENTION`: المفتاح في الملف والكنس فضل تجربة جافة (الدليل كان `Running` مش
 *     `Recreated` بعد إعادة التشغيل).
 *   - `BANNED_WORDS`: **لسه** ناقص — و`assertClean` منادى في ١٥ موضع بس
 *     `contentFilter.ts` بيرجع فورًا على قايمة فاضية، يعني **فلتر المحتوى مقفول في
 *     الإنتاج** وده شرط في بند ١.٢ عند آبل وسياسة UGC عند بلاي
 *     (`docs/legal/store-declarations.md` القسم ١-أ).
 *
 * الاختبار ده حارس في اتجاهين:
 *   1) **المفاتيح الواصلة حاليًا مايحصلّهاش ارتداد** — لو سطر اتشال من compose بالغلط،
 *      الميزة بتموت من غير أي خطأ، والاختبار هو اللي بيلاقيها.
 *   2) **أي مفتاح جديد** الكود بيقراه ولا هو في compose ولا في قايمة المعروف
 *      (`KNOWN_UNPASSED`) بيفشّل الاختبار — فما نكرّرش الغلطة من غير ما ناخد بالنا.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { firstPublicOrigin } from "../src/lib/senders.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const compose = fs.readFileSync(path.join(ROOT, "docker-compose.prod.yml"), "utf8");
const configSrc = fs.readFileSync(path.join(ROOT, "server/src/config.ts"), "utf8");

/** أسماء المتغيرات اللي الكود بيقراها (من مخطط zod في config.ts) */
const configKeys = [...configSrc.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]!);

/** أسماء المتغيرات اللي compose بيمرّرها للـ api */
const apiEnv = (() => {
  const i = compose.indexOf("  api:");
  const j = compose.indexOf("\n  caddy:", i);
  const block = compose.slice(i, j === -1 ? undefined : j);
  return new Set([...block.matchAll(/^ {6}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]!));
})();

/**
 * مفاتيح الكود بيقراها وcompose **مش** بيمرّرها — وده مقبول لواحد من سببين:
 *   (أ) الافتراضي في الكود هو الصح في الإنتاج، وتغييره مش مطلوب.
 *   (ب) **عطل معروف** مكتوب صريح هنا لحد ما يتصلح.
 * أي مفتاح جديد خارج القايمة دي بيفشّل الاختبار.
 */
const KNOWN_UNPASSED: Record<string, string> = {
  // (أ) الافتراضي كافي في الإنتاج
  PORT: "الافتراضي 4000 مطابق لـ expose في compose",
  UPLOAD_DIR: "الافتراضي مطابق لـ volume uploads:/app/uploads",
  APP_URL: "بيرجع لأول أصل **غير محلّي** في CORS_ORIGIN (firstPublicOrigin) — الصح",
  PUBLIC_URL: "اختياري، مستخدم في روابط المرفقات بافتراضي سليم",
  ACCESS_TTL_MIN: "الافتراضي مقصود",
  REFRESH_TTL_DAYS: "الافتراضي مقصود",
  RATE_LIMIT: "الافتراضي = مفعّل؛ بيتقفل في الاختبارات بس",
  RING_TIMEOUT_MS: "الافتراضي ٤٥ ثانية مقصود",
  TRANSLATE_DAILY_CHARS: "الافتراضي ١٥٠٠٠ شغّال؛ تغييره محتاج سطر (مكتوب في CLAUDE.md)",
  TRANSLATE_USER_DAILY_CHARS: "الافتراضي ٣٠٠٠ شغّال؛ نفس الملحوظة",
  OTP_DEV_CODE: "**ممنوع** في الإنتاج — loadConfig بيرمي لو اتضبط",
  NODE_ENV: "متضبط صريح في compose كـ production",
};

describe("متغيرات الإنتاج توصل للكونتينر فعلًا", () => {
  it("المفاتيح الحسّاسة اللي شغّالة دلوقتي كلها لسه في environment: بتاعة الـ api", () => {
    // لو أي سطر من دول اتشال، الميزة بتموت في سكوت — ده الارتداد اللي بنحرسه
    for (const k of [
      "DATABASE_URL", "JWT_SECRET", "CORS_ORIGIN", "OWNER_CONTACTS",
      "RESEND_KEY", "EMAIL_FROM",          // كود التحقق بالإيميل (الطريق الوحيد حاليًا)
      "GOOGLE_TRANSLATE_KEY",              // الترجمة المدفوعة (احتياطي)
      "LIBRETRANSLATE_URL",                // الترجمة المجانية — من غير السطر الخدمة شغّالة ومحدش بيكلّمها
      "STUN_URLS", "TURN_URLS", "TURN_SECRET", // المكالمات
      "VAPID_PUBLIC", "VAPID_PRIVATE", "VAPID_SUBJECT", // الإشعارات
      "RETENTION",                         // الحذف التلقائي (الدرس الأصلي)
      "BANNED_WORDS",                      // فلتر المحتوى — كان ناقصًا لحد ١٤ أكتوبر
    ]) {
      expect(apiEnv.has(k), `${k} مش في environment: بتاعة الـ api — الميزة دي هتموت في سكوت`).toBe(true);
    }
  });

  it("مفيش مفتاح جديد الكود بيقراه وcompose نسيه (من غير ما يكون معروف ومكتوب)", () => {
    const missing = configKeys.filter((k) => !apiEnv.has(k) && !(k in KNOWN_UNPASSED));
    expect(missing, `مفاتيح الكود بيقراها وcompose مابيمرّرهاش: ${missing.join(", ")} — ضيفيها في compose أو اكتبي السبب في KNOWN_UNPASSED`).toEqual([]);
  });

  it("قايمة المعروف مافيهاش مفاتيح ما بقتش موجودة (ما تتراكمش)", () => {
    const stale = Object.keys(KNOWN_UNPASSED).filter((k) => !configKeys.includes(k) && !apiEnv.has(k));
    expect(stale, `مفاتيح في KNOWN_UNPASSED مش موجودة في config.ts خلاص: ${stale.join(", ")}`).toEqual([]);
  });

  it("فلتر المحتوى: القايمة الفاضية معناها الفلتر بيعدّي كل حاجة — فالمفتاح مش رفاهية", () => {
    const cf = fs.readFileSync(path.join(ROOT, "server/src/lib/contentFilter.ts"), "utf8");
    expect(cf).toContain("if (!list.length) return;");
    // اتصلح ١٤ أكتوبر: السطر موجود في compose، ولو اتشال تاني الاختبار الأول فوق
    // بيكشفه — لأن سياسة الخصوصية (بند ١١) بتوعد العميل بمرشّح آلي، وبند ١.٢ عند
    // آبل وسياسة UGC عند بلاي بيطلبوه.
    expect(apiEnv.has("BANNED_WORDS")).toBe(true);
    expect("BANNED_WORDS" in KNOWN_UNPASSED).toBe(false);
  });
});

/**
 * **شكل سطر `CORS_ORIGIN` نفسه — والترتيب فيه هو المعنى.**
 *
 * الخلفية (١٨ أكتوبر ٢٠٢٦): `CORS_ORIGIN` **مش في `.env.production` خالص** — مبنيّ
 * جوه compose من `DOMAIN`. فأي محاولة لإضافة أصل بتعديل `.env.production` كانت
 * بتدوّر على سطر مش موجود و**مابتعملش حاجة في سكوت** (الدليل وقتها: `printenv`
 * جوه الحاوية لسه بيطلّع القيمة القديمة بعد `Started` مش `Running`). والحل
 * `${CORS_EXTRA:-}` في آخر السطر.
 *
 * الحارس هنا **على السلوك مش على النصّ**: بيعمل الاستبدال اللي compose بيعمله
 * ويسأل `firstPublicOrigin` — نفس الدالة اللي `APP_URL` الفاضي بياخد منها. لو حد
 * نقل `${CORS_EXTRA:-}` لأول السطر، الأصل المحلي يبقى الأول، و**كل إيميل تحقق
 * لكل المستخدمين** رابطه `https://localhost` واللوجو مايظهرش — عطل صامت تمامًا
 * (الإيميل بيوصل عادي). الاختبار ده بيمسك النقلة دي.
 */
describe("سطر CORS_ORIGIN في compose", () => {
  const line = compose.split("\n").find((l) => /^ {6}CORS_ORIGIN:/.test(l)) ?? "";

  /** نفس اللي compose بيعمله: يحلّ المتغيرات ويسيب القيمة النهائية */
  const resolved = line
    .replace(/^ {6}CORS_ORIGIN:\s*/, "")
    .replace(/\$\{DOMAIN(:\?[^}]*)?\}/g, "example.com")
    .replace(/\$\{CORS_EXTRA:-\}/g, ",https://localhost");

  it("لسه فيه حارس DOMAIN — السيرفر مايقومش بدومين فاضي", () => {
    expect(line, "حارس `${DOMAIN:?...}` اتشال — compose هيقوم بأصول ناقصة").toMatch(/\$\{DOMAIN:\?/);
  });

  it("بيقبل أصولًا زيادة من الإعداد (وإلا الـ APK مايقدرش يكلّم السيرفر)", () => {
    expect(line, "`${CORS_EXTRA:-}` مش موجود — فإضافة أي أصل بتتطلّب تعديل compose تاني").toContain(
      "${CORS_EXTRA:-}",
    );
  });

  it("🔴 الأصول الزيادة في آخر السطر — الأول معناها روابط إيميل مكسورة للكل", () => {
    expect(line.trimEnd().endsWith("${CORS_EXTRA:-}"), `CORS_EXTRA مش في الآخر: ${line.trim()}`).toBe(true);
    // الفحص الحاسم على **السلوك**: أول أصل غير محلّي لازم يفضل دومين التطبيق
    expect(firstPublicOrigin(resolved)).toBe("https://app.example.com");
    expect(resolved.endsWith("https://localhost")).toBe(true);
  });
});
