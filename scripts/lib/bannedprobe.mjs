#!/usr/bin/env node
/**
 * فحص إيجابي **جوه الكونتينر الشغّال**: بينادي فلتر السيرفر نفسه
 * (`dist/lib/contentFilter.js`) بكلمة من القايمة — لازم تترفض — وبجملة سليمة —
 * لازم تعدّي.
 *
 * ليه كده مش «السطر موجود في الملف»: `BANNED_WORDS` لو مش في `environment:`
 * بتاعة الـ api **مابيوصلش للعملية خالص** (درس RETENTION)، و`contentFilter`
 * بيرجع من غير ما يفحص حرف لو القايمة فاضية — **في سكوت**. فالدليل الوحيد
 * المقبول هو إن الفلتر رفض فعلًا.
 *
 * التشغيل جوه الحاوية:  RC_PROBE=<كلمة> node --input-type=module - < bannedprobe.mjs
 */
const LIB = process.env.RC_FILTER_LIB || "/app/dist/lib/contentFilter.js";
const probe = process.env.RC_PROBE || "";
const words = (process.env.BANNED_WORDS || "").split(",").map((w) => w.trim()).filter(Boolean);

if (!words.length) {
  console.error("❌ BANNED_WORDS مش واصل للكونتينر أو فاضي — الفلتر بيعدّي كل حاجة في سكوت.");
  console.error("   لازم يبقى في environment: بتاعة الـ api في docker-compose.prod.yml.");
  process.exit(1);
}
if (!probe) { console.error("❌ مفيش RC_PROBE (كلمة للفحص)"); process.exit(1); }

let assertClean;
try {
  ({ assertClean } = await import(LIB.startsWith("/") ? `file://${LIB}` : LIB));
} catch (e) {
  console.error(`❌ مش لاقي فلتر السيرفر في ${LIB} — شغّلي الفحص جوه حاوية الـ API. (${e.message})`);
  process.exit(1);
}

const ctx = { config: { BANNED_WORDS: process.env.BANNED_WORDS } };
const rejects = (text) => { try { assertClean(ctx, text); return false; } catch { return true; } };

if (!rejects(probe)) {
  console.error("❌ الفلتر ما رفضش كلمة من القايمة — مش شغّال.");
  process.exit(1);
}
const innocent = "صباح الخير يا جماعة، عامل إيه النهارده؟";
if (rejects(innocent)) {
  console.error("❌ الفلتر رفض جملة سليمة — القايمة بتحجب كلامًا مشروعًا.");
  process.exit(1);
}
console.log(`✅ الفلتر شغّال جوه الـ API: ${words.length} كلمة — بيرفض الممنوع وبيعدّي الكلام السليم.`);
