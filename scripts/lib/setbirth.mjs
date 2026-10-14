#!/usr/bin/env node
/**
 * يشغّل `setBirthDateByContact` **جوه حاوية الـ API** — نفس كود السيرفر وقاعدته،
 * مش استعلام SQL مكتوب بإيدينا (اللي ممكن يتخطّى الحوارس في سكوت).
 *
 * **الاتصال بالقاعدة من `dist/db.js` نفسه** مش من `@prisma/client` مباشرةً:
 * الـ client مولَّد في مسار مخصّص (`src/generated/prisma` في `schema.prisma`)
 * ومعاه adapter، فـ `import "@prisma/client"` بيفشل بـ
 * `Cannot find module '.prisma/client/default'`. ده حصل فعلًا في أول تشغيل.
 *
 * التشغيل:  RC_CONTACT=<رقم/إيميل> RC_BIRTH=YYYY-MM-DD RC_BY=<اسم> \
 *             node --input-type=module - < setbirth.mjs
 */
const LIB = process.env.RC_SETBIRTH_LIB || "/app/dist/lib/setBirthDate.js";
const DB_LIB = process.env.RC_DB_LIB || "/app/dist/db.js";
const CFG = process.env.RC_CONFIG_LIB || "/app/dist/config.js";
const url = (p) => (p.startsWith("/") ? `file://${p}` : p);
const contact = process.env.RC_CONTACT || "";
const iso = process.env.RC_BIRTH || "";
const by = process.env.RC_BY || "المالك";

/** كل استيراد لوحده عشان الرسالة تقول **المودیول اللي فشل فعلًا** مش أول واحد */
async function need(path, what) {
  try { return await import(url(path)); }
  catch (e) { console.error(`❌ مش قادر أحمّل ${what} من ${path} — شغّلي ده جوه حاوية الـ API. (${e.message})`); process.exit(1); }
}
const { setBirthDateByContact } = await need(LIB, "كود تحديد التاريخ");
const { createDb } = await need(DB_LIB, "اتصال القاعدة");
const { loadConfig } = await need(CFG, "إعدادات السيرفر");

const db = createDb(loadConfig().DATABASE_URL);
try {
  const r = await setBirthDateByContact({ db }, contact, iso, { id: "owner", name: by, source: "owner-entered" });
  if (!r.ok) { console.error(`❌ ${r.msg} (${r.code})`); process.exit(1); }
  console.log(`✅ اتحدّد تاريخ ميلاد «${r.name}» — واتسجّل في سجل الإجراءات إنه **بإدخال من المالك** مش إقرارًا من المستخدم.`);
} finally {
  await db.$disconnect();
}
