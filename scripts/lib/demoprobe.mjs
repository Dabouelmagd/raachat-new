#!/usr/bin/env node
/**
 * يشغّل `demoScope` **جوه حاوية الـ API** — نفس كود السيرفر ونفس قاعدته، مش
 * استعلام SQL بإيدينا يتخطّى أي حارس.
 *
 * **الاتصال من `dist/db.js`** مش من `@prisma/client` مباشرةً (الـ client مولَّد
 * في مسار مخصّص ومعاه adapter — درس `setbirth.mjs`).
 *
 * **قراءة بحتة: مابيمسحش ولا بيكتب حاجة.** المسح في `unseedDemo` لوحده.
 *
 * الخروج: 0 = مفيش حساب حقيقي متأثر · 3 = فيه حسابات حقيقية جوه محادثات هتتمسح
 * (مش خطأ — تنبيه بيستدعي قرارك) · 1 = فشل حقيقي.
 */
const LIB = process.env.RC_DEMO_LIB || "/app/dist/lib/demoScope.js";
const DB_LIB = process.env.RC_DB_LIB || "/app/dist/db.js";
const CFG = process.env.RC_CONFIG_LIB || "/app/dist/config.js";
const url = (p) => (p.startsWith("/") ? `file://${p}` : p);

/** كل استيراد لوحده عشان الرسالة تسمّي المودیول اللي فشل فعلًا */
async function need(path, what) {
  try { return await import(url(path)); }
  catch (e) { console.error(`❌ مش قادر أحمّل ${what} من ${path} — شغّلي ده جوه حاوية الـ API. (${e.message})`); process.exit(1); }
}
const { demoScope } = await need(LIB, "كود نطاق الديمو");
const { createDb } = await need(DB_LIB, "اتصال القاعدة");
const { loadConfig } = await need(CFG, "إعدادات السيرفر");

const cfg = loadConfig();
const db = createDb(cfg.DATABASE_URL);

try {
  const s = await demoScope(db);

  if (!s.demoUsers.length) {
    console.log("✅ مفيش ولا حساب تجريبي في القاعدة — مفيش حاجة تتمسح.");
    process.exit(0);
  }

  console.log(`الحسابات التجريبية الموجودة: ${s.demoUsers.length}`);
  for (const u of s.demoUsers) console.log(`  · ${u.phone}  ${u.name}`);
  console.log(`المحادثات اللي هتتمسح: ${s.threads.length}  ·  الرسايل جوّاها: ${s.messages}`);

  const shared = s.threads.filter((t) => t.realMembers > 0);
  for (const t of s.threads) {
    const kind = t.type === "group" ? (t.isPublic ? "جروب عام" : "جروب") : t.type === "dm" ? "فردية" : t.type;
    const mark = t.realMembers > 0 ? ` ⚠️ فيها ${t.realMembers} حساب حقيقي` : "";
    console.log(`  · ${kind}: ${t.name ?? "(بلا اسم)"} — ${t.messages} رسالة، ${t.members} عضو${mark}`);
  }

  if (!shared.length) {
    console.log("\n✅ مفيش ولا حساب حقيقي في أي محادثة من دول — المسح بيلمس البيانات التجريبية بس.");
    process.exit(0);
  }

  console.log(`\n⚠️ ${s.realMemberIds.length} حساب حقيقي عضو في ${shared.length} محادثة من اللي هتتمسح.`);
  console.log("   المحادثات دي **ورسايلها كلها** هتتمسح، ومعاها رسايل الحسابات الحقيقية اللي فيها.");
  console.log("   ده مش خطأ — ده القرار اللي محتاج نظرتك قبل المسح.");
  process.exit(3);
} catch (e) {
  console.error(`❌ فشل قراءة نطاق الديمو: ${e?.message ?? e}`);
  process.exit(1);
} finally {
  await db.$disconnect().catch(() => {});
}
