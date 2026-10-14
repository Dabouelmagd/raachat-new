#!/usr/bin/env node
/**
 * يشغّل `setBirthDateByContact` **جوه حاوية الـ API** — نفس كود السيرفر وقاعدته،
 * مش استعلام SQL مكتوب بإيدينا (اللي ممكن يتخطّى الحوارس في سكوت).
 *
 * التشغيل:  RC_CONTACT=<رقم/إيميل> RC_BIRTH=YYYY-MM-DD RC_BY=<اسم> \
 *             node --input-type=module - < setbirth.mjs
 */
const LIB = process.env.RC_SETBIRTH_LIB || "/app/dist/lib/setBirthDate.js";
const url = (p) => (p.startsWith("/") ? `file://${p}` : p);
const contact = process.env.RC_CONTACT || "";
const iso = process.env.RC_BIRTH || "";
const by = process.env.RC_BY || "المالك";

let setBirthDateByContact, PrismaClient;
try {
  ({ setBirthDateByContact } = await import(url(LIB)));
  ({ PrismaClient } = await import("@prisma/client"));
} catch (e) {
  console.error(`❌ مش لاقي كود السيرفر في ${LIB} — شغّلي ده جوه حاوية الـ API. (${e.message})`);
  process.exit(1);
}

const db = new PrismaClient();
try {
  const r = await setBirthDateByContact({ db }, contact, iso, { id: "owner", name: by, source: "owner-entered" });
  if (!r.ok) { console.error(`❌ ${r.msg} (${r.code})`); process.exit(1); }
  console.log(`✅ اتحدّد تاريخ ميلاد «${r.name}» — واتسجّل في سجل الإجراءات إنه **بإدخال من المالك** مش إقرارًا من المستخدم.`);
} finally {
  await db.$disconnect();
}
