import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { DEFAULT_PLACEMENTS, addDays, todayCairo } from "../src/lib/adsInventory.js";
// @ts-expect-error دالة خالصة بـ JS عادي — مفيش types ولا تبعيات (نفس `uploadUrl.test.ts`)
import { clearDraft, draftHasWork, draftKey, loadDraft, saveDraft } from "../../admin/src/draft.js";

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

/**
 * 🔴 **المدد الجاهزة لازم تطابق أيام أكواد الهدايا.**
 *
 * داليا طلبت (١٨ أكتوبر ٢٠٢٦) اختيار «شهر · ٣ شهور · ٦ شهور · سنة» وقت إنشاء
 * الحملة، وأكواد الهدايا عندها نفس المدد. والفترة بتتحسب **شاملة الطرفين**،
 * فلو «سنة» في النموذج ٣٦٦ يوم وهدية السنة ٣٦٥، كل حملة سنة بهدية بتسيب
 * **يومًا بفلوس** والمعلن مايفهمش منين — وده حصل فعلًا (٩٢٠ ج.م في عرض سعر).
 *
 * الحارس بيقرا الرقمين من الملفين ويقارنهم، فأي تعديل في واحد لوحده بيسقط.
 */
describe("المدد الجاهزة = أيام أكواد الهدايا", () => {
  it("🔴 أيام «شهر/٣/٦/سنة» في اللوحة نفس GIFT_MONTHS على السيرفر", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../..");
    const src = fs.readFileSync(path.join(root, "admin/src/liveAds.jsx"), "utf8");

    const line = /const DURATIONS = (\[.*?\]);/s.exec(src);
    expect(line, "مالقاش DURATIONS في liveAds.jsx").toBeTruthy();
    const days = [...line![1].matchAll(/\[\s*(\d+)\s*,/g)].map((m) => +m[1]);
    expect(days.length, "المدد الجاهزة مش موجودة").toBe(4);

    const { GIFT_MONTHS } = await import("../src/lib/adsInventory.js");
    expect(days, "المدد الجاهزة اتفرقت عن أيام الهدايا — كل حملة بهدية هتسيب أيامًا بفلوس")
      .toEqual([1, 3, 6, 12].map((m) => GIFT_MONTHS[m]));
  });
});

/**
 * **خريطة الأماكن المتاحة في اللوحة** (بطلب داليا: «خريطة لكل الاعلانات
 * المتاحة علي الابلكشن وتكون واضحة»).
 *
 * الخريطة بتقول للمعلن **المكان فين في التطبيق** من حقل `note`، فموضع بلا
 * `note` بيطلع في الخريطة باسمه ومقاسه بس — ومحدش يعرف هو بيظهر فين.
 * والخريطة بتتبني من `data.placements` اللي جايّة من السيرفر، فأي قايمة
 * مكتوبة بالإيد في اللوحة كانت هتفضل ناقصة موضعًا في سكوت.
 */
describe("خريطة الأماكن المتاحة", () => {
  it("كل موضع في المخزون له وصف مكانه في التطبيق", () => {
    const bare = DEFAULT_PLACEMENTS.filter((p) => !p.note || !p.note.trim());
    expect(bare.map((p) => p.key), "مواضع بلا وصف مكان — الخريطة مش هتقول هي فين").toEqual([]);
  });

  it("🔴 الخريطة بتتبني من مواضع السيرفر مش من قايمة مكتوبة بالإيد", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../..");
    const src = fs.readFileSync(path.join(root, "admin/src/liveAds.jsx"), "utf8");

    expect(src, "الخريطة مش معروضة في تبويب المواضع").toContain("<PlacementMap placements={data.placements} />");
    const map = /function PlacementMap[\s\S]*?\n}\n/.exec(src);
    expect(map, "مالقاش PlacementMap").toBeTruthy();
    const hard = DEFAULT_PLACEMENTS.map((p) => p.key).filter((k) => map![0].includes(`"${k}"`));
    expect(hard, "مفاتيح مواضع مكتوبة بالإيد جوه الخريطة").toEqual([]);
  });
});

/**
 * **الخصم اليدوي (العرض)** — بطلب داليا ١٨ أكتوبر ٢٠٢٦: «يُكتب حسب كل حملة
 * وكل عميل، وممكن إضافة اختيارات للخصم».
 *
 * الترتيب هو اللي بيفرّق: النسبة بتتحسب على **المتبقي بعد كود الهدية**.
 * لو اتحسبت على الإجمالي، حملة الهدية بتغطيها بالكامل كان ممكن يطلع فيها
 * «خصم» بالسالب أو خصم على أيام مجانية أصلًا — رقم بلا معنى في فاتورة.
 */
