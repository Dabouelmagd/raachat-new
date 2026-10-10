import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
let owner: Awaited<ReturnType<typeof env.login>>;
beforeAll(async () => { env = await startTestEnv(); owner = await env.login("01099000001", "داليا"); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);
const staff = async (phone: string, key: string) => {
  const roles = (await api().get("/admin/roles").set(owner.auth)).body as { id: string; key: string }[];
  await api().post("/admin/staff").set(owner.auth).send({ contact: phone, roleId: roles.find((r) => r.key === key)!.id }).expect(201);
  return env.login(phone);
};

describe("لوحة الإدارة — المرحلة التانية", () => {
  it("الصفحة الرئيسية: أرقام حقيقية والأقسام حسب الصلاحية", async () => {
    const a = await env.login("01096000001", "أ"), b = await env.login("01096000002", "ب");
    const th = (await api().post("/threads").set(a.auth).send({ type: "group", name: "ج", memberIds: [b.user.id] }).expect(201)).body;
    await api().post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "أهلًا" }).expect(201);
    await api().post("/rooms").set(a.auth).send({ name: "غرفة" }).expect(201);
    const o = (await api().get("/admin/overview").set(owner.auth).expect(200)).body;
    expect(o.totalUsers).toBeGreaterThanOrEqual(3);
    expect(o.activeToday).toBeGreaterThanOrEqual(1); // lastSeenAt بيتحدّث
    expect(o.messagesToday).toBeGreaterThanOrEqual(1);
    expect(o.liveRooms).toBeGreaterThanOrEqual(1);
    expect(o.signups.length).toBeGreaterThan(0);
    for (const k of ["billsVolume30", "adRevenue30", "pendingAds", "openReports"]) expect(o).toHaveProperty(k);
    const acc = await staff("01096000090", "accountant");
    const oa = (await api().get("/admin/overview").set(acc.auth).expect(200)).body;
    expect(oa).toHaveProperty("billsVolume30"); expect(oa).not.toHaveProperty("openReports"); expect(oa).not.toHaveProperty("messagesToday");
    await api().get("/admin/overview").set(a.auth).expect(403);
  });

  it("تقييد جروب يمنع الإرسال، رفع التقييد يرجّعه، والحذف يمسح الجروب. الغرف تتقفل", async () => {
    const a = await env.login("01096000011", "منشئ"), b = await env.login("01096000012", "عضو");
    const th = (await api().post("/threads").set(a.auth).send({ type: "group", name: "جروب للتقييد", memberIds: [b.user.id] }).expect(201)).body;
    const mod = await staff("01096000091", "moderator");
    const sup = await staff("01096000092", "support");
    const list = (await api().get("/admin/spaces/groups").set(sup.auth).expect(200)).body;
    expect(list.find((x: any) => x.id === th.id)).toMatchObject({ name: "جروب للتقييد", owner: "منشئ", members: 2, status: "active" });
    await api().patch(`/admin/spaces/groups/${th.id}`).set(sup.auth).send({ restricted: true }).expect(403);
    await api().patch(`/admin/spaces/groups/${th.id}`).set(mod.auth).send({ restricted: true }).expect(200);
    await api().post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "x" }).expect(403);
    await api().patch(`/admin/spaces/groups/${th.id}`).set(mod.auth).send({ restricted: false }).expect(200);
    await api().post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "x" }).expect(201);
    await api().delete(`/admin/spaces/groups/${th.id}`).set(mod.auth).expect(204);
    await api().get(`/threads/${th.id}`).set(a.auth).expect(404);
    await api().delete(`/admin/spaces/groups/${th.id}`).set(mod.auth).expect(404);

    const room = (await api().post("/rooms").set(a.auth).send({ name: "للإغلاق" }).expect(201)).body;
    const rooms = (await api().get("/admin/spaces/rooms").set(mod.auth).expect(200)).body;
    expect(rooms.find((x: any) => x.id === room.id)).toMatchObject({ host: "منشئ", status: "live" });
    await api().post(`/admin/spaces/rooms/${room.id}/close`).set(mod.auth).expect(204);
    expect((await api().get("/rooms").set(a.auth)).body.find((x: any) => x.id === room.id)).toBeUndefined();
    expect((await api().get("/admin/spaces/rooms").set(mod.auth)).body.find((x: any) => x.id === room.id).status).toBe("ended");
    await api().post(`/admin/spaces/rooms/${room.id}/close`).set(mod.auth).expect(404);
  });

  it("إشعار جماعي: الجمهور المختار بس يوصله، حد دقيقة، وبيتسجل", async () => {
    const hot = await env.login("01096000021", "نشط"), cold = await env.login("01096000022", "خامل");
    await api().post("/push/subscribe").set(hot.auth).send({ endpoint: "https://push.example/hot", keys: { p256dh: "p", auth: "a" } }).expect(204);
    await api().post("/push/subscribe").set(cold.auth).send({ endpoint: "https://push.example/cold", keys: { p256dh: "p", auth: "a" } }).expect(204);
    await env.ctx.db.user.update({ where: { id: cold.user.id }, data: { lastSeenAt: new Date(Date.now() - 40 * 86400_000) } });
    await env.ctx.db.user.update({ where: { id: hot.user.id }, data: { lastSeenAt: new Date() } });
    const nobody = await env.login("01096000023", "عادي");
    await api().post("/admin/notifications").set(nobody.auth).send({ title: "x", audience: "all" }).expect(403);
    const sup = await staff("01096000093", "support");
    await api().post("/admin/notifications").set(sup.auth).send({ title: "مرحبا", audience: "all" }).expect(403);
    await api().post("/admin/notifications").set(owner.auth).send({ title: "x", audience: "كل" }).expect(400);
    env.pushed.length = 0;
    const r = await api().post("/admin/notifications").set(owner.auth).send({ title: "عرض جديد", body: "خصم على الفواتير", audience: "inactive30" }).expect(201);
    expect(r.body.reach).toBeGreaterThanOrEqual(1);
    const eps = env.pushed.map((p) => p.sub.endpoint);
    expect(eps).toContain("https://push.example/cold"); expect(eps).not.toContain("https://push.example/hot");
    expect(env.pushed.find((p) => p.sub.endpoint.endsWith("cold"))!.payload).toMatchObject({ kind: "notice", title: "عرض جديد" });
    await api().post("/admin/notifications").set(owner.auth).send({ title: "تاني", audience: "all" }).expect(429);
    const h = (await api().get("/admin/notifications").set(owner.auth).expect(200)).body;
    expect(h.history[0]).toMatchObject({ title: "عرض جديد", audience: "inactive30", by: "داليا" });
  });

  it("الإعدادات: قفل التسجيل ووضع الصيانة (الفريق يكمّل والباقي 503)", async () => {
    const user = await env.login("01096000031", "مستخدم");
    const mod = await staff("01096000094", "moderator");
    await api().get("/admin/settings").set(mod.auth).expect(403);
    expect((await api().get("/admin/settings").set(owner.auth).expect(200)).body).toMatchObject({ maintenance: false, registrationOpen: true });
    // قفل التسجيل: الجديد يترفض والموجود يدخل
    await api().put("/admin/settings").set(owner.auth).send({ registrationOpen: false }).expect(200);
    expect((await api().get("/public/settings").expect(200)).body.registrationOpen).toBe(false);
    await api().post("/auth/otp/request").send({ channel: "phone", target: "01096000099" }).expect(204);
    const code = env.sent.filter((x) => x.target === "01096000099").at(-1)!.code;
    expect((await api().post("/auth/otp/verify").send({ channel: "phone", target: "01096000099", code }).expect(403)).body.code).toBe("registration_closed");
    await env.login("01096000031"); // موجود
    await api().put("/admin/settings").set(owner.auth).send({ registrationOpen: true }).expect(200);
    // الصيانة
    await api().put("/admin/settings").set(owner.auth).send({ maintenance: true, maintenanceMessage: "صيانة لمدة ساعة" }).expect(200);
    const r = await api().get("/threads").set(user.auth).expect(503);
    expect(r.body).toMatchObject({ code: "maintenance", message: "صيانة لمدة ساعة" });
    await api().get("/threads").expect(503);
    await api().get("/threads").set(mod.auth).expect(200); // موظف
    await api().get("/admin/me").set(owner.auth).expect(200);
    expect((await api().get("/public/settings").expect(200)).body).toMatchObject({ maintenance: true, message: "صيانة لمدة ساعة" });
    await api().put("/admin/settings").set(owner.auth).send({ maintenance: false }).expect(200);
    await api().get("/threads").set(user.auth).expect(200);
    expect((await api().get("/admin/audit").set(owner.auth)).body.some((x: any) => x.what === "عدّل إعدادات التطبيق")).toBe(true);
  });
});
