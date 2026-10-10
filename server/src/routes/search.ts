import { Router } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { wrap } from "../lib/errors.js";

/** توحيد الكتابة العربية: تشكيل/همزات/ياء/تاء مربوطة — نفس القاعدة على النص والاستعلام */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[ً-ٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
// نفس التوحيد داخل SQL (بدون ILIKE على النص الخام)
const SQL_NORM = (col: string) =>
  `translate(regexp_replace(lower(${col}), '[ً-ٟـ]', '', 'g'), 'أإآٱىة', 'اااايه')`;

export function searchRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));
  const db = ctx.db;

  /**
   * بحث على بيانات المستخدم كلها (مش بس اللي اتحمّل في التطبيق): رسائل محادثاته، الأشخاص بالاسم، الجروبات.
   * ده بحث نصي بالتوحيد العربي — مفيش embeddings ولا نموذج لغوي (راجع README).
   */
  r.get("/search", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const q = z.object({
      q: z.string().trim().min(2).max(100),
      kinds: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    const kinds = new Set((q.kinds ?? "message,person,group").split(","));
    const needle = `%${escLike(norm(q.q))}%`;
    const t0 = Date.now();

    const messages = kinds.has("message")
      ? await db.$queryRaw<{ id: string; threadId: string; text: string; createdAt: Date; authorName: string; threadName: string; type: string }[]>(Prisma.sql`
          SELECT m.id, m."threadId", m.text, m."createdAt", u.name AS "authorName", t.name AS "threadName", t.type::text AS type
          FROM "Message" m
          JOIN "Membership" mem ON mem."threadId" = m."threadId" AND mem."userId" = ${me}
          JOIN "Thread" t ON t.id = m."threadId"
          JOIN "User" u ON u.id = m."authorId"
          WHERE m.deleted = false AND ${Prisma.raw(SQL_NORM('m.text'))} LIKE ${needle}
          ORDER BY m."createdAt" DESC LIMIT ${q.limit}`)
      : [];

    const people = kinds.has("person")
      ? await db.$queryRaw<{ id: string; name: string; color: string }[]>(Prisma.sql`
          SELECT id, name, color FROM "User" WHERE id <> ${me} AND ${Prisma.raw(SQL_NORM('name'))} LIKE ${needle} ORDER BY name LIMIT ${q.limit}`)
      : [];

    const groups = kinds.has("group")
      ? await db.$queryRaw<{ id: string; name: string; isPublic: boolean; joined: boolean }[]>(Prisma.sql`
          SELECT t.id, t.name, t."isPublic",
                 EXISTS (SELECT 1 FROM "Membership" x WHERE x."threadId" = t.id AND x."userId" = ${me}) AS joined
          FROM "Thread" t
          WHERE t.type = 'group' AND ${Prisma.raw(SQL_NORM('t.name'))} LIKE ${needle}
            AND (t."isPublic" = true OR EXISTS (SELECT 1 FROM "Membership" x WHERE x."threadId" = t.id AND x."userId" = ${me}))
          ORDER BY t.name LIMIT ${q.limit}`)
      : [];

    res.json({
      query: q.q, tookMs: Date.now() - t0,
      messages: messages.map((m) => ({ id: m.id, threadId: m.threadId, threadName: m.threadName, threadType: m.type, authorName: m.authorName, text: m.text.slice(0, 300), at: m.createdAt.toISOString() })),
      people, groups,
    });
  }));
  return r;
}
