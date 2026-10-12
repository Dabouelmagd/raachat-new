/**
 * **التحديث التلقائي بعد كل نشر.**
 *
 * المشكلة: بعد أي نشر، المتصفح بيفضل شغّال على `index.html` المحفوظ عنده — وهو
 * بيشاور على ملفات JS قديمة (المحفوظة بأسماء فيها بصمة، فبتفضل شغالة للأبد).
 * النتيجة إن المستخدم يقعد على نسخة قديمة لحد ما يعمل «تحديث قوي» بإيده، وده
 * حصل فعلًا (١٢ أكتوبر). ملحوظة: الـ service worker هنا **مابيكاشّش حاجة** —
 * هو للإشعارات بس — فالكاش ده كاش المتصفح العادي.
 *
 * الطريقة: بنجيب `index.html` **من غير كاش** ونشوف اسم ملف الـ JS اللي جواه.
 * لو اتغيّر عن اللي شغّال دلوقتي، يبقى فيه نشرة جديدة. مفيش endpoint جديد ولا
 * رقم إصدار نكتبه بإيدينا — بصمة Vite هي علامة النسخة.
 *
 * ومتى بنعمل reload: **بس لما التطبيق يبقى مش قدام المستخدم** (تاب مخفي أو
 * الموبايل في الخلفية) — عشان مانقطعش عليه وهو بيكتب أو بيكلّم حد. ولو فيه
 * رسالة نصّها لسه مكتوب وما اتبعتش، بنأجّل خالص (`setUpdateBlocked`).
 */
const CHECK_MS = 5 * 60_000;
const TRIED = "rachat-update-tried";

let blocked = false;
/** امنع إعادة التحميل دلوقتي (مسوّدة رسالة مكتوبة، مكالمة شغالة…) */
export function setUpdateBlocked(v: boolean) {
  blocked = v;
}

/** اسم ملف الـ JS اللي التطبيق شغّال منه دلوقتي */
function currentAsset(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return s?.getAttribute("src") ?? null;
}

/** اسم ملف الـ JS في آخر نسخة منشورة */
async function latestAsset(): Promise<string | null> {
  const r = await fetch("/index.html", { cache: "no-store" });
  if (!r.ok) return null;
  const html = await r.text();
  return /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1] ?? null;
}

async function check() {
  const cur = currentAsset();
  if (!cur) return; // نسخة الملف الواحد (الديمو) — مفيش حاجة تتابع
  let latest: string | null = null;
  try {
    latest = await latestAsset();
  } catch {
    return; // مفيش نت أو السيرفر مش بيرد — نجرّب تاني المرة الجاية
  }
  if (!latest || latest === cur) return;

  // جرّبنا نحدّث للنسخة دي قبل كده والصفحة رجعت بنفس الملف؟ يبقى فيه حاجة غلط
  // (وسيط كاش في النص مثلًا) — منعملش لفة إعادة تحميل لا نهائية.
  try {
    if (sessionStorage.getItem(TRIED) === latest) return;
    sessionStorage.setItem(TRIED, latest);
  } catch {
    /* التخزين مقفول — نكمّل عادي */
  }

  const reloadWhenAway = () => {
    if (document.visibilityState === "visible" || blocked) return;
    location.reload();
  };
  reloadWhenAway(); // لو هو أصلًا مش قدامه دلوقتي
  document.addEventListener("visibilitychange", reloadWhenAway);
}

/** يبدأ المتابعة: عند الفتح، وكل ٥ دقايق، وكل ما المستخدم يرجع للتطبيق */
export function startUpdateWatch() {
  if (typeof window === "undefined") return;
  const run = () => void check();
  setTimeout(run, 15_000); // مش أول حاجة عند الفتح — نسيب التطبيق يقوم الأول
  setInterval(run, CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
}
