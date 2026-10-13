#!/usr/bin/env node
/**
 * فحص مفاتيح VAPID **فحصًا إيجابيًا**: مش «التحذير اختفى من اللوج» — ده فحص
 * سلبي ممنوع عندنا (قاعدة الفحوص).
 *
 * بيعمل حاجتين على المفاتيح نفسها:
 *   ١) **يشتق المفتاح العام من الخاص** (ECDH على P-256) ويقارنه بايت ببايت
 *      بـ `VAPID_PUBLIC`. الزوج غير المتطابق = كل إشعار بيترفض من خدمة الدفع
 *      (403) **في سكوت** — المستخدم مايوصلوش حاجة ومفيش خطأ عندنا.
 *   ٢) **يوقّع JWT زي اللي web-push بيبعته بالظبط** (ES256) ويتحقق من التوقيع
 *      بالمفتاح العام — يعني المفتاح صالح للتوقيع فعلًا مش بس شكله سليم.
 *
 * التشغيل: VAPID_PUBLIC=… VAPID_PRIVATE=… node vapidcheck.mjs
 * الخروج: 0 = سليم · 1 = مشكلة (والسبب بيتطبع). المفاتيح نفسها مابتتطبعش.
 */
import crypto from "node:crypto";

const PUB = process.env.VAPID_PUBLIC || "";
const PRV = process.env.VAPID_PRIVATE || "";
const SUBJ = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const toB64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };

if (!PUB || !PRV) die("مفيش VAPID_PUBLIC أو VAPID_PRIVATE");

const pub = fromB64url(PUB);
const prv = fromB64url(PRV);
if (pub.length !== 65 || pub[0] !== 0x04) die(`المفتاح العام لازم ٦٥ بايت ويبدأ بـ 0x04 (الموجود ${pub.length} بايت)`);
if (prv.length !== 32) die(`المفتاح الخاص لازم ٣٢ بايت (الموجود ${prv.length} بايت)`);

// ١) الاشتقاق: ECDH.setPrivateKey بيحسب النقطة العامة من السرّ
let derived;
try {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(prv);
  derived = ecdh.getPublicKey();
} catch (e) {
  die(`المفتاح الخاص مش صالح على منحنى P-256: ${e.message}`);
}
if (!derived.equals(pub)) {
  die("المفتاح العام **مش مشتقًّا من الخاص** — الزوج غير متطابق. كل إشعار هيترفض (403) في سكوت. ولّدي زوج جديد بـ FORCE=1 bash scripts/set-vapid.sh");
}

// ٢) توقيع JWT زي web-push والتحقق منه
const x = toB64url(pub.subarray(1, 33));
const y = toB64url(pub.subarray(33, 65));
const jwk = { kty: "EC", crv: "P-256", x, y, d: toB64url(prv) };
let key, pubKey;
try {
  key = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  pubKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x, y }, format: "jwk" });
} catch (e) {
  die(`مش قادر أبني المفتاح للتوقيع: ${e.message}`);
}

const head = toB64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
const body = toB64url(Buffer.from(JSON.stringify({
  aud: "https://fcm.googleapis.com", exp: Math.floor(Date.now() / 1000) + 3600, sub: SUBJ,
})));
const data = Buffer.from(`${head}.${body}`);
const sig = crypto.sign("sha256", data, { key, dsaEncoding: "ieee-p1363" });
if (sig.length !== 64) die(`طول التوقيع غير متوقع (${sig.length})`);
if (!crypto.verify("sha256", data, { key: pubKey, dsaEncoding: "ieee-p1363" }, sig)) {
  die("التوقيع ما اتحققش بالمفتاح العام");
}

console.log(`✅ VAPID سليم: المفتاح العام مشتق من الخاص، والتوقيع (ES256) متحقَّق. الموضوع: ${SUBJ}`);
