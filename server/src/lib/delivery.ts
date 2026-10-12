import type { Ctx } from "../context.js";
import { emitToUsers } from "../realtime.js";

/**
 * «وصلت» للرسايل (✓✓ رمادي) قبل «اتقرت» (✓✓ أزرق).
 *
 * أول ما جهاز المستخدم يتصل، كل الرسايل اللي اتبعتت له وهو أوفلاين تبقى **وصلت**
 * — فبنسجّل الوقت ده على عضوياته كلها، وبنبلّغ الباقيين عشان العلامة تتحدّث
 * عندهم من غير ما يعملوا تحديث للصفحة.
 *
 * ليه على مستوى العضوية مش على كل رسالة: صف واحد لكل محادثة بدل صف لكل رسالة
 * لكل مستلم — والمقارنة بتبقى `lastDeliveredAt >= createdAt`.
 */
export async function markDelivered(ctx: Ctx, userId: string) {
  const at = new Date();
  const mine = await ctx.db.membership.findMany({ where: { userId }, select: { threadId: true } });
  if (mine.length === 0) return;
  const threadIds = mine.map((m) => m.threadId);
  await ctx.db.membership.updateMany({ where: { userId, threadId: { in: threadIds } }, data: { lastDeliveredAt: at } });

  // نبلّغ باقي الأعضاء بس (صاحب الجهاز مش محتاج يعرف إن رسايله وصلت لنفسه)
  const others = await ctx.db.membership.findMany({
    where: { threadId: { in: threadIds }, userId: { not: userId } },
    select: { threadId: true, userId: true },
  });
  const byThread = new Map<string, string[]>();
  for (const o of others) byThread.set(o.threadId, [...(byThread.get(o.threadId) ?? []), o.userId]);
  for (const [threadId, users] of byThread) {
    emitToUsers(ctx, users, "delivered", { threadId, at: at.toISOString() });
  }
}
