import type { Ctx } from "../context.js";
import { forbidden } from "./errors.js";

/** اللي أنا حاظرهم */
export const blockedByMe = async (ctx: Ctx, me: string) => (await ctx.db.block.findMany({ where: { blockerId: me }, select: { blockedId: true } })).map((x) => x.blockedId);
/** اللي حاظريني */
export const blockersOf = async (ctx: Ctx, me: string) => (await ctx.db.block.findMany({ where: { blockedId: me }, select: { blockerId: true } })).map((x) => x.blockerId);
/** في حظر بين الاتنين في أي اتجاه؟ */
export const isBlockedEither = async (ctx: Ctx, a: string, b: string) =>
  !!(await ctx.db.block.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { blockerId: true } }));
export async function assertNotBlocked(ctx: Ctx, a: string, b: string) {
  if (await isBlockedEither(ctx, a, b)) throw forbidden("مينفعش تتواصل مع المستخدم ده (محظور)");
}
