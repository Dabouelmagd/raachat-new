import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { startTestEnv } from "./helpers.js";
import { demoScope } from "../src/lib/demoScope.js";
import { DEMO_PHONES, seedDemo, unseedDemo } from "../src/seed-demo.js";

/**
 * **مسح الديمو مابيرجعش، ونطاقه أوسع من اسمه.** `unseedDemo` بيمسح **كل محادثة
 * أي حساب تجريبي عضو فيها** ورسايلها — ومن ضمنها **الجروبات العامة الأربعة**
 * اللي `seedDemo` بيعملها. فأي مستخدم حقيقي انضم لواحدة منها من «اكتشف
 * جروبات»: الجروب يتمسح و**رسايله فيه تتمسح معاها**.
 *
 * والجملة اللي كانت في السكربت («حساباتك الحقيقية مش هتتأثر») **صحيحة في
 * الحسابات وغلط في المحتوى** — والحساب مابيتمسحش فعلًا، إنما رسايله بتروح.
 *
 * فأخطر حاجة هنا مش «يمسح» — هي **إن التقرير يكدب**: لو نطاق التقرير اختلف عن
 * اللي `unseedDemo` بيمسحه فعلًا، داليا بتوافق على حاجة وبيحصل غيرها.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const db = () => env.ctx.db as never as Parameters<typeof demoScope>[0];

/** حساب حقيقي (مش من أرقام الديمو) */
const realUser = (n: string) =>
  (env.ctx.db as never as { user: { create: (a: unknown) => Promise<{ id: string; name: string }> } }).user.create({
    data: { name: n, phone: `0119${Math.floor(Math.random() * 10_000_000)}`, birthDate: new Date("1990-01-01") },
  });

describe("نطاق مسح الديمو", () => {
  it("على قاعدة فاضية: مفيش حساب تجريبي ومفيش حاجة تتمسح", async () => {
    const s = await demoScope(db());
    expect(s.demoUsers).toEqual([]);
    expect(s.threads).toEqual([]);
    expect(s.realMemberIds).toEqual([]);
  });

  it("بعد الزرع: بيعدّ الحسابات والمحادثات والرسايل، ومفيش حساب حقيقي متأثر", async () => {
    await seedDemo(db());
    const s = await demoScope(db());
    expect(s.demoUsers.map((u) => u.phone).sort()).toEqual([...DEMO_PHONES].sort());
    expect(s.threads.length, "المفروض فيه محادثة فردية + جروب الشغل + ٤ جروبات عامة").toBeGreaterThanOrEqual(6);
    expect(s.messages).toBeGreaterThan(0);
    expect(s.realMemberIds, "مفيش حساب حقيقي لسه").toEqual([]);
    expect(s.threads.filter((t) => t.isPublic).length, "الجروبات العامة الأربعة").toBe(4);
  });

  /**
   * الحالة الحقيقية اللي بتفرق: مستخدم حقيقي انضم لجروب عام بتاع الديمو.
   * التقرير **لازم** يقوله، لأن المسح هيشيل الجروب ورسايله.
   */
  it("🔴 مستخدم حقيقي في جروب عام بتاع الديمو بيظهر في التقرير", async () => {
    await seedDemo(db());
    const me = await realUser("داليا الحقيقية");
    const pub = (await demoScope(db())).threads.find((t) => t.isPublic)!;
    await (env.ctx.db as never as { membership: { create: (a: unknown) => Promise<unknown> } }).membership.create({
      data: { threadId: pub.id, userId: me.id },
    });

    const s = await demoScope(db());
    expect(s.realMemberIds, "الحساب الحقيقي مش مذكور — التقرير بيكدب").toContain(me.id);
    const t = s.threads.find((x) => x.id === pub.id)!;
    expect(t.realMembers).toBe(1);
  });

  it("ربط حساب حقيقي بـ ME بيظهر كمان", async () => {
    const me = await realUser("صاحب الحساب");
    const u = await (env.ctx.db as never as { user: { findUnique: (a: unknown) => Promise<{ phone: string | null } | null> } }).user.findUnique({
      where: { id: me.id },
    });
    await seedDemo(db(), u!.phone!);
    const s = await demoScope(db());
    expect(s.realMemberIds).toContain(me.id);
  });

  /**
   * **الفحص الحاسم:** التقرير والمسح لازم يكونا على **نفس** المجموعة بالظبط.
   * لو `demoScope` استخدم شرطًا مختلفًا عن `unseedDemo`، التقرير يبقى بلا قيمة.
   */
  it("🔴 اللي التقرير بيقوله = اللي اتمسح فعلًا، ومفيش محادثة تانية اتأثرت", async () => {
    await seedDemo(db());
    const me = await realUser("طرف تالت");
    const dbx = env.ctx.db as never as {
      thread: { create: (a: unknown) => Promise<{ id: string }>; findMany: (a?: unknown) => Promise<{ id: string }[]> };
    };
    // محادثة مالهاش أي علاقة بالديمو — لازم تفضل بعد المسح
    const safe = await dbx.thread.create({
      data: { type: "group", name: "جروب حقيقي", createdById: me.id, members: { create: [{ userId: me.id, role: "owner" }] } },
    });

    /**
     * 🔴 الحالة اللي **بيها بس** يبان الفرق بين «فيها عضو تجريبي» (الصح) و
     * «منشئها تجريبي» (غلط قريب): محادثة **حساب حقيقي** عملها وضمّ فيها حسابًا
     * تجريبيًا. `unseedDemo` بيمسحها، وأي نطاق مبني على المنشئ **مابيشوفهاش**.
     * من غير السطور دي كان الاختبار بيعدّي على نطاق غلط — اتأكدت بالتجربة.
     */
    const demo = (await demoScope(db())).demoUsers[0]!;
    const mixed = await dbx.thread.create({
      data: {
        type: "group",
        name: "جروب حقيقي فيه حساب تجريبي",
        createdById: me.id,
        members: { create: [{ userId: me.id, role: "owner" }, { userId: demo.id }] },
      },
    });

    const before = await demoScope(db());
    expect(before.threads.map((t) => t.id), "المحادثة المختلطة مش في النطاق").toContain(mixed.id);
    expect(before.realMemberIds, "صاحب المحادثة المختلطة مش محسوب").toContain(me.id);
    const planned = new Set(before.threads.map((t) => t.id));
    expect(planned.has(safe.id), "محادثة مالهاش علاقة دخلت النطاق").toBe(false);

    const res = await unseedDemo(db());
    expect(res.threads, "عدد اللي اتمسح مختلف عن اللي التقرير قاله").toBe(planned.size);

    const left = new Set((await dbx.thread.findMany({ select: { id: true } })).map((t) => t.id));
    for (const id of planned) expect(left.has(id), `محادثة في التقرير ما اتمسحتش: ${id}`).toBe(false);
    expect(left.has(safe.id), "المحادثة اللي مالهاش علاقة اتمسحت").toBe(true);

    const after = await demoScope(db());
    expect(after.demoUsers).toEqual([]);
    expect(after.threads).toEqual([]);
  });
});

