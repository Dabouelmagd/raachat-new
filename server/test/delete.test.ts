import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
let owner: Awaited<ReturnType<typeof env.login>>;
beforeAll(async () => { env = await startTestEnv(); owner = await env.login("01099000001", "داليا"); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);
const codeFor = (phone: string) => env.sent.filter((s) => s.target === phone).at(-1)!.code;

describe("حذف الحساب", () => {
  it("يحتاج OTP، يمسح البيانات ويخفي الهوية، ويقفل الجلسات، والرقم يتسجّل من جديد كحساب جديد", async () => {
    const a = await env.login("01094000001", "سارة"), b = await env.login("01094000002", "باقي");
    const g = (await api().post("/threads").set(a.auth).send({ type: "group", name: "ج", memberIds: [b.user.id] }).expect(201)).body;
    const dm = (await api().post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    const m = (await api().post(`/threads/${g.id}/messages`).set(a.auth).send({ text: "سر شخصي" }).expect(201)).body;
    await api().post("/stories").set(a.auth).send({ caption: "ستوري", colorFrom: "#112233", colorTo: "#445566" }).expect(201);
    const room = (await api().post("/rooms").set(a.auth).send({ name: "غرفتي" }).expect(201)).body;
    await api().post("/push/subscribe").set(a.auth).send({ endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } }).expect(204);

    await api().delete("/me").send({ code: "123456" }).expect(401);
    await api().delete("/me").set(a.auth).send({ code: "000000" }).expect(401); // كود غلط
    const o = (await api().post("/me/delete/otp").set(a.auth).expect(200)).body;
    expect(o).toMatchObject({ channel: "phone", balance: 0 }); expect(o.hint).not.toContain("01094000001");
    await api().delete("/me").set(a.auth).send({ code: codeFor("01094000001") }).expect(204);

    await api().get("/me").set(a.auth).expect(401); // الجلسة اتقفلت
    const gone = await env.ctx.db.user.findUnique({ where: { id: a.user.id }, include: { stories: true, memberships: true } });
    expect(gone).toMatchObject({ name: "حساب محذوف", phone: null, email: null, modStatus: "deleted" });
    expect(gone!.deletedAt).toBeTruthy(); expect(gone!.stories).toHaveLength(0); expect(gone!.memberships).toHaveLength(0);
    expect(await env.ctx.db.pushSub.count({ where: { userId: a.user.id } })).toBe(0);
    const msgs = (await api().get(`/threads/${g.id}/messages`).set(b.auth).expect(200)).body;
    const mm = (msgs.items ?? msgs).find((x: any) => x.id === m.id);
    expect(mm.deleted).toBe(true); expect(mm.text).toBe("");
    expect((await api().get("/rooms").set(b.auth)).body.find((x: any) => x.id === room.id)).toBeUndefined();
    await api().post(`/threads/${dm.id}/messages`).set(b.auth).send({ text: "وينك؟" }).expect(403);
    expect((await api().get("/users?q=سارة").set(b.auth)).body).toHaveLength(0);
    expect((await api().get("/users?q=محذوف").set(b.auth)).body).toHaveLength(0);

    const again = await env.login("01094000001", "سارة الجديدة"); // نفس الرقم = حساب جديد فاضي
    expect(again.user.id).not.toBe(a.user.id);
    expect((await api().get("/threads").set(again.auth).expect(200)).body).toHaveLength(0);
  });

  it("الرصيد لازم يتأكد التنازل عنه، والكود ما يتحرقش على الرفض، وفريق الإدارة ممنوع", async () => {
    const u = await env.login("01094000011", "صاحب رصيد");
    await env.ctx.db.wallet.update({ where: { userId: u.user.id }, data: { balance: 150 } });
    const o = (await api().post("/me/delete/otp").set(u.auth).expect(200)).body;
    expect(o.balance).toBe(150);
    const code = codeFor("01094000011");
    const r = await api().delete("/me").set(u.auth).send({ code }).expect(409);
    expect(r.body.code).toBe("wallet_balance"); expect(r.body.message).toContain("150");
    await api().delete("/me").set(u.auth).send({ code, forfeitBalance: true }).expect(204); // نفس الكود لسه صالح
    const w = await env.ctx.db.wallet.findUnique({ where: { userId: u.user.id } });
    expect(Number(w!.balance)).toBe(0);
    expect((await env.ctx.db.auditLog.findFirst({ where: { action: "حذف حساب", actorId: u.user.id } }))!.meta).toMatchObject({ forfeited: 150 });

    const roles = (await api().get("/admin/roles").set(owner.auth)).body as { id: string; key: string }[];
    await api().post("/admin/staff").set(owner.auth).send({ contact: "01094000021", roleId: roles.find((x) => x.key === "support")!.id }).expect(201);
    const st = await env.login("01094000021");
    await api().post("/me/delete/otp").set(st.auth).expect(200);
    expect((await api().delete("/me").set(st.auth).send({ code: codeFor("01094000021") }).expect(409)).body.code).toBe("staff_member");
    await api().post("/me/delete/otp").set(owner.auth).expect(200);
    expect((await api().delete("/me").set(owner.auth).send({ code: codeFor("01099000001") }).expect(409)).body.code).toBe("staff_member");
  });
});

describe("تنزيل نسخة من البيانات (حق الاطلاع)", () => {
  it("يرجّع بيانات المستخدم هو بس بصيغة JSON ويحتاج تسجيل دخول", async () => {
    const a = await env.login("01094100001", "منى"), b = await env.login("01094100002", "كريم");
    const g = (await api().post("/threads").set(a.auth).send({ type: "group", name: "ج", memberIds: [b.user.id] }).expect(201)).body;
    await api().post(`/threads/${g.id}/messages`).set(a.auth).send({ text: "رسالة منى" }).expect(201);
    await api().post(`/threads/${g.id}/messages`).set(b.auth).send({ text: "رسالة كريم" }).expect(201);
    await api().get("/me/export").expect(401);
    const r = await api().get("/me/export").set(a.auth).expect(200);
    expect(r.headers["content-disposition"]).toContain("rachat-my-data.json");
    expect(r.body.profile).toMatchObject({ name: "منى", phone: "01094100001" });
    const texts = r.body.messages.map((m: any) => m.text);
    expect(texts).toContain("رسالة منى"); expect(texts).not.toContain("رسالة كريم");
    expect(JSON.stringify(r.body)).not.toContain("refreshHash");
  });
  it("حذف الحساب بيمسح أحداث الإعلانات وقائمة الحظر", async () => {
    const a = await env.login("01094100003", "هدى"), b = await env.login("01094100004", "عمرو");
    await api().post(`/blocks`).set(a.auth).send({ userId: b.user.id }).expect(204);
    await env.ctx.db.adEvent.create({ data: { userId: a.user.id, adKey: "k", kind: "shown" } });
    await api().post("/me/delete/otp").set(a.auth).expect(200);
    await api().delete("/me").set(a.auth).send({ code: codeFor("01094100003") }).expect(204);
    expect(await env.ctx.db.adEvent.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await env.ctx.db.block.count({ where: { blockerId: a.user.id } })).toBe(0);
  });
});
