import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { addDays, todayCairo } from "../src/lib/adsInventory.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
let owner: Awaited<ReturnType<typeof env.login>>;
beforeAll(async () => { env = await startTestEnv(); owner = await env.login("01099000001", "داليا"); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);
const T = todayCairo();
const d = (n: number) => addDays(T, n);
const camp = (o: Record<string, unknown> = {}) => ({ advertiser: "كافيه النيل", headline: "قهوتك علينا", link: "https://example.com/a", start: d(1), end: d(3), placements: ["banner"], ...o });

describe("خريطة الإعلانات", () => {
  it("المواضع الافتراضية بمقاساتها وأسعارها، والتسعير = سعر اليوم × الأيام × المواضع", async () => {
    const ps = (await api().get("/admin/ads/placements").set(owner.auth).expect(200)).body;
    expect(ps.map((p: { key: string }) => p.key)).toEqual(["modal", "banner", "services", "story"]);
    expect(ps[1]).toMatchObject({ width: 1200, height: 300, slots: 3, pricePerDay: 150 });
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner", "services"], start: d(1), end: d(3) }).expect(200)).body;
    expect(q.days).toBe(3); expect(q.total).toBe((150 + 120) * 3); expect(q.ok).toBe(true);
  });

  it("الحجز بيستهلك السعة، وبعد ما تمتلي الأيام دي بتبقى غير متاحة (409) والباقي متاح", async () => {
    await api().put("/admin/ads/placements/story").set(owner.auth).send({ name: "ستوري", kind: "story", width: 1080, height: 1920, slots: 1, pricePerDay: 400, active: true }).expect(200);
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["story"], start: d(5), end: d(7) })).expect(201)).body;
    expect(a.status).toBe("pending"); expect(a.total).toBe(1200);
    const r = await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "تاني", placements: ["story"], start: d(7), end: d(9) }));
    expect(r.status).toBe(409); expect(r.body.code).toBe("ad_unavailable");
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "تاني", placements: ["story"], start: d(8), end: d(9) })).expect(201);
    const inv = (await api().get(`/admin/ads/inventory?from=${d(4)}&days=6`).set(owner.auth).expect(200)).body;
    const st = inv.placements.find((p: { key: string }) => p.key === "story");
    expect(st.cells.map((c: { free: number }) => c.free)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(st.cells[1].held).toBe(1);
  });

  it("رفض/إلغاء بيحرر المكان، والموافقة بتحوّل الحجز المؤقت لمؤكد، والتعديل بيعيد التسعير", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["modal"], start: d(20), end: d(21) })).expect(201)).body;
    expect((await api().post(`/admin/ads/campaigns/${a.id}/approve`).set(owner.auth).expect(200)).body.status).toBe("approved");
    await api().post(`/admin/ads/campaigns/${a.id}/approve`).set(owner.auth).expect(400);
    const up = (await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth).send({ end: d(23), placements: ["modal", "services"] }).expect(200)).body;
    expect(up.total).toBe((400 + 120) * 4);
    let inv = (await api().get(`/admin/ads/inventory?from=${d(20)}&days=1`).set(owner.auth)).body;
    expect(inv.placements.find((p: { key: string }) => p.key === "modal").cells[0]).toMatchObject({ booked: 1, held: 0 });
    await api().post(`/admin/ads/campaigns/${a.id}/pause`).set(owner.auth).expect(200);
    await api().post(`/admin/ads/campaigns/${a.id}/cancel`).set(owner.auth).expect(200);
    inv = (await api().get(`/admin/ads/inventory?from=${d(20)}&days=1`).set(owner.auth)).body;
    expect(inv.placements.find((p: { key: string }) => p.key === "modal").cells[0]).toMatchObject({ booked: 0, free: 4 });
    await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth).send({ headline: "x y" }).expect(400);
  });

  it("قفل موضع لفترة بيخليه غير متاح، وممنوع قفل فترة فيها حجز، وفتحه بيرجّعه", async () => {
    const blk = (await api().post("/admin/ads/blocks").set(owner.auth).send({ placement: "services", from: d(30), to: d(32), reason: "صيانة" }).expect(201)).body;
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["services"], start: d(31), end: d(33) }).expect(200)).body;
    expect(q.ok).toBe(false); expect(q.conflicts[0]).toMatchObject({ key: "services", day: d(31), reason: "blocked" });
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["services"], start: d(32), end: d(33) })).expect(409);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], start: d(40), end: d(41) })).expect(201);
    await api().post("/admin/ads/blocks").set(owner.auth).send({ placement: "banner", from: d(41), to: d(42), reason: "حدث" }).expect(409);
    await api().delete(`/admin/ads/blocks/${blk.id}`).set(owner.auth).expect(204);
    expect((await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["services"], start: d(31), end: d(33) })).body.ok).toBe(true);
  });

  it("حجزين متزامنين على آخر مكان: واحد بس ينجح", async () => {
    await api().put("/admin/ads/placements/story").set(owner.auth).send({ name: "ستوري", kind: "story", width: 1080, height: 1920, slots: 1, pricePerDay: 400, active: true }).expect(200);
    const rs = await Promise.all([0, 1, 2].map((i) => api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "م" + i, placements: ["story"], start: d(60), end: d(61) }))));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it("تقليل سعة موضع تحت الحجوزات القائمة ممنوع", async () => {
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], start: d(50), end: d(51) })).expect(201);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], start: d(50), end: d(51) })).expect(201);
    const r = await api().put("/admin/ads/placements/banner").set(owner.auth).send({ name: "بانر", kind: "banner", width: 1200, height: 300, slots: 1, pricePerDay: 150, active: true });
    expect(r.status).toBe(409); expect(r.body.code).toBe("slots_in_use");
  });

  it("التحقق: تاريخ فات / نهاية قبل بداية / رابط مش https / موضع مجهول", async () => {
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ start: d(-2), end: d(1) })).expect(400);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ start: d(5), end: d(4) })).expect(400);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ link: "http://x.com" })).expect(400);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["nope"] })).expect(400);
  });

  it("الصلاحيات: الدعم الفني ما يشوفش الإعلانات، المدير يدير، والمحاسب/المشرف 403", async () => {
    const roles = (await api().get("/admin/roles").set(owner.auth)).body as { id: string; key: string }[];
    const mk = async (phone: string, key: string) => {
      await api().post("/admin/staff").set(owner.auth).send({ contact: phone, roleId: roles.find((r) => r.key === key)!.id }).expect(201);
      return env.login(phone);
    };
    const mgr = await mk("01099000020", "manager"), acc = await mk("01099000021", "accountant");
    await api().get("/admin/ads/inventory").set(acc.auth).expect(403);
    await api().post("/admin/ads/campaigns").set(acc.auth).send(camp({ start: d(70), end: d(71) })).expect(403);
    await api().get("/admin/ads/inventory").set(mgr.auth).expect(200);
    await api().post("/admin/ads/campaigns").set(mgr.auth).send(camp({ placements: ["services"], start: d(70), end: d(71), approve: true })).expect(201);
    const log = (await api().get("/admin/audit").set(owner.auth)).body as { what: string }[];
    expect(log.some((l) => l.what === "أنشأ واعتمد حملة")).toBe(true);
  });

  it("/ads/catalog بيرجّع الشغّال النهارده بس (معتمد وفي فترته)", async () => {
    const user = await env.login("01099000030", "مستخدم");
    const run = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "شغال", placements: ["modal", "services"], start: T, end: d(2), approve: true })).expect(201)).body;
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "مستني", placements: ["modal"], start: T, end: d(2) })).expect(201);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "بكرة", placements: ["modal"], start: d(3), end: d(4), approve: true })).expect(201);
    await api().get("/ads/catalog").expect(401);
    let c = (await api().get("/ads/catalog").set(user.auth).expect(200)).body as { id: string; advertiser: string; placements: string[] }[];
    expect(c.filter((x) => ["شغال", "مستني", "بكرة"].includes(x.advertiser)).map((x) => x.advertiser)).toEqual(["شغال"]);
    expect(c.find((x) => x.id === run.id)!.placements.sort()).toEqual(["modal", "services"]);
    await api().post(`/admin/ads/campaigns/${run.id}/pause`).set(owner.auth).expect(200);
    c = (await api().get("/ads/catalog").set(user.auth)).body;
    expect(c.find((x) => x.id === run.id)).toBeUndefined();
  });

  it("إحصائيات الحملة: ظهور فريد/نقرات بتتجمّع للحملة الحقيقية، والمكرر ما بيتعدّش", async () => {
    const user = await env.login("01099000040", "قارئ");
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "إحصاء", placements: ["banner"], start: T, end: d(1), approve: true })).expect(201)).body;
    const ev = (body: Record<string, unknown>) => api().post("/ads/events").set(user.auth).send({ day: T, adId: c.id, ...body }).expect(204);
    await ev({ kind: "shown", placement: "banner" }); await ev({ kind: "shown", placement: "banner" });
    await ev({ kind: "shown", slot: 2, placement: "modal" }); await ev({ kind: "clicked", placement: "modal" }); await ev({ kind: "clicked", placement: "modal" });
    await api().post("/ads/events").set(user.auth).send({ day: T, adId: "demo-ad", kind: "shown", slot: 3 }).expect(204); // إعلان تجريبي: ما يتجمّعش
    const list = (await api().get("/admin/ads/campaigns?q=إحصاء").set(owner.auth).expect(200)).body as { id: string; shown: number; clicked: number }[];
    expect(list.find((x) => x.id === c.id)).toMatchObject({ shown: 2, clicked: 1 });
    const st = (await api().get(`/admin/ads/campaigns/${c.id}/stats`).set(owner.auth).expect(200)).body as { placement: string; shown: number }[];
    expect(st.map((s) => `${s.placement}:${s.shown}`).sort()).toEqual(["banner:1", "modal:1"]);
  });

  it("أكواد الهدية: توليد بمدة، خصم بحد المدة، استخدام مرة واحدة، رجوعها عند الرفض، وإلغاء غير المستخدم", async () => {
    const gs = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 1, count: 2, recipient: "كافيه النيل" }).expect(201)).body as { id: string; code: string; days: number; status: string }[];
    expect(gs).toHaveLength(2); expect(gs[0].days).toBe(30); expect(gs[0].code).toMatch(/^RA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 2 }).expect(400);
    // حملة ٤٥ يوم على بانر (١٥٠/يوم): الهدية بتغطي ٣٠ يوم = ٤٥٠٠ والباقي ١٥ يوم = ٢٢٥٠
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(100), end: d(144), giftCode: gs[0].code.toLowerCase() }).expect(200)).body;
    expect(q).toMatchObject({ gross: 6750, discount: 4500, total: 2250, giftDays: 30, giftError: null });
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], start: d(100), end: d(144), giftCode: gs[0].code })).expect(201)).body;
    expect(c).toMatchObject({ total: 2250, discount: 4500, gross: 6750, giftCode: gs[0].code });
    const used = (await api().get("/admin/ads/gifts").set(owner.auth)).body as { code: string; status: string; usedBy: string }[];
    expect(used.find((g) => g.code === gs[0].code)).toMatchObject({ status: "used", usedBy: "كافيه النيل" });
    expect((await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["services"], start: d(100), end: d(101), giftCode: gs[0].code }))).body.code).toBe("gift_used");
    await api().delete(`/admin/ads/gifts/${used.find((g) => g.code === gs[0].code) ? (await api().get("/admin/ads/gifts").set(owner.auth)).body.find((g: { code: string }) => g.code === gs[0].code).id : ""}`).set(owner.auth).expect(409);
    await api().post(`/admin/ads/campaigns/${c.id}/reject`).set(owner.auth).expect(200);
    const back = (await api().get("/admin/ads/gifts").set(owner.auth)).body as { code: string; status: string }[];
    expect(back.find((g) => g.code === gs[0].code)!.status).toBe("available");
    await api().delete(`/admin/ads/gifts/${gs[1].id}`).set(owner.auth).expect(204);
    expect((await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(100), end: d(101), giftCode: gs[1].code })).body.giftError).toMatch(/غير صحيح/);
  });

  it("هدية مقيّدة بموضع بتخصم الموضع ده بس، ومرفوضة لموضع تاني", async () => {
    const [g] = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 3, placements: ["banner"], expiresAt: d(200) }).expect(201)).body as { code: string }[];
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner", "services"], start: d(120), end: d(122), giftCode: g.code })).body;
    expect(q).toMatchObject({ gross: 810, discount: 450, total: 360 });
    const q2 = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["services"], start: d(120), end: d(122), giftCode: g.code })).body;
    expect(q2.giftError).toMatch(/مش بيشمل/);
  });

  it("المواضع بتعرض سعر الألف ظهور الفعلي مقابل متوسط السوق", async () => {
    const ps = (await api().get("/admin/ads/placements").set(owner.auth)).body as { key: string; effectiveCpm: number; marketCpm: number }[];
    expect(ps.find((p) => p.key === "banner")).toMatchObject({ effectiveCpm: 150, marketCpm: 150 });
  });
});
