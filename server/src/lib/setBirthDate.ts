import type { Ctx } from "../context.js";
import { normalizeTarget } from "../auth.js";
import { ADULT_AGE, isAdult, validBirthDate } from "./age.js";

/**
 * يكتب تاريخ ميلاد لحساب **قديم** (منشأ قبل ١٣ أكتوبر ٢٠٢٦، لما الحقل كان
 * اختياري) — بإدخال من المالك، لا من المستخدم.
 *
 * **ليه ده حساس:** `terms.html` و`privacy.html` بيقولوا إن تاريخ الميلاد
 * **«إقرار من المستخدم»**. فلما المالك يدخله نيابةً عن حد، السجل لازم يقول كده
 * صراحةً — عشان ما نكتبش إقرارًا منسوبًا لصاحب الحساب وهو ما قالوش. علشان كده
 * كل كتابة هنا بتسجّل `source: "owner-entered"` ومين أدخلها في `AuditLog`.
 *
 * وحارسان مقصودان:
 *   • **مابيكتبش فوق تاريخ موجود** — لو المستخدم أدخله بنفسه، إقراره هو الأصل.
 *   • **بيرفض أي تاريخ أقل من ١٨** — التطبيق ١٨+، ومينفعش نفتح حسابًا بمخالفة.
 */
export async function setBirthDateByContact(
  ctx: Ctx,
  rawContact: string,
  iso: string,
  actor: { id: string; name: string; source: string },
  now: Date = new Date(),
) {
  const contact = rawContact.trim();
  if (!contact) return { ok: false as const, code: "no_contact", msg: "اكتبي رقم أو إيميل الحساب" };
  const channel = contact.includes("@") ? ("email" as const) : ("phone" as const);
  const target = normalizeTarget(channel, contact);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false as const, code: "bad_format", msg: "الشكل لازم يكون YYYY-MM-DD" };
  const birth = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime()) || !validBirthDate(birth, now)) {
    return { ok: false as const, code: "invalid_birth_date", msg: "تاريخ ميلاد غير صالح" };
  }
  if (!isAdult(birth, now)) {
    return { ok: false as const, code: "under_age", msg: `التطبيق لمن بلغ ${ADULT_AGE} سنة — التاريخ ده أقل من كده` };
  }

  const user = await ctx.db.user.findFirst({
    where: channel === "phone" ? { phone: target } : { email: target },
    select: { id: true, name: true, birthDate: true, modStatus: true },
  });
  if (!user) return { ok: false as const, code: "not_found", msg: "مفيش حساب بالوسيلة دي" };
  if (user.modStatus === "deleted") return { ok: false as const, code: "deleted", msg: "الحساب ده ممحو" };
  if (user.birthDate) {
    return { ok: false as const, code: "already_set", msg: "الحساب ده تاريخه متحدَّد بالفعل — مابنكتبش فوق إقرار المستخدم" };
  }

  await ctx.db.$transaction([
    ctx.db.user.update({ where: { id: user.id }, data: { birthDate: birth } }),
    ctx.db.auditLog.create({
      data: {
        actorId: actor.id, actorName: actor.name, action: "حدّد تاريخ ميلاد حساب قديم",
        target: user.id, meta: { source: actor.source, birthDate: iso },
      },
    }),
  ]);
  return { ok: true as const, id: user.id, name: user.name };
}
