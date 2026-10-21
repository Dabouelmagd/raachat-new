/**
 * سجل أدلة بلاغات إيذاء الأطفال — الحفظ والفتح والتسليم.
 *
 * 🔴 العطل اللي الملف ده موجود عشانه (اتكشف ٢١ أكتوبر ٢٠٢٦ من مذكرة المحامي):
 * `Report.snippet` **نصّ مقصوص بس** (رسالة → `m.text`، ستوري → `s.caption`)،
 * فالملف نفسه — وهو الدليل الحقيقي — مكانش بيتحفظ في أي مكان، وكان بيتمسح من
 * **تلات طرق** خلال ساعات:
 *   ١) كنس الستوري كل ٢٤ ساعة في `retention.ts` بلا أي استثناء للمبلَّغ عنها.
 *   ٢) إجراء المشرف `delete`/`delete_ban` — `attachment.deleteMany` للرسالة
 *      و`story.deleteMany` للستوري. يعني **اللي بينفّذ القانون هو اللي بيتلف الدليل**.
 *   ٣) وبعدها الملف يبقى يتيمًا و`orphan-files.sh --delete` بيشيله من القرص.
 * والنتيجة: صفّ بلاغ بيعيش سنتين وهو بيشاور على `targetId` مش موجود.
 *
 * **والحفظ وقت البلاغ مش وقت الحذف** عن قصد: المحتوى ممكن يمسحه صاحبه، أو
 * الستوري تنتهي، أو الكنس يجري قبل ما مشرف يشوف البلاغ — فنقطة واحدة مضمونة
 * هي لحظة ورود البلاغ، بدل ما نسابق كل مسارات الحذف.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "../context.js";

const ALG = "aes-256-gcm";
/** ملح ثابت: المفتاح لازم يطلع هو هو كل مرة وإلا الأدلة القديمة ماتتفتحش */
const SALT = "raachat-evidence-v1";

/** مفتاح ٣٢ بايت من `EVIDENCE_KEY` مهما كان طوله */
export function evidenceKey(secret: string): Buffer {
  return crypto.scryptSync(secret, SALT, 32);
}

export function sealEvidence(secret: string, plain: Buffer): { blob: Buffer; iv: Buffer; tag: Buffer } {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALG, evidenceKey(secret), iv);
  const blob = Buffer.concat([c.update(plain), c.final()]);
  return { blob, iv, tag: c.getAuthTag() };
}

/** بيرمي لو المفتاح غلط أو البيانات اتعدّلت (GCM بيتحقق من السلامة) */
export function openEvidence(secret: string, blob: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const d = crypto.createDecipheriv(ALG, evidenceKey(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob), d.final()]);
}

export const sha256 = (b: Buffer): string => crypto.createHash("sha256").update(b).digest("hex");

/**
 * قراءة ملف مرفوع بأمان — **نفس حوارس `sweepFiles` في `retention.ts`**:
 * الاسم لازم يطابق نمط أسماء السيرفر، والمسار بعد `resolve` لازم يفضل جوه
 * مجلد المرفوعات (مفيش `..`).
 */
export function readUpload(ctx: Ctx, url: string | null | undefined): { buf: Buffer; name: string } | null {
  if (!url) return null;
  const dir = path.resolve(ctx.config.UPLOAD_DIR);
  const name = path.basename(url.split("?")[0]!);
  if (!/^[0-9a-f]{16,64}(\.[a-z0-9]{1,10})?$/.test(name)) return null;
  const file = path.resolve(dir, name);
  if (path.dirname(file) !== dir) return null;
  if (!fs.existsSync(file)) return null;
  return { buf: fs.readFileSync(file), name };
}

export type PreserveInput = {
  kind: string;
  targetId: string;
  targetUserId: string | null;
  targetLabel: string;
  place: string;
  /** النصّ كامل — مش مقصوص */
  text: string;
  incidentAt: Date;
  /** رابط الملف المرفوع لو فيه (مرفق الرسالة أو صورة الستوري) */
  fileUrl?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
};

/**
 * بيحفظ الواقعة في السجل. **واقعة واحدة = سجل واحد** (`kind+targetId` فريد)،
 * فتكرار البلاغ من ناس مختلفة مابيعملش نسخ.
 *
 * 🔴 **مابيرميش أبدًا**: ده بيتنادى من مسار الإبلاغ، وفشل الحفظ ماينفعش يمنع
 * حد من الإبلاغ عن اعتداء على طفل. والفشل بيتسجّل في `problem` **وبيتعرض في
 * اللوحة** — فمابيعدّيش في سكوت.
 */
export async function preserveEvidence(ctx: Ctx, input: PreserveInput): Promise<void> {
  const { db } = ctx;
  let problem = "";
  let data: { blob: Buffer; iv: Buffer; tag: Buffer } | null = null;
  let hash: string | null = null;
  let size: number | null = null;
  let name = input.fileName ?? null;

  try {
    const got = input.fileUrl ? readUpload(ctx, input.fileUrl) : null;
    if (input.fileUrl && !got) problem = "file_gone";
    if (got) {
      hash = sha256(got.buf);
      size = got.buf.length;
      name = name ?? got.name;
      const secret = ctx.config.EVIDENCE_KEY;
      // 🔴 بلا مفتاح مابنخزّنش المحتوى خام: السجل بيدخل النسخة الاحتياطية
      // (وهي رايحة لجوجل درايف)، فمادة استغلال غير مشفّرة هناك أسوأ بكتير.
      // بنسجّل البصمة والمقاس والمحضر، و`problem` بيصرخ في اللوحة.
      if (secret) data = sealEvidence(secret, got.buf);
      else problem = "no_key";
    }
  } catch {
    problem = problem || "read_failed";
  }

  const base = {
    targetUserId: input.targetUserId,
    targetLabel: input.targetLabel,
    text: input.text,
    place: input.place,
    fileName: name,
    fileMime: input.fileMime ?? null,
    fileSize: size,
    // Prisma 7 بياخد `Uint8Array<ArrayBuffer>` — و`Buffer` نوعه `ArrayBufferLike`
    // فبيترفض في الأنواع. النسخ هنا مقصود ورخيص (≤١٠ ميجا، حد الرفع).
    blob: data ? new Uint8Array(data.blob) : null,
    iv: data ? new Uint8Array(data.iv) : null,
    tag: data ? new Uint8Array(data.tag) : null,
    sha256: hash,
    problem,
    incidentAt: input.incidentAt,
  };

  try {
    await db.evidence.upsert({
      where: { kind_targetId: { kind: input.kind, targetId: input.targetId } },
      create: { kind: input.kind, targetId: input.targetId, ...base },
      // التكرار مابيكتبش فوق نسخة ناجحة بنسخة فاشلة: لو السجل الموجود فيه
      // الملف فعلًا، بلاغ تاني بعد ما الملف اتمسح مايضيّعهوش.
      update: data || !problem ? base : { targetUserId: base.targetUserId, targetLabel: base.targetLabel },
    });
  } catch (e) {
    console.error("[evidence] فشل حفظ الدليل", input.kind, input.targetId, e);
  }
}
