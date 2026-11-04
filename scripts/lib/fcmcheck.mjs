// فحص إيجابي لحساب خدمة FCM — بيتشغّل **جوه حاوية الـ api** عشان يستخدم نفس
// كود السيرفر (`dist/lib/fcm.js`) ونفس إعداداته، مش نسخة تانية من المنطق.
//
// كل استيراد لوحده عن قصد: لو واحد فشل، الرسالة تسمّي المودیول اللي فشل فعلًا
// مش أول واحد (درس setbirth.mjs).
let loadConfig, verifyNativePush;
try { ({ loadConfig } = await import("/app/dist/config.js")); }
catch (e) { console.error("❌ مش لاقي dist/config.js:", e.message); process.exit(1); }
try { ({ verifyNativePush } = await import("/app/dist/lib/fcm.js")); }
catch (e) { console.error("❌ مش لاقي dist/lib/fcm.js:", e.message); process.exit(1); }

const c = loadConfig();
if (!c.FCM_SERVICE_ACCOUNT) {
  console.error("❌ FCM_SERVICE_ACCOUNT مش واصل للعملية — راجعي سطره في environment: بتاعة الـ api");
  process.exit(2);
}
try {
  const project = await verifyNativePush(c);
  console.log(`FCM-OK ${project}`);
} catch (e) {
  console.error("❌", e.message);
  process.exit(1);
}
