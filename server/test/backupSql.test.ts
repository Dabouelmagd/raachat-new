import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { startTestEnv } from "./helpers.js";

/**
 * فحوص النسخة الاحتياطية (`scripts/lib/verify-backup.sql`) بتشتغل على السيرفر بس،
 * فلو جدول أو عمود اتغيّر اسمه كان ممكن تفضل «ناجحة» وهي مش بتفحص حاجة — أو تفشل
 * على السيرفر وقت ما نكون محتاجينها. الاختبار ده بيشغّل نفس الملف على المخطط الحالي.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const sqlPath = path.resolve("../scripts/lib/verify-backup.sql");

describe("فحوص النسخة الاحتياطية", () => {
  it("الملف موجود وبيشتغل على المخطط الحالي وبيرجّع الأسماء المتوقعة", async () => {
    expect(fs.existsSync(sqlPath), sqlPath).toBe(true);
    const sql = fs.readFileSync(sqlPath, "utf8");
    const code = sql.replace(/--[^\n]*/g, ""); // بدون التعليقات، عشان الفحوص تحت تبص على SQL بس
    // قراءة فقط: مفيش أي أمر بيعدّل داتا في ملف الفحوص
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i);
    // فحص الـ migrations مكانه السكربت نفسه (شوف التعليق في verify-backup.sql)
    expect(code).not.toContain("_prisma_migrations");

    const c = new pg.Client({ connectionString: env.ctx.config.DATABASE_URL });
    await c.connect();
    try {
      const res = await c.query(sql); // عدة استعلامات = عدة نتائج
      const rows = (Array.isArray(res) ? res : [res]).flatMap((r) => r.rows as { what: string; n: string | number }[]);
      const got = new Map(rows.map((r) => [r.what, String(r.n)]));
      for (const k of ["users", "threads", "messages", "wallets", "campaigns", "col_User.birthDate"]) {
        expect(got.has(k), `ناقص الفحص: ${k}`).toBe(true);
      }
      expect(Number(got.get("col_User.birthDate"))).toBe(1); // العمود موجود في المخطط
    } finally {
      await c.end();
    }
  });
});
