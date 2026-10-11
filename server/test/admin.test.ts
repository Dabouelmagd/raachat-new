import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as client } from "socket.io-client";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
let owner: Awaited<ReturnType<typeof env.login>>;
beforeAll(async () => { env = await startTestEnv(); owner = await env.login("01099000001", "داليا"); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const api = () => request(env.app);
const roles = async () => (await api().get("/admin/roles").set(owner.auth)).body as { id: string; key: string; permissions: string[]; system: boolean }[];
const roleId = async (key: string) => (await roles()).find((r) => r.key === key)!.id;
async function addStaff(phone: string, key: string, extra: Record<string, unknown> = {}) {
  const r = await api().post("/admin/staff").set(owner.auth).send({ contact: phone, roleId: await roleId(key), ...extra });
  expect(r.status).toBe(201);
  return { ...(await env.login(phone)), staff: r.body };
}

describe("admin RBAC", () => {
  it("غير الموظف = 403، وصاحب OWNER_CONTACTS بيبقى مالك بكل الصلاحيات", async () => {
    const nobody = await env.login("01099000002", "عادي");
    expect((await api().get("/admin/me").set(nobody.auth)).body.code).toBe("not_staff");
    await api().get("/admin/me").expect(401);
    const me = (await api().get("/admin/me").set(owner.auth).expect(200)).body;
    expect(me.isOwner).toBe(true);
    expect(me.permissions).toEqual(expect.arrayContaining(["team.manage", "finance.refund", "users.manage"]));
    expect(me.catalog.length).toBeGreaterThan(10);
  });

  it("الأدوار الجاهزة موجودة، والمحاسب يشوف المالية بس مش الفريق ولا يوقف حساب", async () => {
    expect((await roles()).map((r) => r.key).sort()).toEqual(["accountant", "admin", "manager", "moderator", "support"]);
    const acc = await addStaff("01099000010", "accountant");
    const me = (await api().get("/admin/me").set(acc.auth).expect(200)).body;
    expect(me.isOwner).toBe(false); expect(me.role.key).toBe("accountant");
    await api().get("/admin/finance/tx").set(acc.auth).expect(200);
    await api().get("/admin/users").set(acc.auth).expect(200);
    await api().get("/admin/staff").set(acc.auth).expect(403);
    await api().post("/admin/staff").set(acc.auth).send({ contact: "01099000011", roleId: await roleId("admin") }).expect(403);
    const victim = await env.login("01099000012", "ضحية");
    await api().patch(`/admin/users/${victim.user.id}/status`).set(acc.auth).send({ status: "suspended" }).expect(403);
  });

  it("إضافة صلاحية لشخص وسحب صلاحية من دوره (grant/revoke) بتتطبق فورًا", async () => {
    const acc = await addStaff("01099000020", "accountant");
    const victim = await env.login("01099000021", "مستخدم");
    await api().patch(`/admin/users/${victim.user.id}/status`).set(acc.auth).send({ status: "suspended" }).expect(403);
    await api().patch(`/admin/staff/${acc.user.id}`).set(owner.auth).send({ grant: ["users.manage"], revoke: ["finance.offers"] }).expect(200);
    await api().patch(`/admin/users/${victim.user.id}/status`).set(acc.auth).send({ status: "suspended" }).expect(200);
    await api().put("/admin/offers/ZZZ10").set(acc.auth).send({ percent: 10, max: 20 }).expect(403);
    await api().patch(`/admin/users/${victim.user.id}/status`).set(acc.auth).send({ status: "active" }).expect(200);
  });

  it("منع التصعيد: مدير عنده team.manage مش هيدّي صلاحية مالهاش، ومش هيعدّل نفسه ولا المالك", async () => {
    const mgr = await addStaff("01099000030", "manager", { grant: ["team.manage"] });
    const me = (await api().get("/admin/me").set(mgr.auth)).body;
    expect(me.permissions).not.toContain("settings.manage");
    await api().post("/admin/roles").set(mgr.auth).send({ name: "خطر", permissions: ["settings.manage"] }).expect(403);
    await api().post("/admin/staff").set(mgr.auth).send({ contact: "01099000031", roleId: await roleId("accountant"), grant: ["settings.manage"] }).expect(403);
    await api().post("/admin/staff").set(mgr.auth).send({ contact: "01099000031", roleId: await roleId("support") }).expect(201); // بصلاحيات يملكها
    await api().patch(`/admin/staff/${mgr.user.id}`).set(mgr.auth).send({ grant: ["settings.manage"] }).expect(403);
    await api().patch(`/admin/staff/${owner.user.id}`).set(mgr.auth).send({ active: false }).expect(403);
    await api().delete(`/admin/staff/${owner.user.id}`).set(owner.auth).expect(403);
  });

  it("دور مخصص: إنشاء/تعديل/منع الحذف لو مستخدم/حذف، والجاهز مينفعش يتمسح", async () => {
    const created = (await api().post("/admin/roles").set(owner.auth).send({ name: "مراجع مالي", permissions: ["finance.view", "audit.view"] }).expect(201)).body;
    expect(created.system).toBe(false);
    await api().post("/admin/roles").set(owner.auth).send({ name: "x", permissions: ["nope"] }).expect(400);
    const s = (await api().post("/admin/staff").set(owner.auth).send({ contact: "boss2@example.com", name: "مراجع", roleId: created.id }).expect(201)).body;
    expect(s.permissions.sort()).toEqual(["audit.view", "finance.view"]);
    await api().patch(`/admin/roles/${created.id}`).set(owner.auth).send({ permissions: ["finance.view"] }).expect(200);
    expect((await api().get("/admin/staff").set(owner.auth)).body.find((x: any) => x.userId === s.userId).permissions).toEqual(["finance.view"]);
    await api().delete(`/admin/roles/${created.id}`).set(owner.auth).expect(400); // role_in_use
    await api().delete(`/admin/staff/${s.userId}`).set(owner.auth).expect(204);
    await api().delete(`/admin/roles/${created.id}`).set(owner.auth).expect(204);
    await api().delete(`/admin/roles/${await roleId("manager")}`).set(owner.auth).expect(400); // system
    await api().post("/admin/staff").set(owner.auth).send({ contact: "01099000010", roleId: await roleId("admin") }).expect(409); // already staff
  });

  it("تعطيل عضو بيقفل عليه اللوحة فورًا", async () => {
    const m = await addStaff("01099000040", "moderator");
    await api().get("/admin/users").set(m.auth).expect(200);
    await api().patch(`/admin/staff/${m.user.id}`).set(owner.auth).send({ active: false }).expect(200);
    await api().get("/admin/users").set(m.auth).expect(403);
    await api().patch(`/admin/staff/${m.user.id}`).set(owner.auth).send({ active: true }).expect(200);
    await api().get("/admin/users").set(m.auth).expect(200);
  });

  it("إيقاف مستخدم: التوكن يقف فورًا، الـ socket يتقفل، الدخول بالكود مرفوض، والتفعيل يرجّعه", async () => {
    const u = await env.login("01099000050", "مخالف");
    const sock = client(`http://localhost:${env.port}`, { auth: { token: u.token } });
    await new Promise<void>((r) => sock.on("connect", () => r()));
    const dropped = new Promise((r) => sock.on("disconnect", r));
    await api().get("/me").set(u.auth).expect(200);
    await api().patch(`/admin/users/${u.user.id}/status`).set(owner.auth).send({ status: "banned", reason: "spam" }).expect(200);
    await dropped;
    await api().get("/me").set(u.auth).expect(401); // الجلسات اتلغت فورًا
    await api().post("/auth/otp/request").send({ channel: "phone", target: "01099000050" }).expect(204);
    const code = env.sent.filter((x) => x.target === "01099000050").at(-1)!.code;
    expect((await api().post("/auth/otp/verify").send({ channel: "phone", target: "01099000050", code }).expect(403)).body.code).toBe("account_suspended");
    const list = (await api().get("/admin/users?status=banned").set(owner.auth).expect(200)).body;
    expect(list.map((x: any) => x.name)).toContain("مخالف");
    await api().patch(`/admin/users/${u.user.id}/status`).set(owner.auth).send({ status: "active" }).expect(200);
    await api().post("/auth/otp/request").send({ channel: "phone", target: "01099000050" }).expect(204);
    const code2 = env.sent.filter((x) => x.target === "01099000050").at(-1)!.code;
    await api().post("/auth/otp/verify").send({ channel: "phone", target: "01099000050", code: code2 }).expect(200);
    sock.close();
  });

  it("المالية: عرض، ملخص، استرداد مرة واحدة بيرجّع الرصيد، والعروض CRUD", async () => {
    const acc = await addStaff("01099000060", "accountant");
    const u = await env.login("01099000061", "عميل");
    await api().patch("/me").set(u.auth).send({ birthDate: "1990-05-20" }).expect(200); // المحفظة ١٨+
    await api().put("/wallet/pin").set(u.auth).send({ pin: "1234" }).expect(204);
    await api().post("/wallet/topup").set(u.auth).send({ amount: 500 }).expect(201);
    await api().put("/admin/offers/TEST20").set(acc.auth).send({ service: "elec", percent: 20, max: 30 }).expect(200);
    const pay = (await api().post("/wallet/pay").set(u.auth).send({ service: "elec", account: "123456", amount: 100, code: "TEST20", pin: "1234", idempotencyKey: "idem-admin-0001" }).expect(201)).body;
    expect(pay.balance).toBe(420); // 500 - (100-20)
    const list = (await api().get("/admin/finance/tx?q=عميل").set(acc.auth).expect(200)).body;
    const bill = list.find((t: any) => t.kind === "bill");
    expect(bill).toMatchObject({ amount: 80, discount: 20, paid: 80, gross: 100, status: "done", user: "عميل" });
    const sum = (await api().get("/admin/finance/summary").set(acc.auth).expect(200)).body;
    expect(sum.bills.count).toBeGreaterThanOrEqual(1);
    const rf = (await api().post(`/admin/finance/tx/${bill.id}/refund`).set(acc.auth).send({ reason: "طلب العميل" }).expect(201)).body;
    expect(rf.amount).toBe(80);
    expect((await api().get("/wallet").set(u.auth)).body.balance).toBe(500);
    expect((await api().post(`/admin/finance/tx/${bill.id}/refund`).set(acc.auth).expect(409)).body.code).toBe("already_refunded");
    const topup = list.find((t: any) => t.kind === "topup");
    await api().post(`/admin/finance/tx/${topup.id}/refund`).set(acc.auth).expect(400);
    // استرداد متزامن: واحد بس ينجح
    await api().post("/wallet/pay").set(u.auth).send({ service: "water", account: "99999", amount: 50, pin: "1234", idempotencyKey: "idem-admin-0002" }).expect(201);
    const b2 = (await api().get("/admin/finance/tx?q=عميل").set(acc.auth)).body.find((t: any) => t.kind === "bill" && t.status === "done");
    const rs = await Promise.all([1, 2, 3].map(() => api().post(`/admin/finance/tx/${b2.id}/refund`).set(acc.auth)));
    expect(rs.filter((x) => x.status === 201)).toHaveLength(1);
    expect((await api().get("/wallet").set(u.auth)).body.balance).toBe(500);
    // العروض
    expect((await api().get("/admin/offers").set(acc.auth)).body.map((o: any) => o.code)).toContain("TEST20");
    await api().put("/admin/offers/bad!").set(acc.auth).send({ percent: 10, max: 5 }).expect(400);
    await api().delete("/admin/offers/TEST20").set(acc.auth).expect(204);
  });

  it("سجل المراجعة بيسجّل كل إجراء، ومحتاج صلاحية audit.view", async () => {
    const log = (await api().get("/admin/audit?limit=100").set(owner.auth).expect(200)).body as { who: string; what: string; target: string }[];
    expect(log.length).toBeGreaterThan(8);
    expect(log.some((l) => l.what === "أوقف حساب" || l.what === "حظر حساب")).toBe(true);
    expect(log.some((l) => l.what === "استرد معاملة")).toBe(true);
    expect(log[0].who).toBeTruthy();
    const sup = await addStaff("01099000070", "support");
    await api().get("/admin/audit").set(sup.auth).expect(403);
  });

  it("الدخول المباشر من التطبيق: تذكرة لمرة واحدة بتتبدّل بجلسة، ومش موظف/مستخدمة/غلط = 401/403", async () => {
    const nobody = await env.login("01099000090", "عادي");
    await api().post("/admin/handoff").set(nobody.auth).expect(403);
    await api().post("/admin/handoff").expect(401);
    const { code } = (await api().post("/admin/handoff").set(owner.auth).expect(201)).body;
    const s = (await api().post("/auth/handoff/exchange").send({ code }).expect(200)).body;
    expect(s.accessToken && s.refreshToken).toBeTruthy();
    expect((await api().get("/admin/me").set("Authorization", `Bearer ${s.accessToken}`).expect(200)).body.isOwner).toBe(true);
    expect((await api().post("/auth/handoff/exchange").send({ code })).body.code).toBe("bad_handoff"); // مستخدمة
    expect((await api().post("/auth/handoff/exchange").send({ code: "x".repeat(40) })).status).toBe(401);
  });
});
