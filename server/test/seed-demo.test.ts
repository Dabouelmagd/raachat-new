import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestEnv } from "./helpers.js";
import { seedDemo, unseedDemo, DEMO_PHONES } from "../src/seed-demo.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

describe("البيانات التجريبية", () => {
  it("تتزرع وتتكرر بأمان، وتربط حسابي، وتتمسح من غير ما تمس الحسابات الحقيقية", async () => {
    const me = await env.login("01097000001", "داليا");
    const r1 = await seedDemo(env.ctx.db, "01097000001");
    expect(r1).toMatchObject({ users: 6, linked: "داليا" });

    // الحساب بقى عنده محادثة فردية وعضوية في جروب الشغل
    const mine = await env.ctx.db.thread.findMany({ where: { members: { some: { userId: me.user.id } } } });
    expect(mine.some((t) => t.type === "dm")).toBe(true);
    expect(mine.some((t) => t.name === "مجموعة الشغل 💼")).toBe(true);

    // التكرار آمن: مفيش تكرار في المستخدمين ولا الرسايل
    const msgsBefore = await env.ctx.db.message.count();
    const r2 = await seedDemo(env.ctx.db, "01097000001");
    expect(r2.users).toBe(6);
    expect(await env.ctx.db.user.count({ where: { phone: { in: DEMO_PHONES } } })).toBe(6);
    expect(await env.ctx.db.message.count()).toBe(msgsBefore);

    // المسح بيشيل التجريبي بس
    const rm = await unseedDemo(env.ctx.db);
    expect(rm.users).toBe(6);
    expect(await env.ctx.db.user.count({ where: { phone: { in: DEMO_PHONES } } })).toBe(0);
    expect(await env.ctx.db.user.findUnique({ where: { id: me.user.id } })).not.toBeNull();
  });
});
