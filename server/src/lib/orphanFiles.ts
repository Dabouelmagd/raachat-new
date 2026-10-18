/**
 * **الملفات اليتيمة في `uploads/`** — ملف على القرص مفيش ولا صفّ في القاعدة
 * بيشاور عليه. بيحصل لما صفّ يتمسح والملف يفضل: حساب اتمسح، رسالة اتحذفت،
 * ستوري خلصت قبل ما كنس المدد يبقى موجود، أو رفع فشل بعد ما الملف اتكتب.
 *
 * وده مش ترتيب بس: `privacy.html` بيوعد بمحو البيانات، والمرفق اللي صفّه
 * اتمسح **لسه بيانات شخصية قاعدة على القرص**. فالوعد مايكتملش من غير ده.
 *
 * بره النطاق عن قصد: الحذف نفسه. الدالة دي **بتقول** إيه اليتيم، والقرار
 * والتنفيذ في `scripts/orphan-files.sh` — لأن الحذف مابيرجعش.
 */

/** الأعمدة اللي بتشاور على ملف مرفوع. أي عمود جديد **لازم** يتضاف هنا. */
export const FILE_COLUMNS = [
  "User.photoUrl",
  "Thread.photoUrl",
  "Attachment.url",
  "Story.imageUrl",
  // صورة الإعلان: من غير السطر ده كنس الملفات اليتيمة بيمسح صور إعلانات **شغّالة**
  "AdCampaign.imageUrl",
  "AdBooking.imageUrl",
] as const;

/**
 * نافذة أمان: ملف أحدث من كده **مابيتحسبش يتيمًا** مهما كان.
 * السبب حالة حقيقية مش نظرية: الواجهة بترفع الملف **الأول** وبعدين تبعت
 * الرسالة اللي بتعمل صفّ `Attachment`. فبين الخطوتين الملف موجود بلا صفّ —
 * ومسحه ساعتها يضيّع مرفق مستخدم بيبعته في اللحظة دي.
 */
export const MIN_AGE_MS = 24 * 3_600_000;

export type OrphanFile = { name: string; size: number; mtime: Date };

export type OrphanReport = {
  /** كل الملفات في المجلد */
  total: number;
  /** الأسماء اللي القاعدة بتشاور عليها */
  referenced: number;
  /** يتيم وعدّى نافذة الأمان — دي اللي ينفع تتمسح */
  orphans: OrphanFile[];
  /** يتيم بس لسه جوه النافذة — بنسيبه وبنعدّه بس */
  tooNew: number;
  bytes: number;
  /**
   * `abort` معناها **مانمسحش ولا ملف**: فيه ملفات والقاعدة رجّعت صفر مرجع.
   * ممكن تكون الحقيقة (قاعدة فاضية) وممكن يكون استعلام بايظ أو اسم عمود
   * اتغيّر — ومن النتيجة لوحدها **مفيش طريق نفرّق**. والفرق هنا بين تنضيف
   * وبين مسح كل مرفقات المستخدمين، فالوقوف هو السلوك الصح.
   */
  abort?: string;
};

type Db = {
  user: { findMany: (a: unknown) => Promise<{ photoUrl: string | null }[]> };
  thread: { findMany: (a: unknown) => Promise<{ photoUrl: string | null }[]> };
  attachment: { findMany: (a: unknown) => Promise<{ url: string }[]> };
  story: { findMany: (a: unknown) => Promise<{ imageUrl: string | null }[]> };
};

type Fs = {
  readdir: (dir: string, o: { withFileTypes: true }) => Promise<{ name: string; isFile: () => boolean }[]>;
  stat: (p: string) => Promise<{ size: number; mtimeMs: number }>;
};

/**
 * الاسم من رابط كامل: `https://host/uploads/abc.jpg` ← `abc.jpg`.
 * بياخد آخر جزء بعد `/` وبيشيل أي `?query`، وبيتعامل مع الرابط النسبي كمان
 * (`/uploads/abc.jpg`) لأن بيانات قديمة ممكن تكون مخزّنة كده.
 */
export function fileNameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.split("?")[0].split("#")[0];
  const name = clean.slice(clean.lastIndexOf("/") + 1).trim();
  return name ? decodeURIComponent(name) : null;
}

export async function findOrphans(
  ctx: { db: Db; fs: Fs; path: { join: (...p: string[]) => string } },
  dir: string,
  opts: { now?: Date; minAgeMs?: number } = {},
): Promise<OrphanReport> {
  const now = opts.now ?? new Date();
  const minAge = opts.minAgeMs ?? MIN_AGE_MS;

  // المراجع من **كل** الأعمدة الأربعة. وملف واحد ممكن يتشاور عليه من أكتر من
  // صفّ (إعادة التوجيه بتعمل مرفقًا جديدًا بـ**نفس** الرابط) — فالمجموعة
  // بتتعامل مع ده لوحدها، والحكم على «مفيش ولا مرجع» مش على «الصفّ اتمسح».
  const ref = new Set<string>();
  const add = (u: string | null | undefined) => {
    const n = fileNameOf(u);
    if (n) ref.add(n);
  };
  const [users, threads, atts, stories] = await Promise.all([
    ctx.db.user.findMany({ where: { photoUrl: { not: null } }, select: { photoUrl: true } }),
    ctx.db.thread.findMany({ where: { photoUrl: { not: null } }, select: { photoUrl: true } }),
    ctx.db.attachment.findMany({ select: { url: true } }),
    ctx.db.story.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
  ]);
  for (const u of users) add(u.photoUrl);
  for (const t of threads) add(t.photoUrl);
  for (const a of atts) add(a.url);
  for (const s of stories) add(s.imageUrl);

  let entries: { name: string; isFile: () => boolean }[];
  try {
    entries = await ctx.fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return { total: 0, referenced: ref.size, orphans: [], tooNew: 0, bytes: 0, abort: `مش قادر أقرا ${dir}: ${(e as Error).message}` };
  }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  const orphans: OrphanFile[] = [];
  let tooNew = 0;
  let bytes = 0;
  for (const name of files) {
    if (ref.has(name)) continue;
    let st: { size: number; mtimeMs: number };
    try {
      st = await ctx.fs.stat(ctx.path.join(dir, name));
    } catch {
      continue; // اتمسح وإحنا بنقرا — مش مشكلتنا
    }
    if (now.getTime() - st.mtimeMs < minAge) {
      tooNew++;
      continue;
    }
    orphans.push({ name, size: st.size, mtime: new Date(st.mtimeMs) });
    bytes += st.size;
  }

  const report: OrphanReport = { total: files.length, referenced: ref.size, orphans, tooNew, bytes };
  if (files.length > 0 && ref.size === 0) {
    report.abort =
      "فيه ملفات والقاعدة رجّعت **صفر مرجع** — ممكن تكون الحقيقة وممكن يكون الاستعلام بايظ أو عمود اتغيّر اسمه. مفيش مسح.";
  }
  return report;
}
