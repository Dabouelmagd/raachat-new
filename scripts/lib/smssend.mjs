#!/usr/bin/env node
/**
 * يبعت رسالة SMS **حقيقية** بمواصفة `SMS_HTTP` ويطبع حكمًا واضحًا.
 * بيستخدم **نفس كود السيرفر** (`lib/sms.js` المبني) — فاللي بيتجرّب هنا هو اللي
 * هيشتغل في الإنتاج، مش تقليد له. فبيتشغّل جوه حاوية الـ API.
 *
 * التشغيل:  SMS_HTTP=<base64> node smssend.mjs <01xxxxxxxxx> [كود]
 *   و`SMS_LIB` لتغيير مسار المكتبة (الافتراضي `/app/dist/lib/sms.js` جوه الحاوية).
 * الخروج: 0 = المزوّد قال نجحت · 1 = فشلت (والسبب بيتطبع بعد حجب الأسرار).
 *
 * ⚠️ «المزوّد قال نجحت» **مش** دليل إن الرسالة وصلت — علامة `ok` ممكن تكون غلط
 * فتطابق رد خطأ. الحكم النهائي هو وصول الرسالة، و`set-sms-keys.sh` بيسأل عليه
 * قبل ما يكتب أي حاجة.
 */
const LIB = process.env.SMS_LIB || "/app/dist/lib/sms.js";
let sms;
try {
  sms = await import(LIB.startsWith("/") ? `file://${LIB}` : LIB);
} catch (e) {
  console.error(`❌ مش لاقي كود الـ SMS في ${LIB} — شغّلي السكربت جوه حاوية الـ API.`);
  console.error(`   (${e.message})`);
  process.exit(1);
}
const { buildSmsRequest, parseSmsSpec, redactSmsSecrets, smsSucceeded, smsOtpText } = sms;

const to = process.argv[2];
const code = process.argv[3] || String(Math.floor(100000 + Math.random() * 900000));
if (!to) { console.error("❌ الاستخدام: node smssend.mjs <01xxxxxxxxx> [كود]"); process.exit(1); }

let spec;
try {
  spec = parseSmsSpec(process.env.SMS_HTTP);
} catch (e) {
  console.error(`❌ ${e.message}`); process.exit(1);
}
if (!spec) { console.error("❌ مفيش SMS_HTTP"); process.exit(1); }

let url, init;
try {
  ({ url, init } = buildSmsRequest(spec, to, code));
} catch (e) {
  console.error(e.message === "bad_phone" ? `❌ الرقم «${to}» مش رقم مصري سليم (01xxxxxxxxx)` : `❌ ${e.message}`);
  process.exit(1);
}
const u = new URL(url);
console.log(`↪ نداء ${init.method || "POST"} ${u.origin}${u.pathname} (الصيغة: ${spec.format})`);

let r, body = "";
try {
  r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  body = await r.text();
} catch (e) {
  // `fetch failed` لوحدها مابتقولش حاجة — السبب الحقيقي في e.cause
  const why = e.cause?.message || e.cause?.code || e.message;
  console.error(`❌ النداء نفسه فشل: ${why}`);
  console.error("   يعني مفيش رد من المزوّد خالص — راجعي العنوان والشبكة الخارجة من السيرفر.");
  process.exit(1);
}

const safe = redactSmsSecrets(spec, body).replace(/\s+/g, " ").slice(0, 300);
if (!smsSucceeded(spec, r.status, body)) {
  console.error(`❌ المزوّد مارضيش. HTTP ${r.status} · الرد: ${safe}`);
  console.error(`   (كنا بندوّر على «${spec.ok}» في الرد. لو ده رد نجاح عند مزوّدك، صحّحي ok.)`);
  process.exit(1);
}
console.log(`✅ المزوّد قال نجحت. HTTP ${r.status} · الرد: ${safe}`);
console.log(`   الكود المبعوت: ${code}`);
console.log(`   نصّ الرسالة: ${smsOtpText(code)}`);
