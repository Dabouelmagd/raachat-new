import type { Ctx } from "../context.js";
import { bad } from "./errors.js";

/** يشيل التشكيل والتطويل وتنويعات الحروف عشان الفلتر ما يتخطّاش بحيلة بسيطة */
export const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\u200B-\u200F\u202A-\u202E]/g, "");

const cache = new WeakMap<Ctx, { raw: string; list: string[] }>();
function words(ctx: Ctx): string[] {
  const raw = ctx.config.BANNED_WORDS;
  const hit = cache.get(ctx);
  if (hit && hit.raw === raw) return hit.list;
  const list = raw.split(",").map((w) => norm(w.trim())).filter((w) => w.length >= 2);
  cache.set(ctx, { raw, list });
  return list;
}

/** بيرمي 400 لو النص فيه كلمة ممنوعة (قايمة BANNED_WORDS في إعدادات السيرفر). */
export function assertClean(ctx: Ctx, ...texts: (string | null | undefined)[]) {
  const list = words(ctx);
  if (!list.length) return;
  for (const t of texts) {
    if (!t) continue;
    const n = norm(t);
    if (list.some((w) => n.includes(w))) throw bad("objectionable", "المحتوى ده مخالف لقواعد المجتمع في رع شات ومينفعش يتنشر");
  }
}
