#!/usr/bin/env node
/**
 * فحص قاموس الترجمة (`src/translate/phrases.ts`).
 * التشغيل:  node scripts/check-phrases.mjs
 *
 * ليه موجود: الفهرس في `engine.ts` بيتبني في `Map` بمفتاح النص **المطبّع** (بدون
 * تشكيل ولا همزات ولا علامات). فعبارة مكرّرة **بتشيل اللي قبلها في سكوت** — القاموس
 * يكبر والترجمة تطلع غلط ومحدش ياخد باله. ودي نفس عائلة الأعطال الصامتة اللي
 * بنطاردها: مفيش رسالة خطأ، بس النتيجة غلط.
 *
 * بيفحص: كل عبارة فيها اللغات الأربع · مفيش مفتاح مطبّع مكرّر · مفيش نص فاضي ·
 * `ar` فيها صياغة واحدة على الأقل.
 */
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/translate/phrases.ts");
if (!fs.existsSync(file)) { console.error("❌ مفيش " + file); process.exit(1); }
const src = fs.readFileSync(file, "utf8");

// نفس التطبيع اللي في engine.ts بالظبط — لو اتغيّر هناك لازم يتغيّر هنا
const norm = (s) =>
  s.toLowerCase().normalize("NFD")
    .replace(/[ً-ٰٟ̀-ͯ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[\p{P}\p{S}\p{Emoji_Presentation}\s]+/gu, "");

// بنقرا العبارات من **جسم مصفوفة PHRASES بالظبط** — مش من باقي الملف.
// (أول نسخة كانت بتقرا من PHRASES لآخر الملف، فعبارات اتحقنت بالغلط في مصفوفة
//  تانية عدّت الفحص وهي في المكان الغلط. tsc هو اللي كشفها.)
const open_ = src.indexOf("PHRASES: Phrase[] = [");
if (open_ < 0) { console.error("❌ مالقيتش تعريف PHRASES"); process.exit(1); }
const close_ = src.indexOf("\n];", open_);
if (close_ < 0) { console.error("❌ مالقيتش نهاية مصفوفة PHRASES"); process.exit(1); }
const body = src.slice(open_, close_);
const rows = [...body.matchAll(/\{\s*ar:\s*\[([^\]]*)\]\s*,\s*en:\s*"((?:[^"\\]|\\.)*)"\s*,\s*zh:\s*"((?:[^"\\]|\\.)*)"\s*,\s*fr:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)];
if (!rows.length) { console.error("❌ ما قدرتش أقرا ولا عبارة — شكل الملف اتغيّر؟"); process.exit(1); }

const seen = new Map();
const problems = [];
let variants = 0;
rows.forEach((m, i) => {
  const ar = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  const [, , en, zh, fr] = m;
  const label = ar[0] ?? `#${i + 1}`;
  if (!ar.length) problems.push(`عبارة #${i + 1}: مفيش صياغة عربية`);
  for (const [name, v] of [["en", en], ["zh", zh], ["fr", fr]]) {
    if (!v.trim()) problems.push(`«${label}»: ${name} فاضية`);
  }
  for (const v of [...ar, en, zh, fr]) {
    variants++;
    const k = norm(v);
    if (!k) { problems.push(`«${label}»: صياغة بتتطبّع لنص فاضي: ${JSON.stringify(v)}`); continue; }
    const prev = seen.get(k);
    if (prev !== undefined && prev !== i) problems.push(`تكرار: ${JSON.stringify(v)} موجودة في «${rows[prev][1].match(/"((?:[^"\\]|\\.)*)"/)?.[1]}» وفي «${label}» — التانية بتشيل الأولى في سكوت`);
    else seen.set(k, i);
  }
});

if (problems.length) {
  console.error(`❌ قاموس الترجمة فيه ${problems.length} مشكلة:`);
  for (const p of problems) console.error("   · " + p);
  process.exit(1);
}
console.log(`✅ قاموس الترجمة سليم — ${rows.length} عبارة، ${variants} صياغة، مفيش تكرار.`);
