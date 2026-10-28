import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "../context.js";
import { ADULT_AGE } from "./age.js";

/**
 * **تنفيذ وعود الحذف المنشورة في سياسة الخصوصية.**
 *
 * الخلفية: الصفحات القانونية بتوعد بمدد حذف محددة، والكود مكان **مفيهوش ولا وظيفة
 * حذف مجدولة** — الستوري بتتخبّى بعد ٢٤ ساعة والصفوف باقية للأبد، وأكواد التحقق
 * (وفيها رقم التليفون/الإيميل صريح) بتتجاهل بس مابتتمسحش، وأحداث إعلانات الأقل من
 * ١٨ بتتمسح بس لما طفل تاني يضغط إعلان. وعد مكتوب بدون كود = مخالفة صامتة لقانون
 * حماية البيانات ١٥١/٢٠٢٠، ومحدش بيلاحظ إن مفيش حاجة بتتمسح.
 *
 * **الأمان:** الوضع الافتراضي `dry` — بيعدّ ويقول هيمسح إيه **بدون أي حذف**. الحذف
 * الحقيقي لازم `RETENTION=on` في `.env.production`، عشان الأرقام تتراجع قبل أول
 * عملية حذف مابترجعش. و`RETENTION=off` بيوقفه خالص.
 *
 * المدد هنا **لازم تطابق الجدول في `public/legal/privacy.html`**. أي تعديل في واحد
 * منهم يتعدّل في التاني — وده اللي اختبار `retention.test.ts` بيحميه.
 */
export type RetentionMode = "on" | "dry" | "off";

const HOUR = 3600_000;
const DAY = 86_400_000;

/** مهلة بعد انتهاء صلاحية الكود قبل مسحه: محتاجين ساعة للحد الأقصى لطلبات الكود/ساعة */
const OTP_KEEP_HOURS = 1;
/** مهلة بعد تسجيل الخروج/انتهاء الجلسة قبل مسح صف الجلسة */
const SESSION_GRACE_DAYS = 1;
/** سجل إعلانات الأقل من ١٨ (نفس الرقم في routes/ads.ts) */
const MINOR_AD_DAYS = 2;
/** البلاغات: سنتان من إغلاقها (منشور في سياسة الخصوصية) */
const REPORT_YEARS = 2;
/**
 * بلاغات إيذاء الأطفال وأدلتها: **٣ سنوات كحد أقصى** (مذكرة المحامي ٢٨ أكتوبر ٢٠٢٦،
 * ردًّا على سؤالنا عن المدة — أوصى بـ«سنة إلى ٣ سنوات كحد أقصى أو لحين انتهاء
 * التحقيقات»). قبلها كانت مستثناة من الكنس **بلا أي سقف**، يعني محفوظة للأبد —
 * وده نفسه مخالفة: الاحتفاظ بلا مدة محددة ممنوع في ١٥١/٢٠٢٠، والجدول المنشور كان
 * ساكتًا عن الاستثناء من أصله.
 */
const EVIDENCE_YEARS = 3;

/** الأعمدة اللي ممكن تشاور على ملف مرفوع — أي ملف بينها مابيتمسحش */
type FileRef = { table: string; count: (name: string) => Promise<number> };

