/**
 * **نصوص التطبيق مطابقة للشروط المنشورة** (بطلب داليا ٢٦ أكتوبر ٢٠٢٦).
 *
 * الحارس ده مختلف عن أي حارس نصّي تاني في المشروع: مابيدوّرش على كلمات محفوظة
 * في الكود، لكنه **بيقرا `public/legal/*.html` ويستخرج منها الوعد، وبعدين يفحص
 * نصوص `src/` عليه**. يعني لو السياسة نفسها اتغيّرت يومًا، الحارس يتغيّر معناه
 * معاها بدل ما يفضل بيحرس جملة قديمة — نفس درس `OUR_DOMAINS` اللي فضل بيحرس
 * الدومين القديم بعد الانتقال.
 *
 * وكل فحص بيتأكد الأول إن **المصدر اتقرا فعلًا** (الجملة لسه في الصفحة)، عشان
 * مايعدّيش على نصّ فاضي بلا معنى.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const TERMS = read("public/legal/terms.html");
const PRIVACY = read("public/legal/privacy.html");

/** كل ملفات الواجهة، والحكم على النصّ **بعد شيل التعليقات** — التعليق بيشرح العطل
 *  فبيسمّي بالضرورة الحاجة اللي بيحذّر منها (تكرر ٣ مرات: حارس `Capacitor.Plugins`
 *  و`|| true` في وظيفة الأندرويد و«فاضية» في `roomLive`). */
function srcFiles(): { rel: string; code: string }[] {
  const out: { rel: string; code: string }[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) {
        out.push({ rel, code: read(rel).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "") });
      }
    }
  };
  walk("src");
  return out;
}

const FILES = srcFiles();

/** كل حرفيّة نصّية في الواجهة (التلات أشكال — درس استخراج الفصحى: الاقتصار على
 *  علامتي التنصيص أسقط حرفيّات القوالب في سكوت) */
function literals(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  for (const { rel, code } of FILES) {
    for (const re of [/"([^"\\\n]{3,400})"/g, /'([^'\\\n]{3,400})'/g, /`([^`]{3,400})`/g]) {
      for (const m of code.matchAll(re)) out.push({ rel, text: m[1] });
    }
  }
  return out;
}

const LITERALS = literals();

