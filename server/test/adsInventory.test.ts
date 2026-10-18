import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { DEFAULT_PLACEMENTS, addDays, todayCairo } from "../src/lib/adsInventory.js";

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
    // من المصدر مش قايمة مكتوبة بالإيد — إضافة موضع جديد مايكسرش الاختبار،
    // وفي نفس الوقت الترتيب والعدد لسه متفحوصين
    expect(ps.map((p: { key: string }) => p.key)).toEqual(DEFAULT_PLACEMENTS.map((p) => p.key));
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

  it("الأقل من ١٨: الكتالوج واحد للكل، ومفيش نقر/إغلاق مربوط بهويته، والظهور لتحديد التكرار بس", async () => {
    const big = await env.login("01099000050", "بالغ");
    const kid = await env.login("01099000051", "قاصر");
    await api().patch("/me").set(big.auth).send({ birthDate: "1990-05-20" }).expect(200);
    await api().patch("/me").set(kid.auth).send({ birthDate: `${new Date().getUTCFullYear() - 12}-01-01` }).expect(200);
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "سلوك", placements: ["banner", "modal"], start: T, end: d(1), approve: true })).expect(201)).body;

    // ١) مفيش استهداف: نفس الكتالوج بالحرف للبالغ والقاصر (ومن غير تاريخ ميلاد كمان)
    const none = await env.login("01099000052", "بدون تاريخ");
    const cat = async (a: { auth: Record<string, string> }) => JSON.stringify((await api().get("/ads/catalog").set(a.auth).expect(200)).body);
    expect(await cat(kid)).toBe(await cat(big));
    expect(await cat(none)).toBe(await cat(big));

    // ٢) نقر وإغلاق القاصر: الإحصاء المجمّع بيتعدّ، ومفيش سجل باسمه
    const ev = (a: { auth: Record<string, string> }, body: Record<string, unknown>) => api().post("/ads/events").set(a.auth).send({ day: T, adId: c.id, ...body }).expect(204);
    await ev(kid, { kind: "clicked", placement: "banner" });
    await ev(kid, { kind: "closed", placement: "banner" });
    expect(await env.ctx.db.adEvent.count({ where: { userId: kid.user.id } })).toBe(0);
    // اللي اتخزن مُعرَّف مستعار ليوم واحد (لمنع العدّ المكرر)، مش هوية المستخدم
    const anon = await env.ctx.db.adEvent.findMany({ where: { userId: { startsWith: "anon:" }, adKey: { contains: c.id } }, select: { userId: true, kind: true } });
    expect(anon.map((x) => x.kind).sort()).toEqual(["clicked", "closed"]);
    expect(anon.every((x) => !x.userId.includes(kid.user.id))).toBe(true);
    // تكرار النقر ما بيعدّش تاني (أرقام المعلن تفضل صح)
    await ev(kid, { kind: "clicked", placement: "banner" });
    expect(await env.ctx.db.adEvent.count({ where: { userId: { startsWith: "anon:" }, adKey: { contains: c.id }, kind: "clicked" } })).toBe(1);
    const st1 = (await api().get(`/admin/ads/campaigns/${c.id}/stats`).set(owner.auth).expect(200)).body as { placement: string; clicked: number; closed: number }[];
    expect(st1.find((s) => s.placement === "banner")).toMatchObject({ clicked: 1, closed: 1 });

    // ٣) الظهور بيتخزن للقاصر (تحديد التكرار شغّال وموحّد بين أجهزته)
    await ev(kid, { kind: "shown", slot: 4, placement: "modal" });
    expect((await api().get(`/ads/today?day=${T}`).set(kid.auth).expect(200)).body.shown).toEqual([4]);
    expect(await env.ctx.db.adEvent.count({ where: { userId: kid.user.id, kind: "shown" } })).toBe(1);

    // ٤) سجل قديم للقاصر بيتمسح مع أول حدث جديد (مابيتراكمش)
    await env.ctx.db.adEvent.create({ data: { userId: kid.user.id, adKey: "old|slot:1", kind: "shown", createdAt: new Date(Date.now() - 5 * 86400_000) } });
    await ev(kid, { kind: "shown", slot: 5, placement: "modal" });
    const keys = (await env.ctx.db.adEvent.findMany({ where: { userId: kid.user.id }, select: { adKey: true } })).map((x) => x.adKey);
    expect(keys).not.toContain("old|slot:1");
    expect(keys).toHaveLength(2); // slot:4 و slot:5 بس

    // ٥) البالغ زي ما هو: النقر بيتسجّل باسمه
    await ev(big, { kind: "clicked", placement: "banner" });
    expect(await env.ctx.db.adEvent.count({ where: { userId: big.user.id, kind: "clicked" } })).toBe(1);
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

