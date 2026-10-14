/**
 * تحديد تاريخ ميلاد لحساب قديم **بإدخال من المالك**.
 *
 * الحسابات المنشأة قبل ١٣ أكتوبر ٢٠٢٦ مالهاش `birthDate` (كان اختياريًا)،
 * فالمحفظة مقفولة عليها وبتتعامل معاملة «غير محدَّدة السن» في الإعلانات.
 *
 * **الحسّاس هنا:** `terms.html` و`privacy.html` بيقولوا إن تاريخ الميلاد
 * **«إقرار من المستخدم»**. فلو المالك أدخله نيابةً عن حد، لازم السجل يقول كده
 * صراحةً — وإلا بنكتب إقرارًا منسوبًا لصاحب الحساب وهو ما قالوش.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { startTestEnv } from "./helpers.js";
import { setBirthDateByContact } from "../src/lib/setBirthDate.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const owner = { id: "owner", name: "المالك", source: "owner-entered" };
/** حساب قديم = اتسجّل وبعدين العمود اتفضّى صريح (حالة الإنتاج فعلًا) */
const legacy = async (phone: string) => {
  const u = await env.login(phone, "حساب قديم");
  await env.ctx.db.user.update({ where: { id: u.user.id }, data: { birthDate: null } });
  return u;
};

describe("تحديد تاريخ ميلاد لحساب قديم", () => {
  it("بيكتب التاريخ **ويسجّل إنه بإدخال المالك** مش إقرارًا من المستخدم", async () => {
    const u = await legacy("01099200001");
    const r = await setBirthDateByContact(env.ctx, "01099200001", "1972-09-01", owner);
    expect(r.ok).toBe(true);
    const after = await env.ctx.db.user.findUnique({ where: { id: u.user.id } });
    expect(after!.birthDate?.toISOString().slice(0, 10)).toBe("1972-09-01");
    const log = await env.ctx.db.auditLog.findFirst({ where: { target: u.user.id, action: "حدّد تاريخ ميلاد حساب قديم" } });
    expect(log, "مفيش أثر في سجل الإجراءات — مين أدخل التاريخ بقى مجهولًا").toBeTruthy();
    expect(JSON.stringify(log!.meta)).toContain("owner-entered");
  });

  it("**مابيكتبش فوق تاريخ موجود** — إقرار المستخدم نفسه هو الأصل", async () => {
    await env.login("01099200002", "حساب حديث"); // بيتسجّل بتاريخ افتراضي من الهيلبر
    const r = await setBirthDateByContact(env.ctx, "01099200002", "1990-11-06", owner);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("already_set");
  });

  it("بيرفض الأقل من ١٨ وأي تاريخ غير صالح أو حساب مش موجود", async () => {
    await legacy("01099200003");
    const fixed = new Date("2026-10-14T09:00:00.000Z");
    const under = await setBirthDateByContact(env.ctx, "01099200003", "2015-01-01", owner, fixed);
    expect(under.ok === false && under.code).toBe("under_age");
    const bad = await setBirthDateByContact(env.ctx, "01099200003", "1/9/1972", owner, fixed);
    expect(bad.ok === false && bad.code).toBe("bad_format");
    const future = await setBirthDateByContact(env.ctx, "01099200003", "2030-01-01", owner, fixed);
    expect(future.ok === false && future.code).toBe("invalid_birth_date");
    const none = await setBirthDateByContact(env.ctx, "01099299999", "1990-01-01", owner, fixed);
    expect(none.ok === false && none.code).toBe("not_found");
    // ومحدش اتكتبله حاجة بعد كل ده
    const u = await env.ctx.db.user.findFirst({ where: { phone: "01099200003" } });
    expect(u!.birthDate).toBeNull();
  });

  it("بيلاقي الحساب بالإيميل كمان، وبنفس تطبيع السيرفر", async () => {
    // حساب قديم بإيميل — السيرفر بيخزّن الإيميل بحروف صغيرة
    const u = await env.ctx.db.user.create({ data: { name: "بالإيميل", email: "x.user@example.com" } });
    const r = await setBirthDateByContact(env.ctx, "  X.User@EXAMPLE.com  ", "1990-11-06", owner);
    expect(r.ok, "التطبيع مختلف عن السيرفر — الحساب مش هيتلاقى").toBe(true);
    const after = await env.ctx.db.user.findUnique({ where: { id: u.id } });
    expect(after!.birthDate?.toISOString().slice(0, 10)).toBe("1990-11-06");
  });
});

/**
 * **السكربت نفسه، مش الدالة بس.** أول تشغيل حقيقي على الإنتاج فشل بـ
 * `Cannot find module '.prisma/client/default'`: السكربت كان بيستورد
 * `@prisma/client` مباشرةً، والـ client مولَّد في مسار مخصّص
 * (`output = "../src/generated/prisma"` في `schema.prisma`) ومعاه adapter.
 * الاختبار ده بيشغّل السكربت فعلًا على قاعدة حقيقية — ده اللي بيمسك الحالة دي،
 * لأن الدالة لوحدها كانت عدّت في الاختبارات وهي سليمة.
 */
describe("السكربت جوه الحاوية", () => {
  const ROOT = path.resolve(import.meta.dirname, "../..");
  const src = () => fs.readFileSync(path.join(ROOT, "scripts/lib/setbirth.mjs"), "utf8");
  const run = (env: Record<string, string>) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      const child = execFile("node", ["--import", "tsx", "--input-type=module", "-"],
        { encoding: "utf8", cwd: path.join(ROOT, "server"), env: {
          ...process.env, DATABASE_URL: env.DATABASE_URL, JWT_SECRET: "test-secret-test-secret",
          RC_SETBIRTH_LIB: path.join(ROOT, "server/src/lib/setBirthDate.ts"),
          RC_DB_LIB: path.join(ROOT, "server/src/db.ts"),
          RC_CONFIG_LIB: path.join(ROOT, "server/src/config.ts"),
          ...env,
        } },
        (err, so, se) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: so + se }));
      child.stdin!.write(src()); child.stdin!.end();
    });

  it("بيكتب فعلًا لما يتشغّل كأمر — بقاعدة حقيقية", async () => {
    const u = await env.login("01099300001", "من السكربت");
    await env.ctx.db.user.update({ where: { id: u.user.id }, data: { birthDate: null } });
    const r = await run({ DATABASE_URL: env.dbUrl, RC_CONTACT: "01099300001", RC_BIRTH: "1972-09-01" });
    expect(r.out).toContain("✅");
    expect(r.code).toBe(0);
    const after = await env.ctx.db.user.findUnique({ where: { id: u.user.id } });
    expect(after!.birthDate?.toISOString().slice(0, 10)).toBe("1972-09-01");
  }, 60_000);

  it("بيرجّع خطأ واضح على حساب مش موجود، ومابيكتبش حاجة", async () => {
    const r = await run({ DATABASE_URL: env.dbUrl, RC_CONTACT: "01099399999", RC_BIRTH: "1990-11-06" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/مفيش حساب/);
  }, 60_000);

  it("**مابيستوردش `@prisma/client`** — الـ client مولَّد في مسار مخصّص", () => {
    // التعليق بيشرح ليه مابنستوردوش، فبنشيل التعليقات قبل الفحص
    const code = src().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code, "الاستيراد ده بيفشل في حاوية الإنتاج").not.toMatch(/@prisma\/client/);
    expect(src()).toMatch(/createDb/);
    // وكل استيراد لوحده عشان الرسالة تسمّي اللي فشل فعلًا مش أول واحد
    expect(src()).toMatch(/async function need/);
  });
});