describe("نصوص التطبيق مطابقة للشروط المنشورة", () => {
  it("الحارس بيقرا ملفات فعلًا (وإلا بيعدّي بلا معنى)", () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(LITERALS.length).toBeGreaterThan(500);
  });

  /**
   * 🔴 الشروط البند ٢ والسياسة البند ١٠: «رع شات للبالغين: ١٨ سنة أو أكثر».
   * وشاشة الملف الشخصي كانت بتقول للمستخدم «التطبيق مفتوح لكل الأعمار» — عكس
   * المستند المنشور بالظبط، والجملة دي اتشالت من الصفحات في ١٤ أكتوبر.
   */
  it("🔴 ١٨+: مفيش نصّ في التطبيق بيقول إنه مفتوح لكل الأعمار", () => {
    // المصدر: الصفحة لازم تكون لسه بتقول ١٨+، وإلا الفحص ده بقى بلا أساس
    expect(TERMS, "الشروط ماعادتش تقول «للبالغين» — راجعي الحارس مع الصفحة").toMatch(/للبالغين/);
    expect(PRIVACY).toMatch(/التطبيق للبالغين|مخصَّص لمن بلغ/);

    const bad = LITERALS.filter((l) => /لكل الأعمار|لكلّ الأعمار|open to all ages|all ages/i.test(l.text));
    expect(bad.map((b) => `${b.rel}: ${b.text.slice(0, 70)}`), "التطبيق ١٨+ في الشروط — ممنوع أي نصّ يقول غير كده").toEqual([]);
  });

  /**
   * 🔴 السياسة البند ٩ صريحة: «المحادثات **ليست مشفّرة من طرف إلى طرف**؛ لذلك لا
   * تشارك بيانات شديدة الحساسية فيها». وشاشة الحساب كانت فيها شارة خضراء بدرع
   * «محمي · تشفير مفعّل» تحت اسم المستخدم — ودي بتتقرا «رسائلك مشفّرة»، فالمستخدم
   * يشارك بيانات حساسة بناءً على وعد السياسة نفسها بتحذّر منه.
   *
   * المسموح: ذكر تشفير **الاتصال/الخادم/TLS** — وده اللي السياسة بتقوله فعلًا.
   */
  it("🔴 التشفير: مفيش نصّ بيدّعي تشفير المحادثات (والسياسة بتقول إنها غير مشفّرة)", () => {
    expect(PRIVACY, "السياسة ماعادتش تقول إن المحادثات غير مشفّرة — راجعي الحارس معاها")
      .toMatch(/ليست مشفّرة من طرف إلى طرف/);

    const claims = LITERALS.filter((l) => {
      if (!/مشفّر|مشفر|تشفير|encrypt/i.test(l.text)) return false;
      // استثناء ما هو صحيح فعلًا: تشفير النقل بين التطبيق والخادم
      if (/TLS|الاتصال|الخادم|السيرفر|connection|server|transit/i.test(l.text)) return false;
      // ونصّ السياسة نفسه لما نقتبسه حرفيًّا («ليست مشفّرة…»)
      if (/ليست مشفّرة|not end-to-end|غير مشفّرة|not encrypted/i.test(l.text)) return false;
      return true;
    });
    expect(claims.map((c) => `${c.rel}: ${c.text.slice(0, 70)}`), "ادعاء تشفير غير مدعوم بالسياسة").toEqual([]);
  });

  /**
   * 🔴 أنواع المحادثات في المخطّط: فردية · مجموعة · قناة. و«الدردشات السرية» **نوع
   * غير موجود** — وكان فيه مفتاح في شاشة الحساب باسمه («حظر لقطة الشاشة في
   * الدردشات السرية») مفتوح افتراضيًّا. يعني وعد بميزة أمان باسم ميزة غير موجودة،
   * وحظر لقطة الشاشة مستحيل أصلًا في الويب.
   */
  it("🔴 مفيش «دردشات سرية» — نوع غير موجود في المخطّط", () => {
    const schema = read("server/prisma/schema.prisma");
    const m = schema.match(/enum ThreadType \{([^}]+)\}/);
    expect(m, "مالقيتش ThreadType — صلّحي الحارس مع المخطّط").toBeTruthy();
    expect(m![1], "لو بقى فيه نوع سرّي فعلًا، النصّ ينفع يرجع").not.toMatch(/secret/i);

    const bad = LITERALS.filter((l) => /دردشات سرية|الدردشات السرية|secret chat/i.test(l.text));
    expect(bad.map((b) => b.rel), "ميزة غير موجودة مذكورة في الواجهة").toEqual([]);
  });

  /**
   * 🔴 **مفتاح ميت في شاشة الخصوصية أسوأ من غيابه** — بيطمئن المستخدم على حاجة
   * مابتحصلش. كان فيه تلاتة: `hidePhone` و`blockShots` و`addByAll`، كلها `useState`
   * محدش بيقراها ومفيش حقل خصوصية واحد في `User`.
   *
   * والفحص على **السلوك**: أي `ToggleRow` قيمته متغيّر بسيط، لازم المتغيّر ده
   * يُستخدَم في مكان تالت غير سطر تعريفه وسطر المفتاح — وإلا فهو بلا أثر.
   */
  it("🔴 مفيش مفتاح في شاشة الحساب بلا أثر", () => {
    const code = read("src/screens/AccountScreen.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const rows = [...code.matchAll(/<ToggleRow[^>]*?value=\{([A-Za-z_$][\w$]*)\}/g)].map((m) => m[1]);
    const dead = rows.filter((v) => {
      const uses = [...code.matchAll(new RegExp(`\\b${v}\\b`, "g"))].length;
      return uses <= 2; // تعريفه + المفتاح وبس
    });
    expect(dead, "مفتاح محدش بيقرا قيمته — يتنفَّذ فعلًا أو يتشال").toEqual([]);
  });

  /**
   * 🔴 السياسة بتوعد بموافقة **صريحة ومنفصلة عن قبول الشروط** عند تفعيل الترجمة،
   * **لأنها ترسل النص إلى مزوّد خارجي**. وشيت الترجمة كان مفتاحًا بلا ولا كلمة عن
   * كده — فنفس نمط «نمحو بياناته فورًا» بلا آلية: وعد منشور مالوش طريق في التطبيق.
   */
  it("🔴 الترجمة: الشيت بيسمّي المزوّد الخارجي اللي السياسة بتسمّيه", () => {
    expect(PRIVACY, "السياسة ماعادتش تطلب موافقة منفصلة للترجمة — راجعي الحارس")
      .toMatch(/تفعيل الترجمة/);
    const provider = PRIVACY.match(/Google Cloud Translation/);
    expect(provider, "مزوّد الترجمة مش مسمّى في السياسة — صلّحي الحارس").toBeTruthy();

    const sheet = read("src/components/Translate.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(sheet, "الشيت لازم يسمّي المزوّد قبل التفعيل").toMatch(/Google Cloud Translation/);
    expect(sheet, "ولازم يقول إن النصّ بيتبعت له").toMatch(/إرسال نصّ|يُرسَل|to send/);
  });
});