/**
 * **صورة الإعلان من رفعنا بس — متفحوصة على المسار نفسه مش على الدالة لوحدها.**
 *
 * الدالة `isOwnUpload` متفحوصة في `adImage.test.ts`، إنما اللي يهمّ هنا إنها
 * **مربوطة فعلًا** في مخطط التحقق: لو الربط اتشال، الدالة تفضل ناجحة
 * واللوحة تقبل رابطًا خارجيًا **في سكوت** — والمعلن يبدّل صورته بعد الموافقة.
 */
describe("صورة الإعلان على مسار اللوحة", () => {
  it("بيقبل صورة مرفوعة عندنا وبترجع في رد اللوحة وفي كتالوج التطبيق", async () => {
    const img = "/uploads/aabbccddeeff0011.png";
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["services"], start: T, end: d(1), imageUrl: img, approve: true })).expect(201)).body;
    expect(a.imageUrl).toBe(img);

    const cat = (await api().get("/ads/catalog").set(owner.auth).expect(200)).body;
    const mine = cat.find((c: { id: string }) => c.id === a.id);
    expect(mine?.imageUrl, "الصورة مش بتوصل للتطبيق").toBe(img);
  });

  it("🔴 بيرفض الرابط الخارجي (٤٠٠) — وإلا المراجعة بلا معنى", async () => {
    const r = await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["services"], start: d(44), end: d(45), imageUrl: "https://evil.com/uploads/x1y2z3a4b5c6.png" }));
    expect(r.status, "اتقبل رابط خارجي").toBe(400);
  });

  it("الإعلان بلا صورة لسه شغّال (نصّ + تدرّج زي ما كان)", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["services"], start: d(48), end: d(49) })).expect(201)).body;
    expect(a.imageUrl).toBeNull();
  });

  it("التعديل بيقدر يشيل الصورة (null)", async () => {
    const img = "/uploads/ffeeddccbbaa9988.jpg";
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["services"], start: d(52), end: d(53), imageUrl: img })).expect(201)).body;
    expect(a.imageUrl).toBe(img);
    const b = (await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth).send({ imageUrl: null }).expect(200)).body;
    expect(b.imageUrl, "الصورة ما اتشالتش").toBeNull();
  });
});

/**
 * **صورة لكل موضع — كل موضع مقاسه مختلف.**
 *
 * البانر ١٢٠٠×٣٠٠ والنافذة ١٠٨٠×١٩٢٠: صورة واحدة للحملة بتتعرض
 * `object-fit: cover` فبتتقصّ في الموضع اللي نسبته مختلفة — واللوجو أو
 * السعر في الطرف يضيع. فالصورة بقت على **الحجز** (حملة × موضع).
 *
 * والفحص الحاسم على **إن كل موضع بياخد صورته هو** في كتالوج التطبيق — مش
 * على إن الحقل اتخزن: الخلط بين الصورتين بيعرض الإعلان الغلط لكل المستخدمين.
 */