describe("الخصم اليدوي على الحملة", () => {
  it("🔴 العرض بيتحسب على المتبقي بعد الهدية، و`الإجمالي = المطلوب + الخصم` تفضل صحيحة", async () => {
    // بانر ١٥٠/يوم × ١٠ أيام = ١٥٠٠
    const q0 = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(40), end: d(49) }).expect(200)).body;
    expect(q0.total).toBe(1500);

    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(40), end: d(49), offerPct: 20 }).expect(200)).body;
    expect(q.gross).toBe(1500);
    expect(q.offer).toBe(300);          // ٢٠٪ من ١٥٠٠
    expect(q.total).toBe(1200);
    expect(+(q.total + q.discount).toFixed(2)).toBe(q.gross);

    // هدية شهر (٣٠ يوم = ٤٥٠٠) على حملة ٤٠ يوم (٦٠٠٠) + عرض ٢٠٪
    // → ٢٠٪ من المتبقي (١٥٠٠) = ٣٠٠، والمطلوب ١٢٠٠
    const [gift] = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 1, placements: ["banner"] }).expect(201)).body as { code: string }[];
    const qg = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(40), end: d(79), giftCode: gift.code, offerPct: 20 }).expect(200)).body;
    expect(qg.gross).toBe(6000);
    expect(qg.gift).toBe(4500);
    expect(qg.offer).toBe(300);
    expect(qg.total).toBe(1200);
    expect(+(qg.total + qg.discount).toFixed(2)).toBe(qg.gross);
  });

  it("الحملة بتتخزن بالعرض، وتغيير النسبة لوحدها بيعيد حساب الفاتورة", async () => {
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], start: d(60), end: d(69), offerPct: 10 })).expect(201)).body;
    expect(c.offerPct).toBe(10);
    expect(c.total).toBe(1350); // ١٥٠٠ − ١٠٪

    // 🔴 النسبة لوحدها لازم تعيد الحساب — من غير كده الرقم بيتخزن
    // والفاتورة تفضل القديمة، والعميل يشوف نسبة متفق عليها بلا أثر
    const up = (await api().patch(`/admin/ads/campaigns/${c.id}`).set(owner.auth).send({ offerPct: 25 }).expect(200)).body;
    expect(up.offerPct).toBe(25);
    expect(up.total).toBe(1125);
    expect(up.discount).toBe(375);
  });

  it("🔴 سحب الهدية عند الرفض مابيشيلش العرض معاها", async () => {
    const [gift] = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 1, placements: ["banner"] }).expect(201)).body as { code: string }[];
    // حملة ٤٠ يوم (٦٠٠٠)، هدية ٣٠ يوم (٤٥٠٠)، عرض ٢٠٪ على المتبقي (١٥٠٠) = ٣٠٠
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], start: d(120), end: d(159), giftCode: gift.code, offerPct: 20 })).expect(201)).body;
    expect(c.total).toBe(1200);

    const r = (await api().post(`/admin/ads/campaigns/${c.id}/reject`).set(owner.auth).send({ reason: "مش مناسب" }).expect(200)).body;
    // الهدية رجعت، **والعرض لسه مطبَّق**: ٦٠٠٠ − ٢٠٪ = ٤٨٠٠
    expect(r.giftCode).toBe(null);
    expect(r.offerPct).toBe(20);
    expect(r.total).toBe(4800);
    expect(r.discount).toBe(1200);
  });

  it("النسبة محدودة ٠–١٠٠ ومفيش قيم غريبة", async () => {
    await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(40), end: d(41), offerPct: 101 }).expect(400);
    await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(40), end: d(41), offerPct: -5 }).expect(400);
    const full = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(40), end: d(41), offerPct: 100 }).expect(200)).body;
    expect(full.total).toBe(0); // ١٠٠٪ = مجاني بحملة — مسموح عن قصد
  });
});

/**
 * **إعلان بدون حملة** — بطلب داليا: «ينزل إعلان واحد أو اتنين مش لازم
 * المجموعة كلها». بلا تواريخ ولا سعر ولا حجز.
 *
 * 🔴 والخطر الحقيقي فيه إنه **يمنع معلنًا دافعًا**: لو الحجز بتاعه اتحسب في
 * الإشغال، الموضع الفاضي يرجّع «مفيش مكان فاضي» لأول واحد يحاول يشتريه —
 * ومفيش أي خطأ يبان، البيع بس بيقف. والاختبار بيشتري فعلًا بعد ما ننزل
 * إعلانًا بيتنا على نفس الموضع.
 */