export async function retentionSweep(ctx: Ctx, mode: RetentionMode = "dry"): Promise<Record<string, number>> {
  const { db } = ctx;
  const now = Date.now();
  const out: Record<string, number> = {};
  const wet = mode === "on";

  // ١) أكواد التحقق: فيها التارجت صريح (رقم تليفون أو إيميل). صلاحيتها ٥ دقايق،
  //    وبنسيب ساعة عشان حدّ الطلبات، وأي أقدم من كده مالوش أي لازمة.
  const otpBefore = new Date(now - OTP_KEEP_HOURS * HOUR);
  out.otp = wet
    ? (await db.otpCode.deleteMany({ where: { createdAt: { lt: otpBefore } } })).count
    : await db.otpCode.count({ where: { createdAt: { lt: otpBefore } } });

  // ٢) الستوري بعد ٢٤ ساعة: الصف + StorySeen (بالـ cascade) + الصورة من القرص.
  //    الصورة بتتمسح **بس** لو مفيش أي صف تاني بيشاور على نفس الملف — المستخدم
  //    بيبعت imageUrl من عنده، فنظريًا ممكن يبعت رابط مرفق حد تاني.
  const expired = await db.story.findMany({ where: { expiresAt: { lt: new Date(now) } }, select: { id: true, imageUrl: true } });
  out.stories = expired.length;
  const ids = expired.map((s) => s.id);
  if (wet && ids.length) await db.story.deleteMany({ where: { id: { in: ids } } });
  out.storyFiles = await sweepFiles(ctx, expired.map((s) => s.imageUrl), wet);

  // ٣) الجلسات: الملغاة (تسجيل خروج/حذف جهاز) والمنتهية. الوعد: الاحتفاظ بينتهي
  //    عند تسجيل الخروج أو بعد ٣٠ يوم من آخر استخدام — وده بيعمله refreshExpiresAt.
  const sGrace = new Date(now - SESSION_GRACE_DAYS * DAY);
  const sWhere = { OR: [{ revokedAt: { lt: sGrace } }, { refreshExpiresAt: { lt: sGrace } }] };
  out.sessions = wet ? (await db.session.deleteMany({ where: sWhere })).count : await db.session.count({ where: sWhere });

  // ٤) سجل إعلانات الأقل من ١٨ بعد يومين — **مش** مربوط بإن طفل تاني يضغط إعلان.
  //    (مين «أقل من ١٨»: نفس قاعدة routes/ads.ts — ومن غير تاريخ ميلاد يتعامل
  //    كأقل من ١٨ لأنه الأحوط.)
  const adCut = new Date(now - MINOR_AD_DAYS * DAY);
  const bornAfter = new Date(now - ADULT_AGE * 365.25 * DAY);
  const minors = await db.user.findMany({ where: { OR: [{ birthDate: null }, { birthDate: { gt: bornAfter } }] }, select: { id: true } });
  const adWhere = {
    createdAt: { lt: adCut },
    OR: [{ userId: { startsWith: "anon:" } }, { userId: { in: minors.map((m) => m.id) } }],
  };
  out.minorAdEvents = wet ? (await db.adEvent.deleteMany({ where: adWhere })).count : await db.adEvent.count({ where: adWhere });

  // ٥) البلاغات: سنتان من إغلاقها. فيها `snippet` = نسخة من نص الرسالة المبلَّغ عنها.
  //
  // وبلاغات `child_safety` ليها مدة أطول (البند ٦ تحت) مش استثناء بلا سقف.
  const rCut = new Date(now - REPORT_YEARS * 365.25 * DAY);
  const rWhere = { status: "resolved", resolvedAt: { lt: rCut }, reason: { not: "child_safety" } };
  out.reports = wet ? (await db.report.deleteMany({ where: rWhere })).count : await db.report.count({ where: rWhere });

  // ٦) بلاغات إيذاء الأطفال وأدلتها: ٣ سنوات كحد أقصى.
  //
  // السبب الأصلي للاستثناء لسه قائمًا — حذف أدلة رقمية لوقائع إيذاء أطفال ممكن
  // يعرّض الإدارة للمساءلة، والجهات القضائية ممكن تطلب السجلات بعد السنتين —
  // ولذلك المدة أطول من الباقي. إنما «للأبد» مش مدة، والمحامي حدّد السقف.
  //
  // 🔴 **والدليل مابيتمسحش طالما فيه بلاغ لسه مفتوح على نفس الواقعة**، مهما طال:
  // السقف بيحمي من الاحتفاظ الأبدي، مش من إتلاف دليل في واقعة تحت المراجعة.
  // والحكم على **الواقعة** (`kind:targetId`) مش على صفّ البلاغ، لأن `Evidence`
  // واقعة واحدة لكل هدف مهما كان عدد المبلّغين.
  const eCut = new Date(now - EVIDENCE_YEARS * 365.25 * DAY);
  const csWhere = { reason: "child_safety", status: "resolved", resolvedAt: { lt: eCut } };
  out.childSafetyReports = wet
    ? (await db.report.deleteMany({ where: csWhere })).count
    : await db.report.count({ where: csWhere });

  const openCases = new Set(
    (await db.report.findMany({ where: { status: "open" }, select: { kind: true, targetId: true } })).map(
      (r) => `${r.kind}:${r.targetId}`,
    ),
  );
  const aged = await db.evidence.findMany({
    where: { savedAt: { lt: eCut } },
    select: { id: true, kind: true, targetId: true },
  });
  const dropIds = aged.filter((e) => !openCases.has(`${e.kind}:${e.targetId}`)).map((e) => e.id);
  out.evidence =
    wet && dropIds.length ? (await db.evidence.deleteMany({ where: { id: { in: dropIds } } })).count : dropIds.length;

  return out;
}

