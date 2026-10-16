/**
 * **التحديث التلقائي للوحة بعد كل نشر.**
 *
 * المشكلة: بعد أي نشر، المتصفح بيفضل على النسخة المحفوظة عنده — فاللوحة تقعد
 * على كود قديم لحد ما المستخدم يعمل تحديث بإيده. ومع اللوحة ده أوقع من
 * التطبيق، لأن تبويب اللوحة بيفضل مفتوح أيام.
 *
 * **والطريقة هنا مختلفة عن `src/update.ts` بتاع التطبيق عن قصد:** التطبيق
 * بيتبني ملفات منفصلة فبيقارن اسم ملف الـ JS (فيه بصمة Vite). اللوحة بتتبني
 * **ملف واحد** (`viteSingleFile`) — كله مدموج جوه `index.html` ومفيش
 * `<script src>` خالص — فمقارنة الأسماء مستحيلة وبتسكت من غير أي خطأ. فالبصمة
 * بتتحقن وقت البناء (`__BUILD__` في `admin/vite.config.js`) ونفس القيمة بتتكتب
 * في `version.txt` جنب الملف، وإحنا بنسأل السيرفر عنها بلا كاش.
 *
 * ومتى بنعمل reload: **بس لما اللوحة تبقى مش قدام المستخدم** (تاب مخفي) وهو
 * مش في وسط حفظ ولا سايب كلام مكتوب في فورم. ولو هي قدامه، بنعرض شريط «فيه
 * نسخة جديدة» وهو يقرر — عشان ما نسحبش الصفحة من تحت إيده وهو بيشتغل.
 * (التطبيق بيستنى التاب يختفي وخلاص، لأن المستخدم بيفتحه ويقفله طول اليوم؛
 * اللوحة بتفضل مفتوحة، فالاستنى-لحد-ما-يختفي لوحده معناه «عمرها ما تتحدّث».)
 */
const CHECK_MS = 5 * 60_000;
const FIRST_MS = 15_000; // مش أول حاجة عند الفتح — نسيب اللوحة تقوم الأول
const TRIED = "rachat-admin-update-tried";
export const VERSION_URL = "/version.txt";

let holds = 0;
let found = null; // بصمة النسخة الجديدة بعد ما نلاقيها
const subs = new Set();

/**
 * امنع إعادة التحميل طول ما الإجراء شغّال، وسيبها لما يخلص.
 * عدّاد مش بوليان عشان إجراءين في نفس الوقت: اللي يخلص الأول مايرفعش الحجب
 * عن اللي لسه شغّال.
 */
export function holdUpdate() {
  holds++;
  let done = false;
  return () => { if (!done) { done = true; holds--; } };
}

/** يسمع لما نلاقي نسخة جديدة (للشريط في الواجهة) */
export function onUpdateFound(cb) {
  subs.add(cb);
  if (found) cb(found);
  return () => subs.delete(cb);
}

export function reloadNow() {
  location.reload();
}

/** بصمة النسخة اللي اللوحة دي **مبنية منها** (بتتحقن وقت البناء) */
export function buildId() {
  return typeof __BUILD__ === "string" && __BUILD__ ? __BUILD__ : null;
}

/**
 * بصمة صالحة من ردّ السيرفر، وإلا `null`.
 *
 * الفحص ده **مش شكليات**: لو `version.txt` مش موجود وسيرفر الملفات ردّ
 * بـ`index.html` بدلًا منه (سلوك SPA الشائع)، النص اللي جاي بيبقى صفحة HTML
 * كاملة — وهي بطبيعتها «مختلفة عن بصمتنا» في كل مرة، فكل فحص يقول «فيه نشرة
 * جديدة» وتدخل اللوحة في **لفة إعادة تحميل**. فالبصمة لازم تبقى سطرًا قصيرًا
 * من حروف وأرقام، وأي حاجة غير كده بتترفض.
 */
export function parseVersion(text) {
  const v = (text || "").trim();
  return /^[\w.-]{1,64}$/.test(v) ? v : null;
}

/**
 * فيه شغل ممكن يضيع؟ (حفظ شغّال، أو كلام مكتوب في أي فورم زي إضافة عضو
 * للفريق أو اسم دور جديد). الفلاتر والبحث برّه الفورمات فمابتحجبش.
 */
export function wouldLoseWork() {
  if (holds > 0) return true;
  const fields = document.querySelectorAll("form input, form textarea");
  for (const el of fields) {
    if (el.disabled || el.type === "checkbox" || el.type === "radio") continue;
    if ((el.value || "").trim() !== "") return true;
  }
  return false;
}

async function check() {
  const cur = buildId();
  if (!cur) return; // البصمة مش محقونة (بناء من غير الإعداد) — مفيش حاجة نقارن بيها
  let latest = null;
  try {
    const r = await fetch(VERSION_URL, { cache: "no-store" });
    if (!r.ok) return;
    latest = parseVersion(await r.text());
  } catch {
    return; // مفيش نت أو السيرفر مش بيرد — نجرّب تاني المرة الجاية
  }
  if (!latest || latest === cur) return;

  // جرّبنا النسخة دي قبل كده واللوحة رجعت بنفس البصمة؟ يبقى فيه حاجة غلط
  // (وسيط كاش في النص مثلًا) — منعملش لفة إعادة تحميل لا نهائية.
  try {
    if (sessionStorage.getItem(TRIED) === latest) return;
    sessionStorage.setItem(TRIED, latest);
  } catch {
    /* التخزين مقفول — نكمّل عادي */
  }

  found = latest;
  subs.forEach((f) => f(latest));

  const reloadWhenAway = () => {
    if (document.visibilityState === "visible" || wouldLoseWork()) return;
    location.reload();
  };
  reloadWhenAway(); // لو هي أصلًا مش قدامه دلوقتي
  document.addEventListener("visibilitychange", reloadWhenAway);
}

/** يبدأ المتابعة: بعد الفتح بشويّة، وكل ٥ دقايق، وكل ما المستخدم يرجع للوحة */
export function startUpdateWatch() {
  if (typeof window === "undefined") return;
  const run = () => void check();
  setTimeout(run, FIRST_MS);
  setInterval(run, CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
}
