#!/usr/bin/env node
/**
 * فحص إيجابي **جوه الكونتينر الشغّال** لمفتاح سجل الأدلة.
 *
 * بيستورد **نفس كود السيرفر** (`dist/lib/evidence.js`) ويعمل دورة كاملة:
 * تشفير ← فتح ← مقارنة بايت ببايت، وبعدها يتأكد إن **المفتاح الغلط بيفشل**
 * فعلًا (GCM بيتحقق من السلامة). الفحص التاني ده هو اللي بيفرّق بين «تشفير
 * شغّال» و«دالة بترجّع النصّ زي ما هو».
 *
 * ليه مش «السطر موجود في `.env.production`»: من غير السطر في `environment:`
 * بتاعة الـ api المفتاح **مابيوصلش للعملية خالص** (درس RETENTION)، والسجل
 * ساعتها بيتسجّل بـ `problem=no_key` و**الملف المبلَّغ عنه مابيتحفظش** —
 * في سكوت تمامًا من ناحية المستخدم.
 *
 * التشغيل:  $DC exec -T api node --input-type=module - < evidenceprobe.mjs
 */
const LIB = process.env.RC_EVIDENCE_LIB || "/app/dist/lib/evidence.js";
const key = process.env.EVIDENCE_KEY;

// «مش واصل» و«واصل وفاضي» حالتان مختلفتان — نفس درس bannedprobe.
if (key === undefined) {
  console.log("❌ EVIDENCE_KEY مش واصل للعملية خالص — ناقص سطر في environment: بتاعة الـ api في docker-compose.prod.yml");
  process.exit(1);
}
if (key === "") {
  console.log("⚠️ EVIDENCE_KEY واصل بس فاضي — الملف المبلَّغ عنه مش هيتحفظ (problem=no_key)");
  process.exit(2);
}

let mod;
try {
  mod = await import(LIB);
} catch (e) {
  console.log(`❌ تعذّر تحميل ${LIB}: ${e?.message ?? e}`);
  process.exit(1);
}

const { sealEvidence, openEvidence } = mod;
if (typeof sealEvidence !== "function" || typeof openEvidence !== "function") {
  console.log("❌ الدوال مش موجودة في " + LIB);
  process.exit(1);
}

// بيانات فيها بايتات غير نصّية عن قصد — ملفات الأدلة صور وفيديو مش نصّ.
const plain = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x1a, 0x0a, 0x7e, 0x01]);

try {
  const { blob, iv, tag } = sealEvidence(key, plain);
  if (blob.equals(plain)) {
    console.log("❌ الناتج زي المدخل بالظبط — ده مش تشفير");
    process.exit(1);
  }
  const back = openEvidence(key, blob, iv, tag);
  if (!back.equals(plain)) {
    console.log("❌ الفتح رجّع بيانات مختلفة عن الأصل");
    process.exit(1);
  }
  // الحارس الحاسم: مفتاح تاني **لازم** يفشل، وإلا التشفير بلا معنى.
  let rejected = false;
  try { openEvidence(key + "x", blob, iv, tag); } catch { rejected = true; }
  if (!rejected) {
    console.log("❌ مفتاح غلط فتح الدليل — التشفير مش بيحمي حاجة");
    process.exit(1);
  }
  console.log("✅ سجل الأدلة: التشفير والفتح شغّالين جوه الحاوية، والمفتاح الغلط بيترفض");
} catch (e) {
  console.log(`❌ فشل فحص التشفير: ${e?.message ?? e}`);
  process.exit(1);
}
