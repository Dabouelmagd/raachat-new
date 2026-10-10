import { Router } from "express";
import { z } from "zod";
import { requireAuth, normalizeTarget, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { wrap } from "../lib/errors.js";
import { publicUser } from "../serialize.js";

/** كل الصيغ الممكنة للرقم (01…، +201…، 201…) عشان نطابق مهما اتخزّن بأي صيغة. */
export function phoneVariants(raw: string): string[] {
  const n = normalizeTarget("phone", raw);
  const digits = n.replace(/^\+/, "");
  const out = new Set<string>([n, digits, "+" + digits]);
  const eg = /^(?:20|0)?(1\d{9})$/.exec(digits);
  if (eg) { out.add("0" + eg[1]); out.add("20" + eg[1]); out.add("+20" + eg[1]); }
  return [...out].filter((x) => /^\+?\d{8,15}$/.test(x));
}

/**
 * مطابقة جهات اتصال الجهاز مع المسجّلين. الأرقام بتتبعت مرة واحدة للمطابقة فقط (على TLS)
 * وبترجع بس نتيجة المطابقة؛ السيرفر مش بيخزّن جهات الاتصال ولا بيسجّلها في اللوج.
 */
export function contactRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));
  r.post("/contacts/match", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const { phones } = z.object({ phones: z.array(z.string().max(32)).max(3000) }).parse(req.body);
    const variantToInput = new Map<string, string>();
    for (const p of phones) for (const v of phoneVariants(p)) if (!variantToInput.has(v)) variantToInput.set(v, p);
    if (!variantToInput.size) return res.json({ onApp: [], notOnApp: phones });
    const blocks = await ctx.db.block.findMany({ where: { OR: [{ blockerId: me }, { blockedId: me }] }, select: { blockerId: true, blockedId: true } });
    const hidden = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
    const users = await ctx.db.user.findMany({
      where: { phone: { in: [...variantToInput.keys()] }, id: { not: me }, modStatus: { not: "deleted" }, deletedAt: null },
      select: { id: true, name: true, status: true, color: true, photoUrl: true, phone: true },
    });
    const matched = new Set<string>();
    const onApp = users.filter((u) => !hidden.has(u.id)).map((u) => {
      const input = variantToInput.get(u.phone!)!;
      matched.add(input);
      return { ...publicUser(u), contactPhone: input };
    });
    // الأرقام اللي ملهاش حساب (أو محظور) بترجع كـ«مش على التطبيق» من غير ما نفرّق للعميل
    const hiddenPhones = new Set(users.filter((u) => hidden.has(u.id)).map((u) => variantToInput.get(u.phone!)!));
    res.json({ onApp, notOnApp: phones.filter((p) => !matched.has(p) || hiddenPhones.has(p)) });
  }));
  return r;
}
