#!/usr/bin/env node
/**
 * هل دومين المرسِل `verified` عند Resend؟ — الفحص اللي **لازم** يسبق أي تبديل
 * لـ`EMAIL_FROM`.
 *
 * 🔴 ليه ده أهم سطر في عملية التبديل: Resend بترفض أي إيميل من دومين غير
 * متحقَّق بـ**٤٠٣**. فتبديل `EMAIL_FROM` لدومين لسه `pending` معناه إن **كل
 * أكواد التحقق بالإيميل تقف لكل المستخدمين** (والتسجيل الجديد معاها، لأن SMS
 * موقوف أصلًا) **وتنبيهات `monitor.sh` كمان** — هي بتستخدم نفس `EMAIL_FROM`.
 * والمستخدم بيشوف «تعذّر إرسال الكود الآن» بلا أي سبب.
 *
 * **فشل مقفول:** أي حاجة غير «متحقَّق بوضوح» = رفض. مفتاح ناقص · رد مش ٢٠٠ ·
 * رد مش JSON · الدومين مش في القايمة — كلها خروج غير صفر، لأن من «مش عارفين»
 * مفيش طريق نفرّق بين دومين سليم ودومين هيوقّف التسجيل.
 *
 * ⚠️ **ومفتاح «الإرسال فقط» مش بيقدر يقرا الدومينات** — Resend بتسمح بمفتاح
 * مقيّد (Sending access) وبترفض عليه `/domains` بـ٤٠١. وده **الوضع الأأمن**
 * ومش عطل، فالرفض ده بياخد كود خروج **خاص** (٣) عشان السكربت يفرّق بين «مفتاح
 * مالوش صلاحية الفحص» و«الدومين مش متحقَّق» — الأولى بتتحوّل لإقرار بشري من
 * اللوحة، والتانية رفض قاطع. (وخلط الاتنين كان بيمنع التبديل للأبد.)
 *
 * الخروج: 0 متحقَّق · 2 موجود ومش متحقَّق (أو مش مضاف) · 3 المفتاح مقيّد · 1 مش عارفين
 * التشغيل: $DC exec -T -e RC_DOMAIN=example.com api node --input-type=module - < resendomain.mjs
 */
const key = process.env.RESEND_KEY;
const want = (process.env.RC_DOMAIN || "").trim().toLowerCase();
const api = process.env.RC_RESEND_API || "https://api.resend.com/domains";

if (!want) {
  console.log("❌ RC_DOMAIN مش متمرّر");
  process.exit(1);
}
// «مش واصل» و«واصل وفاضي» حالتان مختلفتان — نفس درس bannedprobe/evidenceprobe.
if (key === undefined) {
  console.log("❌ RESEND_KEY مش واصل للعملية خالص — ناقص سطر في environment: بتاعة الـ api في docker-compose.prod.yml");
  process.exit(1);
}
if (!key) {
  console.log("❌ RESEND_KEY واصل بس فاضي — مفيش إرسال إيميل خالص");
  process.exit(1);
}

let r, body;
try {
  r = await fetch(api, { headers: { Authorization: `Bearer ${key}` } });
  body = await r.text();
} catch (e) {
  console.log(`❌ تعذّر الوصول لـ Resend: ${e?.message ?? e} — وقوف بلا تبديل`);
  process.exit(1);
}
if (r.status === 401 || r.status === 403) {
  // 🔴 مفتاح «الإرسال فقط» بيترفض هنا وهو **سليم تمامًا للإرسال** — فالحكم
  // «الدومين مش متحقَّق» هنا غلط، والحكم «تمام كمّلي» أغلط. كود ٣ = مش عارفين
  // بسبب الصلاحية، والسكربت بيحوّلها لإقرار بشري من اللوحة.
  console.log(`⚠️ المفتاح مالوش صلاحية قراءة الدومينات (${r.status}) — غالبًا مفتاح «إرسال فقط»`);
  console.log("   فحالة الدومين تتشاف بعينك في https://resend.com/domains");
  process.exit(3);
}
if (!r.ok) {
  console.log(`❌ Resend ردّت ${r.status} على قايمة الدومينات — وقوف بلا تبديل`);
  process.exit(1);
}

let list;
try {
  const j = JSON.parse(body);
  list = Array.isArray(j) ? j : j?.data;
} catch {
  console.log("❌ رد Resend مش JSON — وقوف بلا تبديل");
  process.exit(1);
}
if (!Array.isArray(list)) {
  console.log("❌ شكل رد Resend اتغيّر (مفيش مصفوفة data) — وقوف بلا تبديل");
  process.exit(1);
}

for (const d of list) {
  const name = String(d?.name ?? "").toLowerCase();
  if (name) console.log(`   ${name} => ${d?.status ?? "?"}`);
}

const hit = list.find((d) => String(d?.name ?? "").toLowerCase() === want);
if (!hit) {
  console.log(`❌ ${want} مش مضاف في Resend خالص — ضيفيه وحقّقيه الأول`);
  process.exit(2);
}
if (String(hit.status).toLowerCase() !== "verified") {
  console.log(`❌ ${want} حالته «${hit.status}» مش verified — التبديل دلوقتي بيوقّف كل أكواد التحقق`);
  process.exit(2);
}
console.log(`✅ ${want} متحقَّق عند Resend`);
