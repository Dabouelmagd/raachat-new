#!/usr/bin/env node
/**
 * فحص قايمة الكلمات الممنوعة **قبل** ما تتضبط في الإنتاج.
 *
 * ليه الفحص ده موجود: الفلتر في `server/src/lib/contentFilter.ts` بيطابق
 * **جزءًا من النص** بعد تطبيع الحروف. يعني:
 *   - كلمة قصيرة (حرفين أو تلاتة) ممكن تكون جوه كلمات سليمة كتير، فتحجب كلام
 *     عادي — وأسوأ حاجة في فلتر المحتوى إنه يمنع الناس من الكلام المشروع.
 *   - والقايمة الفاضية بتخلّي الفلتر **يعدّي كل حاجة في سكوت**.
 * فالفحص بيرفض الاتنين، وبيجرّب القايمة على جُمل عربية سليمة قبل أي ضبط.
 *
 * الاستخدام:  node bannedcheck.mjs <ملف القايمة>
 *   كل سطر كلمة (أو مفصولة بفاصلة)، والأسطر اللي تبدأ بـ # تعليق.
 * الخرج: على stdout القايمة المطبّعة مفصولة بفاصلة (جاهزة للمتغير)، والتقرير على stderr.
 * الخروج: 0 = سليمة · 1 = فيها مشكلة (والسبب مكتوب).
 */
import fs from "node:fs";

/** نفس تطبيع السيرفر بالحرف (`contentFilter.ts`) — لو اتغيّر هناك لازم يتغيّر هنا. */
export const norm = (s) =>
  s.toLowerCase().normalize("NFKD")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[​-‏‪-‮]/g, "");

/** أقصر طول مسموح. الحرفين عمليًا بيطابقوا نص اللغة، والتلاتة لسه خطر. */
export const MIN_LEN = 4;

/**
 * جُمل عربية **سليمة تمامًا** — لو القايمة حجبت واحدة منها يبقى فيها كلمة
 * بتطابق كلام عادي، والضبط بيترفض. (دي مش قايمة شاملة، هي شبكة أمان.)
 */
export const INNOCENT = [
  "السلام عليكم ورحمة الله وبركاته",
  "صباح الخير يا جماعة، عامل إيه النهارده؟",
  "تمام يا باشا، هنتكلم بعد الاجتماع إن شاء الله",
  "الحمد لله على كل حال، ربنا يكرمك ويبارك فيك",
  "بعت لك الملف على الإيميل، راجعه وقولي رأيك",
  "الحساب اتسدد والفاتورة وصلت، شكرًا على سرعة الرد",
  "عيد ميلاد سعيد! عقبال مية سنة بالصحة والسلامة",
  "الاجتماع اتأجل لبكرة الساعة عشرة الصبح في المكتب",
  "ابني في الحضانة والبنت في المدرسة، والبيت هادي شوية",
  "ماتزعلش مني، أنا قصدي أساعدك مش أكتر",
  "الدكتور قال لازم تمارين رياضة كل يوم نص ساعة",
  "hello how are you doing today, see you soon",
  // ── مصايد حقيقية اتكشفت وأنا بجهّز مسوّدة قايمة (١٤ أكتوبر): كل واحدة فيهم
  // كانت بتتحجب بكلمة شكلها «مسيئة» وهي جوه كلام عادي تمامًا.
  "الجنسية المصرية مكتوبة في البطاقة",        // «جنسيه»
  "كلبه لطيف وبيحبه جدًا",                     // «كلبه» = كلب + هاء الملكية
  "حيوانه الأليف عند الدكتور",                 // «حيوانه»
  "الزبالة معدية كل يوم الصبح",                // «زباله»
  "العميل متخلف عن السداد شهرين",              // «متخلف»
  "الاجتماع مكتمل النصاب القانوني",            // «نصاب»
  "خدي بالك، في عمليات احتيال كتير بالتليفون",  // «احتيال» — الكلمة بتُستخدم للتحذير
  "الكلام ده عنصري وبلّغت عنه",                 // «عنصري» — الكلمة بتُستخدم للشكوى
  "الخبر عن هجوم إرهابي في الأخبار",            // «ارهابي»
  "الأكل معفن، ماتاكلوهوش",                    // «معفن»
  "المبلغ ده حقير مقابل الشغل كله",             // «حقير»
  "ارسل فلوس للبيت أول الشهر",                 // «ارسل فلوس»
  // ⚠️ الأهم: كلمات الأزمة **ممنوع** تدخل الفلتر. اللي بيقول كده محتاج يوصل
  // لحد، والحجب بيسكّته. دي شغل البلاغ والمراجعة البشرية مش الفلتر.
  "محتاج أتكلم مع حد، بفكر في الانتحار",        // «انتحار»
];

export function parseList(text) {
  const raw = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .flatMap((l) => l.split(","))
    .map((w) => w.trim())
    .filter(Boolean);
  const problems = [];
  const seen = new Map();
  const words = [];
  for (const w of raw) {
    const n = norm(w);
    if (!n) { problems.push(`«${w}»: بقى فاضي بعد التطبيع`); continue; }
    if (n.length < MIN_LEN) { problems.push(`«${w}»: أقصر من ${MIN_LEN} حروف — بيطابق كلام سليم كتير`); continue; }
    if (seen.has(n)) { problems.push(`«${w}»: مكرّرة (زي «${seen.get(n)}» بعد التطبيع)`); continue; }
    // كلمة جوه كلمة تانية في نفس القايمة = الأطول مالهاش لازمة (الأقصر بتمسكها أصلًا)
    const inside = words.find((p) => n.includes(p) || p.includes(n));
    if (inside) { problems.push(`«${w}»: متداخلة مع «${inside}» — واحدة منهم تكفي`); continue; }
    seen.set(n, w);
    words.push(n);
  }
  return { words, problems };
}

/** أي كلمة بتطابق جملة سليمة = القايمة بتحجب كلامًا مشروعًا */
export function falsePositives(words, samples = INNOCENT) {
  const hits = [];
  for (const s of samples) {
    const n = norm(s);
    for (const w of words) if (n.includes(w)) hits.push({ word: w, sentence: s });
  }
  return hits;
}

// ── التشغيل من سطر الأوامر
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const file = process.argv[2];
  if (!file) { console.error("❌ الاستخدام: node bannedcheck.mjs <ملف القايمة>"); process.exit(1); }
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { console.error(`❌ مش قادر أقرا ${file}: ${e.message}`); process.exit(1); }

  const { words, problems } = parseList(text);
  for (const p of problems) console.error(`⚠️ ${p}`);

  if (!words.length) {
    console.error("❌ القايمة فاضية — والقايمة الفاضية معناها الفلتر بيعدّي كل حاجة في سكوت. مفيش حاجة اتضبطت.");
    process.exit(1);
  }
  const hits = falsePositives(words);
  if (hits.length) {
    console.error(`❌ القايمة بتحجب كلامًا سليمًا (${hits.length} حالة) — مفيش حاجة اتضبطت:`);
    for (const h of hits.slice(0, 10)) console.error(`   «${h.word}» موجودة في: ${h.sentence}`);
    process.exit(1);
  }
  console.error(`✅ ${words.length} كلمة، أقصرها ${Math.min(...words.map((w) => w.length))} حروف، ومفيش تطابق على ${INNOCENT.length} جملة سليمة.`);
  process.stdout.write(words.join(","));
}
