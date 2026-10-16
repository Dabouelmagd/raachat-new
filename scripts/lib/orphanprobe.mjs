#!/usr/bin/env node
/**
 * يشغّل `findOrphans` **جوه حاوية الـ API** — نفس كود السيرفر وقاعدته ونفس
 * مجلد الرفع، مش استعلام SQL بإيدينا ولا `find` على القرص.
 *
 * **الاتصال من `dist/db.js`** مش من `@prisma/client` مباشرةً (الـ client مولَّد
 * في مسار مخصّص ومعاه adapter — درس `setbirth.mjs`).
 *
 * التشغيل:  RC_DELETE=1 node --input-type=module - < orphanprobe.mjs
 *   بدون `RC_DELETE` = تقرير بس، مفيش مسح.
 */
const LIB = process.env.RC_ORPHAN_LIB || "/app/dist/lib/orphanFiles.js";
const DB_LIB = process.env.RC_DB_LIB || "/app/dist/db.js";
const CFG = process.env.RC_CONFIG_LIB || "/app/dist/config.js";
const url = (p) => (p.startsWith("/") ? `file://${p}` : p);
const doDelete = process.env.RC_DELETE === "1";

/** كل استيراد لوحده عشان الرسالة تسمّي المودیول اللي فشل فعلًا */
async function need(path, what) {
  try { return await import(url(path)); }
  catch (e) { console.error(`❌ مش قادر أحمّل ${what} من ${path} — شغّلي ده جوه حاوية الـ API. (${e.message})`); process.exit(1); }
}
const { findOrphans, MIN_AGE_MS } = await need(LIB, "كود الملفات اليتيمة");
const { createDb } = await need(DB_LIB, "اتصال القاعدة");
const { loadConfig } = await need(CFG, "إعدادات السيرفر");
const fs = await import("node:fs/promises");
const path = await import("node:path");

const cfg = loadConfig();
const db = createDb(cfg.DATABASE_URL);
const dir = path.resolve(cfg.UPLOAD_DIR);
const mb = (b) => (b / 1048576).toFixed(1);

try {
  const r = await findOrphans({ db, fs, path }, dir);
  console.log(`المجلد: ${dir}`);
  console.log(`ملفات على القرص: ${r.total} · مراجع في القاعدة: ${r.referenced}`);
  console.log(`يتيم وعدّى ${MIN_AGE_MS / 3600000} ساعة: ${r.orphans.length} (${mb(r.bytes)} ميجا) · يتيم لسه جديد (متروك): ${r.tooNew}`);

  if (r.abort) {
    console.error(`\n❌ ${r.abort}`);
    process.exit(2);
  }
  if (!r.orphans.length) {
    console.log("\n✅ مفيش ملفات يتيمة — كل ملف على القرص له صفّ في القاعدة.");
    process.exit(0);
  }

  // أقدم ١٥ عشان الناتج مايغرقش الشاشة
  console.log("\nأقدم اللي لقيته:");
  for (const o of r.orphans.slice(0, 15).sort((a, b) => a.mtime - b.mtime)) {
    console.log(`  ${o.mtime.toISOString().slice(0, 10)}  ${mb(o.size).padStart(7)}م  ${o.name}`);
  }
  if (r.orphans.length > 15) console.log(`  … و${r.orphans.length - 15} غيرهم`);

  if (!doDelete) {
    console.log("\n⚠️ تقرير بس — مفيش حاجة اتمسحت.");
    process.exit(0);
  }

  let gone = 0;
  let freed = 0;
  for (const o of r.orphans) {
    try {
      await fs.unlink(path.join(dir, o.name));
      gone++;
      freed += o.size;
    } catch (e) {
      console.error(`  ⚠️ ما اتمسحش ${o.name}: ${e.message}`);
    }
  }
  // فحص إيجابي بعد المسح: الملفات **فعلًا** مش موجودة
  let left = 0;
  for (const o of r.orphans) {
    try { await fs.stat(path.join(dir, o.name)); left++; } catch { /* المفروض */ }
  }
  console.log(`\n🧹 اتمسح ${gone} ملف (${mb(freed)} ميجا).`);
  if (left) {
    console.error(`❌ لسه فاضل ${left} ملف موجود بعد المسح.`);
    process.exit(1);
  }
  console.log("✅ متحقَّق: مفيش ولا ملف من اللي اتمسحوا لسه موجود.");
} finally {
  await db.$disconnect();
}
