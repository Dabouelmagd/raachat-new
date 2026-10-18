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

/**
 * **الوضع الدقيق — يشيل الديمو ويسيب كلام الناس الحقيقي.**
 *
 * الحالة اللي ولّدت الوضع ده حقيقية (الإنتاج، ١٨ أكتوبر ٢٠٢٦): محادثة فردية
 * بـ١٠ رسائل وجروب اسمه «?» بـ٨ رسائل، الاتنين لحسابات حقيقية ومعاها حساب
 * تجريبي — فالمسح الواسع كان هيضيّع ١٨ رسالة حقيقية.
 *
 * وأخطر حاجة هنا مش «يمسح الديمو» — هي **إنه مايسيبش جروبًا بلا مالك**: كل
 * علاقات `User` في المخطط `Cascade` ماعدا `Thread.createdById` اللي `SetNull`،
 * فالجروب اللي مالكه تجريبي يفضل بلا مالك للأبد لو محدش اترقّى.
 */
describe("مسح الديمو مع الحفاظ على الحقيقي", () => {
  const dbx = () =>
    env.ctx.db as never as {
      thread: { create: (a: unknown) => Promise<{ id: string }>; findUnique: (a: unknown) => Promise<unknown> };
      message: { create: (a: unknown) => Promise<{ id: string }>; count: (a?: unknown) => Promise<number>; findMany: (a?: unknown) => Promise<{ id: string; authorId: string }[]> };
      membership: { findMany: (a?: unknown) => Promise<{ userId: string; role: string }[]>; create: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> };
      user: { findMany: (a?: unknown) => Promise<{ id: string }[]> };
    };

  it("🔴 بيسيب المحادثة اللي فيها حساب حقيقي ورسايله، وبيشيل رسايل الديمو منها", async () => {
    await seedDemo(db());
    const me = await realUser("صاحبة الكلام الحقيقي");
    const demo = (await demoScope(db())).demoUsers[0]!;

    // محادثة حساب حقيقي مع حساب تجريبي — زي اللي في الإنتاج
    const mixed = await dbx().thread.create({
      data: { type: "group", name: "كلام حقيقي", createdById: demo.id, members: { create: [{ userId: demo.id, role: "owner" }, { userId: me.id }] } },
    });
    const mine = await dbx().message.create({ data: { threadId: mixed.id, authorId: me.id, text: "رسالتي الحقيقية" } });
    await dbx().message.create({ data: { threadId: mixed.id, authorId: demo.id, text: "رسالة ديمو" } });

    const { unseedDemoKeepReal } = await import("../src/seed-demo.js");
    const r = await unseedDemoKeepReal(db());

    expect((await dbx().thread.findUnique({ where: { id: mixed.id } })), "المحادثة اتمسحت وكان فيها كلام حقيقي").not.toBeNull();
    const left = await dbx().message.findMany({ where: { threadId: mixed.id }, select: { id: true, authorId: true } });
    expect(left.map((m) => m.id), "رسالتي الحقيقية ضاعت").toContain(mine.id);
    expect(left.some((m) => m.authorId === demo.id), "رسالة الديمو لسه موجودة").toBe(false);
    expect(r.threadsKept).toBeGreaterThan(0);
  });

  it("🔴 الجروب اللي مالكه تجريبي مابيفضلش بلا مالك", async () => {
    await seedDemo(db());
    const me = await realUser("عضو حقيقي");
    const demo = (await demoScope(db())).demoUsers[0]!;
    const t = await dbx().thread.create({
      data: { type: "group", name: "جروب مالكه ديمو", createdById: demo.id, members: { create: [{ userId: demo.id, role: "owner" }, { userId: me.id }] } },
    });

    const { unseedDemoKeepReal } = await import("../src/seed-demo.js");
    const r = await unseedDemoKeepReal(db());

    const ms = await dbx().membership.findMany({ where: { threadId: t.id }, select: { userId: true, role: true } });
    expect(ms.length, "العضو الحقيقي اتشال").toBe(1);
    expect(ms[0]!.userId).toBe(me.id);
    expect(ms[0]!.role, "الجروب فضل بلا مالك — ده العطل اللي الوضع ده موجود يمنعه").toBe("owner");
    expect(r.ownersPromoted).toBeGreaterThan(0);
  });

  it("المشرف الحقيقي الموجود هو اللي بيترقّى، مش أي عضو", async () => {
    await seedDemo(db());
    const admin = await realUser("مشرف حقيقي");
    const plain = await realUser("عضو عادي");
    const demo = (await demoScope(db())).demoUsers[0]!;
    const t = await dbx().thread.create({
      data: {
        type: "group", name: "فيه مشرف", createdById: demo.id,
        members: { create: [{ userId: demo.id, role: "owner" }, { userId: plain.id }, { userId: admin.id, role: "admin" }] },
      },
    });

    const { unseedDemoKeepReal } = await import("../src/seed-demo.js");
    await unseedDemoKeepReal(db());

    const ms = await dbx().membership.findMany({ where: { threadId: t.id }, select: { userId: true, role: true } });
    expect(ms.find((m) => m.role === "owner")?.userId, "المشرف الموجود المفروض يترقّى").toBe(admin.id);
  });

  it("المحادثات الديمو الخالصة بتتمسح، والحسابات التجريبية بتختفي", async () => {
    await seedDemo(db());
    const before = await demoScope(db());
    const pureDemo = before.threads.filter((t) => t.realMembers === 0).length;
    expect(pureDemo, "المفروض فيه محادثة ديمو خالصة واحدة على الأقل").toBeGreaterThan(0);

    const { unseedDemoKeepReal } = await import("../src/seed-demo.js");
    const r = await unseedDemoKeepReal(db());
    expect(r.threadsDeleted).toBe(pureDemo);
    expect(r.users).toBe(before.demoUsers.length);

    const after = await demoScope(db());
    expect(after.demoUsers, "لسه فيه حساب تجريبي").toEqual([]);
    expect(await dbx().user.findMany({ where: { phone: { in: DEMO_PHONES } } })).toEqual([]);
  });

  it("مابيلمسش محادثة مالهاش علاقة بالديمو", async () => {
    await seedDemo(db());
    const me = await realUser("مالك جروب حقيقي");
    const safe = await dbx().thread.create({
      data: { type: "group", name: "جروب حقيقي بحت", createdById: me.id, members: { create: [{ userId: me.id, role: "owner" }] } },
    });
    const msg = await dbx().message.create({ data: { threadId: safe.id, authorId: me.id, text: "كلام" } });

    const { unseedDemoKeepReal } = await import("../src/seed-demo.js");
    await unseedDemoKeepReal(db());

    expect(await dbx().thread.findUnique({ where: { id: safe.id } })).not.toBeNull();
    expect((await dbx().message.findMany({ where: { threadId: safe.id } })).map((m) => m.id)).toContain(msg.id);
  });

  it("على قاعدة بلا ديمو مابيعملش حاجة", async () => {
    const { unseedDemoKeepReal } = await import("../src/seed-demo.js");
    expect(await unseedDemoKeepReal(db())).toEqual({ users: 0, threadsDeleted: 0, threadsKept: 0, ownersPromoted: 0 });
  });
});

describe("سكربت الديمو — الوضع الدقيق", () => {
  const sh = fs.readFileSync(path.resolve(import.meta.dirname, "../../scripts/seed-demo.sh"), "utf8");

  it("بيمرّر KEEP_REAL للحاوية", () => {
    expect(sh, "KEEP_REAL مش بيوصل للكود جوه الحاوية — الوضع الدقيق مش هيتنفّذ").toContain('-e KEEP_REAL="$KEEP"');
  });

  it("بيقترح الوضع الدقيق لما يبقى فيه حساب حقيقي متأثر", () => {
    expect(sh).toContain("REMOVE=1 KEEP_REAL=1");
  });
});