describe("إعلان بدون حملة", () => {
  it("🔴 مابياخدش مكانًا مبيوعًا — المعلن الدافع لسه يقدر يشتري الموضع كله", async () => {
    await api().put("/admin/ads/placements/rooms").set(owner.auth).send({ name: "بانر الغرف الصوتية", kind: "room", width: 1200, height: 300, slots: 1, pricePerDay: 100, active: true }).expect(200);
    const h = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "رع شات", placements: ["rooms"], house: true })).expect(201)).body;
    expect(h.isHouse).toBe(true);
    expect(h.status).toBe("approved"); // بلا مراجعة — إعلاننا إحنا
    expect(h.total).toBe(0);

    // المكان الوحيد لسه متاح للبيع
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["rooms"], start: d(100), end: d(102) }).expect(200)).body;
    expect(q.ok).toBe(true);
    const paid = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "معلن دافع", placements: ["rooms"], start: d(100), end: d(102), approve: true })).expect(201)).body;
    expect(paid.total).toBe(300);
  });

  it("🔴 بيظهر في الكتالوج لما يكون فيه مكان فاضي، وبيختفي لما المدفوع يملا الموضع", async () => {
    await api().put("/admin/ads/placements/adsfeed").set(owner.auth).send({ name: "قائمة العروض", kind: "banner", width: 1200, height: 300, slots: 1, pricePerDay: 80, active: true }).expect(200);
    const h = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "إعلان بيتنا", placements: ["adsfeed"], house: true })).expect(201)).body;

    const inFeed = () => api().get("/ads/catalog").set(owner.auth).expect(200)
      .then((r) => r.body.filter((a: { placements: string[] }) => a.placements.includes("adsfeed")).map((a: { id: string }) => a.id));
    expect(await inFeed()).toContain(h.id);

    // معلن دافع بياخد المكان الوحيد النهارده → إعلاننا يفضي له
    const paid = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "دافع", placements: ["adsfeed"], start: todayCairo(), end: d(2), approve: true })).expect(201)).body;
    const now = await inFeed();
    expect(now).toContain(paid.id);
    expect(now).not.toContain(h.id);
  });

  it("مفيش كود هدية على إعلان بدون حملة، والتواريخ مش مطلوبة", async () => {
    const [gift] = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 1 }).expect(201)).body as { code: string }[];
    expect(gift.code).toBeTruthy(); // لو الرد اتغيّر، الاختبار يقول كده بدل ما يعدّي بكود فاضي
    await api().post("/admin/ads/campaigns").set(owner.auth)
      .send({ advertiser: "رع شات", headline: "جرّب الغرف", link: "https://example.com/h", placements: ["banner"], house: true, giftCode: gift.code }).expect(400);
    // بلا `start`/`end` خالص
    const ok = (await api().post("/admin/ads/campaigns").set(owner.auth)
      .send({ advertiser: "رع شات", headline: "جرّب الغرف", link: "https://example.com/h", placements: ["banner"], house: true }).expect(201)).body;
    expect(ok.isHouse).toBe(true);
    expect(ok.start).toBe(todayCairo());
  });
});

/**
 * **الأسعار شاملة ضريبة القيمة المضافة** (قرار داليا ١٨ أكتوبر ٢٠٢٦).
 *
 * 🔴 الفحص الحاسم هنا إن الضريبة **مستخرجة** من الإجمالي مش مزوّدة عليه:
 * على ١٥٠٠ ج الاستخراج ضريبته ١٨٤٫٢١، والإضافة بتطلّع ٢١٠ وإجمالي ١٧١٠ —
 * يعني مطالبة المعلن بـ٢١٠ ج **زيادة على سعر متفق عليه**.
 */
