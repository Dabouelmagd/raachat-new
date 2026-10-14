#!/usr/bin/env node
/**
 * فحص إيجابي **جوه الكونتينر الشغّال** على المفتاح اللي بيوصل للمتصفح:
 * بينادي `createWebPush` بتاعة السيرفر نفسها بإعداداته (`dist/config.js`)
 * ويتأكد إنها رجّعت مُرسِلًا، وإن `publicKey` **مش null** و**نفس**
 * `VAPID_PUBLIC` — ودي بالظبط القيمة اللي `GET /push/key` بيرجّعها للواجهة.
 *
 * ليه مش `curl /push/key`: المسار ده **ورا التوكن** (بيرجّع 401 بلا تسجيل دخول،
 * وفي `push.test.ts` اختبار بيثبّت ده) — فنداء من سكربت مابيقدرش يوصله، والفحص
 * بالـ curl كان بيطلّع 401 ويبان كأنه عطل.
 *
 * وليه الفحص ده لازم **بالإضافة** لـ vapidcheck: الأخير بيتأكد إن الزوج متطابق
 * في البيئة، إنما `createWebPush` بترجّع `undefined` لو **مفتاح واحد ناقص** —
 * ساعتها `/push/key` بيرجّع `null` والواجهة تقول «غير متاح»، **مفيش ولا إشعار
 * ومفيش ولا خطأ**. والحارس `^VAPID_PRIVATE=.+` في السكربت مابيشوفش الحالة دي.
 *
 * التشغيل جوه الحاوية:  node --input-type=module - < pushprobe.mjs
 */
const LIB = process.env.RC_PUSH_LIB || "/app/dist/lib/push.js";
const CFG = process.env.RC_CONFIG_LIB || "/app/dist/config.js";
const url = (p) => (p.startsWith("/") ? `file://${p}` : p);

const pub = process.env.VAPID_PUBLIC;
if (pub === undefined) {
  console.error("❌ VAPID_PUBLIC **مش واصل للعملية** — السطر ناقص من environment: بتاعة الـ api في docker-compose.prod.yml (درس RETENTION).");
  process.exit(1);
}

let createWebPush, loadConfig, config;
try {
  ({ createWebPush } = await import(url(LIB)));
  ({ loadConfig } = await import(url(CFG)));
} catch (e) {
  console.error(`❌ مش لاقي كود السيرفر (${LIB} / ${CFG}) — شغّلي الفحص جوه حاوية الـ API. (${e.message})`);
  process.exit(1);
}
// نفس اللي `index.ts` بيعمله بالظبط: الإعدادات من بيئة العملية الشغّالة
try { config = loadConfig(); } catch (e) { console.error(`❌ إعدادات السيرفر مش صالحة: ${e.message}`); process.exit(1); }

let sender;
try {
  sender = createWebPush(config);
} catch (e) {
  // `setVapidDetails` بترمي على موضوع مش URI صالح — والـ API نفسه بيقع على ده وقت القيام
  console.error(`❌ createWebPush رمت: ${e.message}`);
  process.exit(1);
}

if (!sender) {
  console.error("❌ /push/key هيرجّع null — `createWebPush` رجّعت undefined (مفتاح من الزوج ناقص في الإعدادات). الواجهة هتقول «الإشعارات غير متاحة»، ومفيش ولا إشعار ومفيش ولا خطأ.");
  process.exit(1);
}
if (sender.publicKey !== config.VAPID_PUBLIC || !sender.publicKey) {
  console.error("❌ المفتاح اللي بيتوزّع للمتصفح مش هو المضبوط — كل اشتراك جديد هيترفض.");
  process.exit(1);
}
console.log(`✅ /push/key بيوزّع المفتاح العام المضبوط (${sender.publicKey.length} حرف) — الواجهة تقدر تشترك.`);
