import type { Ctx } from "../context.js";

/**
 * **مصدر واحد لمحو بيانات حساب.** بيُستخدم في مسارين:
 *   • حذف ذاتي: `DELETE /me` (بكود تأكيد على وسيلة الحساب نفسها).
 *   • محو إداري: `POST /admin/users/:id/erase` — لازم للوفاء باللي الشروط
 *     وسياسة الخصوصية بيوعدوا بيه: «متى تبيّن لنا أنّ حسابًا يخصّ من هو دون
 *     ١٨ سنة أغلقناه ومحونا بياناته **فورًا**». قبل كده كان الموظف يقدر
 *     **يوقف** بس (`modStatus`)، والمحو مكانش موجود غير لصاحب الحساب — يعني
 *     وعد منشور بلا آلية.
 *
 * **ليه دالة واحدة مش نسختين:** لو كل مسار عمل ترانزاكشن لوحده، نسيان جدول في
 * واحدة منهم = بيانات شخصية فاضلة بعد «المحو» ومحدش واخد باله (نفس درس «الحارس
 * لازم يبقى على كل المسارات»). أي جدول جديد فيه بيانات مستخدم يتضاف **هنا**.
 *
 * بيعمل **إخفاء هوية** مش `DELETE` للصف: الرسايل في محادثات ناس تانية بتفضل
 * موجودة كـ«محذوفة» بنصّ فاضي، والمعرّف بيفضل عشان المفاتيح الأجنبية ما تتكسرش.
 */
export async function eraseUser(
  ctx: Ctx,
  userId: string,
  actor: { id: string; name: string; action: string; meta?: Record<string, unknown> },
) {
  const db = ctx.db;
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { wallet: { select: { balance: true } } },
  });
  if (!u) return null;
  const balance = Number(u.wallet?.balance ?? 0);
  const ownedRooms = await db.room.findMany({ where: { ownerId: userId, closedAt: null }, select: { id: true } });
  const joined = await db.roomParticipant.findMany({ where: { userId }, select: { roomId: true } });
  const now = new Date();

  await db.$transaction([
    db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    db.pushSub.deleteMany({ where: { userId } }),
    db.adminHandoff.deleteMany({ where: { userId } }),
    db.attachment.deleteMany({ where: { message: { authorId: userId } } }),
    db.message.updateMany({ where: { authorId: userId }, data: { deleted: true, text: "" } }),
    db.story.deleteMany({ where: { authorId: userId } }),
    db.callLog.deleteMany({ where: { userId } }),
    // أحداث الإعلانات باسم المستخدم. (اللي بمعرّف مستعار مش منسوب له أصلًا،
    // وبيتمسح بعمره في routes/ads.ts.)
    db.adEvent.deleteMany({ where: { userId } }),
    db.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
    db.roomParticipant.deleteMany({ where: { userId } }),
    db.room.updateMany({ where: { ownerId: userId, closedAt: null }, data: { closedAt: now } }),
    db.membership.deleteMany({ where: { userId } }),
    // أكواد التحقق فيها وسيلة الاتصال صريحة — تتمسح مع الحساب
    ...(u.phone ? [db.otpCode.deleteMany({ where: { channel: "phone", target: u.phone } })] : []),
    ...(u.email ? [db.otpCode.deleteMany({ where: { channel: "email", target: u.email } })] : []),
    db.wallet.updateMany({ where: { userId }, data: { balance: 0, pinHash: null } }),
    db.user.update({
      where: { id: userId },
      data: { name: "حساب محذوف", phone: null, email: null, photoUrl: null, status: "", modStatus: "deleted", deletedAt: now },
    }),
    db.auditLog.create({
      data: { actorId: actor.id, actorName: actor.name, action: actor.action, target: userId, meta: { forfeited: balance, ...actor.meta } },
    }),
  ]);

  ctx.io?.in(`user:${userId}`).disconnectSockets(true);
  for (const x of new Set([...ownedRooms.map((r) => r.id), ...joined.map((r) => r.roomId)])) {
    ctx.io?.to("rooms").emit("room:changed", { id: x });
  }
  return { balance, name: u.name };
}