describe("ضريبة القيمة المضافة", () => {
  it("🔴 الضريبة مستخرجة من الإجمالي مش مزوّدة عليه، ومجموع الصافي والضريبة = الإجمالي", async () => {
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], start: d(200), end: d(209) }).expect(200)).body;
    expect(q.total).toBe(1500);
    expect(q.vat.pct).toBe(14);
    expect(q.vat.net).toBe(1315.79);
    expect(q.vat.vat).toBe(184.21);
    // الإجمالي ما اتغيّرش — دي الفرضية اللي بتحمي المعلن من مطالبة زايدة
    expect(+(q.vat.net + q.vat.vat).toFixed(2)).toBe(q.total);
    expect(q.vat.total).toBe(q.total);
  });

  it("الضريبة بتتحسب على المطلوب بعد الخصم والهدية، وبتفضل متسقة في الحملة المحفوظة", async () => {
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], start: d(220), end: d(229), offerPct: 20 })).expect(201)).body;
    expect(c.total).toBe(1200); // ١٥٠٠ − ٢٠٪
    expect(+(c.vat.net + c.vat.vat).toFixed(2)).toBe(1200);
    expect(c.vat.vat).toBe(147.37);
  });
});

/**
 * **مسوّدة نموذج الحملة بتعيش بعد إعادة تحميل الصفحة** (بطلب داليا:
 * «لما اكون عاملة حملة واعمل ريفرش للابلكشن يتم حفظ كل البيانات»).
 *
 * المنطق في `admin/src/draft.js` **خالص وبلا استيراد** عشان يتجرّب لوحده
 * من غير بيئة Vite — ومعاه حارس إن النموذج بيستخدمه فعلًا، لأن مودیول
 * موجود ومحدش بينادیه بيبوظ في سكوت.
 */
describe("مسوّدة نموذج الحملة", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

  it("بتتحفظ وبترجع بالحرف، والمفتاح مختلف بين الجديدة والتعديل", async () => {
    expect(draftKey()).not.toBe(draftKey("c1"));
    const st = mem();
    const d1 = { advertiser: "كافيه النيل", placements: ["banner"], images: { banner: "/uploads/a.png" }, offerPct: 20 };
    saveDraft(draftKey(), d1, st);
    expect(loadDraft(draftKey(), st)).toEqual(d1);
    expect(loadDraft(draftKey("c1"), st)).toBe(null); // مسوّدة التعديل مش بتشوف مسوّدة الجديدة
    clearDraft(draftKey(), st);
    expect(loadDraft(draftKey(), st)).toBe(null);
  });

  it("🔴 مابتكسرش لو التخزين مقفول أو السطر تالف", async () => {
    const dead = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    // التصفّح الخاص بيرمي — ومسوّدة ضايعة أهون من لوحة مابتفتحش
    expect(loadDraft("k", dead)).toBe(null);
    expect(saveDraft("k", { a: 1 }, dead)).toBe(false);
    const bad = { getItem: () => "{ليس json", setItem: () => {}, removeItem: () => {} };
    expect(loadDraft("k", bad)).toBe(null);
    const arr = { getItem: () => "[1,2]", setItem: () => {}, removeItem: () => {} };
    expect(loadDraft("k", arr)).toBe(null); // مصفوفة مش شكل النموذج
  });

  it("النموذج الفاضي مش مسوّدة، وأي حرف أو صورة بيبقى شغلًا", async () => {
    const blank = { advertiser: "", headline: "", placements: [], images: {}, offerPct: 0, start: "2026-10-18", end: "2026-10-24", approve: false, house: false };
    expect(draftHasWork({ ...blank }, blank)).toBe(false);
    // التواريخ لوحدها مش شغل — ليها قيم افتراضية
    expect(draftHasWork({ ...blank, start: "2026-11-01", end: "2026-11-30" }, blank)).toBe(false);
    expect(draftHasWork({ ...blank, advertiser: "ك" }, blank)).toBe(true);
    expect(draftHasWork({ ...blank, placements: ["banner"] }, blank)).toBe(true);
    expect(draftHasWork({ ...blank, images: { banner: "/uploads/a.png" } }, blank)).toBe(true);
    expect(draftHasWork({ ...blank, offerPct: 10 }, blank)).toBe(true);
  });

  it("🔴 نموذج الحملة بيستخدم المسوّدة فعلًا (مودیول محدش بينادیه بيبوظ في سكوت)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(import.meta.dirname, "../../admin/src/liveAds.jsx"), "utf8");
    for (const fn of ["loadDraft(", "saveDraft(", "clearDraft(", "draftKey("]) expect(src, `النموذج مش بينادي ${fn}`).toContain(fn);
    // والتنضيف بعد الحفظ الناجح — من غيره المسوّدة القديمة بترجع فوق حملة اتعملت
    expect(src).toMatch(/if \(r\) \{ clearDraft\(key\); onDone\(\); \}/);
  });
});
