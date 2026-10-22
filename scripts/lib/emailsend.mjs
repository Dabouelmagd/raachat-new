#!/usr/bin/env node
/**
 * يبعت **إيميل تحقق حقيقي** من جوه حاوية الـ API بـ**نفس كود السيرفر**
 * (`dist/lib/senders.js` + `dist/config.js`) — مش نداء curl بإيدينا.
 *
 * ليه نفس الكود: الحاجة اللي عايزين نتأكد منها هي المسار اللي المستخدم بيمشي
 * فيه بالظبط — `EMAIL_FROM` اللي وصل **للعملية** (مش اللي في الملف، درس
 * RETENTION) + المفتاح + القالب + اختيار `APP_URL`. نداء منفصل كان هيعدّي وهو
 * بيجرّب حاجة تانية.
 *
 * 🔴 **والكود نفسه مابيتطبعش** — ناتج السكربت لازم يبقى بلا سر. الدليل على
 * النجاح هو وصول الإيميل، واللي يقوله المستخدم مش السكربت.
 *
 * الخروج: 0 اتبعت (Resend قبلت) · 1 فشل أو القناة مش مضبوطة
 * التشغيل: $DC exec -T -e RC_TEST_TO=you@example.com api node --input-type=module - < emailsend.mjs
 */
const SND = process.env.RC_SENDERS_LIB || "/app/dist/lib/senders.js";
const CFG = process.env.RC_CONFIG_LIB || "/app/dist/config.js";
const url = (p) => (p.startsWith("/") ? `file://${p}` : p);
const to = (process.env.RC_TEST_TO || "").trim();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.log(`❌ RC_TEST_TO مش عنوان صحيح`);
  process.exit(1);
}

/** كل استيراد لوحده عشان الرسالة تسمّي المودیول اللي فشل فعلًا (درس setbirth) */
async function need(path, what) {
  try { return await import(url(path)); }
  catch (e) { console.log(`❌ مش قادر أحمّل ${what} من ${path} — شغّلي ده جوه حاوية الـ API. (${e.message})`); process.exit(1); }
}
const { providerSender } = await need(SND, "كود الإرسال");
const { loadConfig } = await need(CFG, "إعدادات السيرفر");

const cfg = loadConfig();
const sender = providerSender(cfg);
if (sender.ready?.("email") === false) {
  console.log("❌ قناة الإيميل مش مضبوطة في العملية (RESEND_KEY أو EMAIL_FROM ناقص)");
  process.exit(1);
}

// كود عشوائي زي الحقيقي — ومابيتطبعش
const code = String(Math.floor(Math.random() * 900000) + 100000);
try {
  await sender.send("email", to, code);
} catch (e) {
  console.log(`❌ الإرسال فشل: ${e?.message ?? e} — السبب بالتفصيل في لوج الـ api فوق`);
  process.exit(1);
}
console.log(`✅ اتبعت من: ${cfg.EMAIL_FROM}`);
console.log("   (Resend قبلته — والدليل الحقيقي إنه يوصل)");