/**
 * ترتيب السكربت: التقرير **قبل** السؤال. تقرير بعد ما تكتبي «امسح» بلا قيمة،
 * وده بالظبط الفرق بين موافقة واعية وموافقة على المجهول.
 */
describe("سكربت الديمو", () => {
  const sh = fs.readFileSync(path.resolve(import.meta.dirname, "../../scripts/seed-demo.sh"), "utf8");

  it("بيعرض النطاق قبل ما يسأل التأكيد", () => {
    const remove = sh.slice(sh.indexOf('if [ "${REMOVE:-0}" = "1" ]'));
    const scopeAt = remove.indexOf("scope");
    const readAt = remove.indexOf("read -r -p");
    expect(scopeAt, "مفيش نداء للنطاق في مسار المسح").toBeGreaterThan(-1);
    expect(readAt, "مفيش سؤال تأكيد").toBeGreaterThan(-1);
    expect(scopeAt, "التقرير بعد السؤال — بلا قيمة").toBeLessThan(readAt);
  });

  it("فيه --check بيقرا بلا مسح", () => {
    expect(sh).toContain('"--check"');
    const check = sh.slice(sh.indexOf('= "--check"'), sh.indexOf('if [ "${REMOVE:-0}"'));
    expect(check, "--check مايشغّلش المسح").not.toContain("REMOVE=1 api");
  });

  it("مابيدّعيش إن الحسابات الحقيقية مش بتتأثر خالص", () => {
    expect(sh, "الجملة القديمة المضلّلة رجعت").not.toContain("حساباتك الحقيقية مش هتتأثر");
    expect(sh, "لازم يقول إن الرسايل جوه المحادثات دي بتتمسح").toContain("رسايله جوه المحادثات دي بتتمسح");
  });

  it("التأكيد بكلمة كاملة بالعربي", () => {
    expect(sh).toMatch(/امسح\|امسحي/);
  });
});