/**
 * مسح ملفات من القرص بأمان: الاسم لازم يطابق نمط الأسماء اللي السيرفر بيولّدها،
 * ولازم يكون جوه UPLOAD_DIR بعد `resolve` (مفيش `..`)، ولازم **مفيش أي صف** في
 * أي جدول بيشاور عليه.
 */
async function sweepFiles(ctx: Ctx, urls: (string | null)[], wet: boolean): Promise<number> {
  const { db } = ctx;
  const dir = path.resolve(ctx.config.UPLOAD_DIR);
  const refs: FileRef[] = [
    { table: "attachment", count: (n) => db.attachment.count({ where: { url: { endsWith: n } } }) },
    { table: "story", count: (n) => db.story.count({ where: { imageUrl: { endsWith: n } } }) },
    { table: "user", count: (n) => db.user.count({ where: { photoUrl: { endsWith: n } } }) },
    { table: "thread", count: (n) => db.thread.count({ where: { photoUrl: { endsWith: n } } }) },
  ];
  let n = 0;
  for (const url of new Set(urls.filter((u): u is string => !!u))) {
    const name = path.basename(url.split("?")[0]);
    if (!/^[0-9a-f]{16,64}(\.[a-z0-9]{1,10})?$/.test(name)) continue; // مش من أسماء السيرفر
    const file = path.resolve(dir, name);
    if (path.dirname(file) !== dir) continue; // برّه مجلد المرفوعات
    if (!fs.existsSync(file)) continue;
    let referenced = 0;
    for (const r of refs) referenced += await r.count(name);
    if (referenced > 0) continue; // لسه فيه صف بيستخدم الملف
    n++;
    if (wet) { try { fs.unlinkSync(file); } catch { n--; } }
  }
  return n;
}

/**
 * تشغيل الكنس مرة بعد دقيقة من قيام السيرفر، وبعدها كل ٢٤ ساعة.
 * بيطبع سطر واحد بالأرقام — وده اللي بيخلي «مفيش حاجة بتتمسح» حاجة ملحوظة بدل
 * ما تبقى سكوت. `unref` عشان مايمنعش الإغلاق النضيف.
 */
export function startRetention(ctx: Ctx) {
  const mode = ctx.config.RETENTION as RetentionMode;
  if (mode === "off") { console.log("ℹ️ الحذف التلقائي موقوف (RETENTION=off)"); return; }
  const run = async () => {
    try {
      const r = await retentionSweep(ctx, mode);
      const line = Object.entries(r).map(([k, v]) => `${k}=${v}`).join(" · ");
      console.log(mode === "on" ? `🧹 حذف تلقائي: ${line}` : `🧪 حذف تلقائي (تجربة جافة — مفيش حذف فعلي): ${line}  ← لتفعيله: RETENTION=on`);
    } catch (e) {
      console.error("❌ الحذف التلقائي فشل:", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY).unref();
}
