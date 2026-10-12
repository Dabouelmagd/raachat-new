#!/usr/bin/env node
/**
 * يملأ بيانات الشركة في الصفحات القانونية (public/legal/*.html و public/delete-account.html و مجلدات dist).
 * الاستخدام:  node scripts/fill-legal.mjs legal.config.json
 * شكل الملف:  { "company": "...", "address": "...", "supportEmail": "...", "privacyEmail": "...", "dpo": "...",
 *               "messagingProvider": "...", "hostingProvider": "...", "hostingRegion": "...", "paymentProvider": "..." }
 * الصفحات ثنائية اللغة: أي مفتاح ليه نسخة إنجليزية بإضافة En (companyEn / addressEn / dpoEn / hostingRegionEn /
 * paymentProviderEn / messagingProviderEn / hostingProviderEn). لو مش موجودة بتستخدم العربية.
 * ملحوظة: القالب نفسه بيضيف اسم الدولة بعد العنوان، فالعنوان من غير "مصر".
 * (كل مفتاح اختياري؛ اللي ما تحدّديهوش يفضل بين أقواس والتنبيه يفضل ظاهر.)
 */
import fs from "node:fs";
import path from "node:path";
const cfgPath = process.argv[2];
if (!cfgPath) { console.error("usage: node scripts/fill-legal.mjs legal.config.json"); process.exit(1); }
const c = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const en = (k) => c[k + "En"] ?? c[k]; // النسخة الإنجليزية لو متحددة، وإلا العربية
const map = [
  ["[اسم الشركة]", c.company], ["[Company name]", en("company")],
  ["[العنوان]", c.address], ["[Address]", en("address")],
  ["support@YOUR-DOMAIN", c.supportEmail], ["privacy@YOUR-DOMAIN", c.privacyEmail ?? c.supportEmail],
  ["[اسم مسؤول حماية البيانات]", c.dpo], ["[DPO name]", en("dpo")],
  ["[مزوّد الرسائل]", c.messagingProvider], ["[messaging provider]", en("messagingProvider")],
  ["[مزوّد الاستضافة]", c.hostingProvider], ["[hosting provider]", en("hostingProvider")],
  ["[مكان الاستضافة]", c.hostingRegion], ["[hosting region]", en("hostingRegion")],
  ["[مزوّد الدفع]", c.paymentProvider], ["[payment provider]", en("paymentProvider")],
];
const files = [];
for (const d of ["public", "dist", "dist-single"]) {
  for (const f of ["delete-account.html", "legal/privacy.html", "legal/terms.html", "legal/community.html", "legal/data-requests.html"]) {
    const p = path.join(d, f); if (fs.existsSync(p)) files.push(p);
  }
}
// ملف واحد مالقيناهوش = الأغلب إننا بنتشغّل من مكان غلط أو قبل البناء، والسكربت
// كان بيخرج بنجاح وساكت تمامًا. ومكان خروجه بنجاح = الصفحات بتتنشر بـ [ ] جواها.
if (!files.length) {
  console.error("❌ مفيش ولا صفحة قانونية اتلقت (public/ ولا dist/ ولا dist-single/).");
  console.error("   شغّليه من جذر المشروع، وبعد البناء لو عايزة dist-single كمان.");
  process.exit(1);
}
const missing = [...map].filter(([k, v]) => !v).map(([k]) => k);
if (missing.length) console.warn("⚠️ مفاتيح ناقصة في legal.config.json (هتفضل زي ما هي في الصفحات): " + missing.join(" · "));
let changedAny = false, leftovers = new Set();
for (const p of files) {
  let s = fs.readFileSync(p, "utf8");
  const before = s;
  for (const [k, v] of map) if (v) s = s.split(k).join(v);
  if (s !== before) changedAny = true;
  if (!/\[[^\]\n]{2,40}\]|YOUR-DOMAIN/.test(s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, ""))) s = s.replace(/<div class="note" id="draft">[\s\S]*?<\/div>\n?/, "");
  fs.writeFileSync(p, s);
  const body = s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  for (const m of body.match(/\[[^\]\n]{2,80}\]|YOUR-DOMAIN/g) ?? []) leftovers.add(m);
  console.log(s !== before ? "filled " + p : "لا جديد في " + p);
}
// مابنفشلش لو مفيش تغيير: ده الوضع الطبيعي لو الصفحات متملية خلاص (تشغيل تاني).
// المهم إننا بنقول الحقيقة بدل "filled" على ملف ما اتغيّرش.
if (!changedAny) console.log("ℹ️ مفيش تغيير — الصفحات متملية خلاص، أو مفاتيح الملف مش مطابقة.");
// تنبيه المسودة بيتشال بشرط «مفيش placeholders»، والشرط ده regex ممكن يفوته —
// فبنقول بصراحة إيه اللي فاضل جوه الصفحات بعد التعويض.
if (leftovers.size) console.warn("⚠️ لسه فيه خانات فاضية في الصفحات: " + [...leftovers].join(" · "));
else console.log("✅ مفيش خانات فاضية — تنبيه المسودة اتشال.");