describe("صورة لكل موضع", () => {
  const WIDE = "/uploads/1111aaaa2222bbbb.png";   // ١٢٠٠×٣٠٠
  const TALL = "/uploads/3333cccc4444dddd.png";   // ١٠٨٠×١٩٢٠

  it("🔴 كل موضع بياخد صورته هو في اللوحة وفي الكتالوج", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner", "modal"], start: T, end: d(1), approve: true,
      images: { banner: WIDE, modal: TALL },
    })).expect(201)).body;
    expect(a.images).toEqual({ banner: WIDE, modal: TALL });

    const mine = ((await api().get("/ads/catalog").set(owner.auth).expect(200)).body as { id: string; images: Record<string, string> }[])
      .find((c) => c.id === a.id);
    expect(mine?.images, "الصور مش بتوصل للتطبيق بمفاتيح المواضع").toEqual({ banner: WIDE, modal: TALL });
  });

  it("الموضع اللي مالوش صورة بياخد صورة الحملة (الحملات القديمة)", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner", "modal"], start: d(60), end: d(61), imageUrl: WIDE, images: { modal: TALL },
    })).expect(201)).body;
    expect(a.imageUrl).toBe(WIDE);
    expect(a.images).toEqual({ modal: TALL });
  });

  it("🔴 الرابط الخارجي في صورة موضع بيترفض زي صورة الحملة", async () => {
    const r = await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner"], start: d(64), end: d(65), images: { banner: "https://evil.com/uploads/aaaabbbbccccdddd.png" },
    }));
    expect(r.status, "اتقبل رابط خارجي في صورة موضع").toBe(400);
  });

  it("التعديل بيبدّل صورة موضع ويشيل التانية", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner", "modal"], start: d(68), end: d(69), images: { banner: WIDE, modal: TALL },
    })).expect(201)).body;
    const b = (await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth)
      .send({ images: { banner: TALL, modal: null } }).expect(200)).body;
    expect(b.images).toEqual({ banner: TALL });
  });

  it("صورة لموضع مش في الحملة بترفض", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner"], start: d(72), end: d(73),
    })).expect(201)).body;
    const r = await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth).send({ images: { modal: TALL } });
    expect(r.status).toBe(400);
  });
});

/**
 * 🔴 **كل موضع مباع لازم يكون معروضًا في التطبيق فعلًا.**
 *
 * `story` كان مباعًا بـ٢٥٠ ج/يوم في اللوحة و**مفيش في التطبيق كله سطر بيعرضه**
 * (`adsFor("story")` مكانش بيتنادى من أي مكان) — يعني المعلن يدفع على مكان
 * عمره ما ظهر، والإحصاءات تفضل صفرًا بلا أي خطأ. اتكشف ١٨ أكتوبر ٢٠٢٦.
 *
 * الحارس بيقرا **كود الواجهة** ويتأكد إن كل مفتاح موضع في المخزون له عارض —
 * فأي موضع جديد يتباع من غير مكان يعرضه بيفشّل الاختبار.
 */
describe("مفيش موضع مباع بلا عارض في التطبيق", () => {
  it("🔴 كل مفتاح موضع في المخزون متنادى من كود الواجهة", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../..");
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
    const code = walk(path.join(root, "src")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    expect(code.length, "مالقاش كود الواجهة").toBeGreaterThan(10000);

    const missing = DEFAULT_PLACEMENTS
      .map((p) => p.key)
      .filter((k) => !new RegExp(`placement=["'{]?["']?${k}\\b|useCatalog\\(["']${k}["']\\)|adsFor\\(["']${k}["']\\)`).test(code));
    expect(missing, `مواضع مباعة ومفيش في التطبيق حاجة بتعرضها: ${missing.join(" · ")}`).toEqual([]);
  });
});

/**
 * 🔴 **كل موضع لازم يقبل تسجيل الظهور والنقر.**
 *
 * `/ads/events` بيتحقق من `placement` بقايمة مسموحة. ولو موضع جديد اتضاف
 * للمخزون وما اتضافش للقايمة، كل ظهور ونقرة عليه بترجع **٤٠٠** —
 * و`trackBanner` في الواجهة بيبلع الخطأ (`.catch(() => {})`) — فالمعلن
 * يدفع، والإعلان يظهر فعلًا، و**الإحصاءات تفضل صفرًا بلا أي أثر**.
 */
describe("تتبّع الظهور شغّال لكل موضع", () => {
  it("🔴 كل مفتاح موضع مقبول في /ads/events", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["banner"], start: d(200), end: d(201), approve: true })).expect(201)).body;
    const day = T;
    for (const key of DEFAULT_PLACEMENTS.map((p) => p.key)) {
      const r = await api().post("/ads/events").set(owner.auth)
        .send({ day, adId: a.id, kind: "shown", placement: key });
      expect(r.status, `الموضع ${key} مرفوض في تسجيل الأحداث`).toBe(204);
    }
  });
});
