import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { DEFAULT_PLACEMENTS, MONTH_DAYS, addDays, todayCairo } from "../src/lib/adsInventory.js";
// @ts-expect-error دالة خالصة بـ JS عادي — مفيش types ولا تبعيات (نفس `uploadUrl.test.ts`)
import { clearDraft, draftHasWork, draftKey, loadDraft, saveDraft } from "../../admin/src/draft.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
let owner: Awaited<ReturnType<typeof env.login>>;
beforeAll(async () => { env = await startTestEnv(); owner = await env.login("01099000001", "داليا"); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);
const T = todayCairo();
const d = (n: number) => addDays(T, n);
/**
 * 🔴 **البيع شهور كاملة بس** (قرار داليا ١٩ أكتوبر ٢٠٢٦) — فكل فترة حملة أو
 * تسعيرة في الاختبارات دي لازم تكون مضاعفًا لـ`MONTH_DAYS`، وإلا السيرفر
 * بيرفض بـ٤٠٠ `bad_range`. والقفل (`/blocks`) لسه بالأيام عن قصد: ده صيانة
 * مش بيع.
 */
const mo = (from: number, months = 1) => ({ start: d(from), end: d(from + months * MONTH_DAYS - 1) });
/** فترة الشهر رقم k — نوافذ متتالية مابتتقاطعش، فكل اختبار له مكانه */
const W = (k: number, months = 1) => mo(1 + k * MONTH_DAYS, months);
// نافذة بعيدة للطلبات اللي المفروض تترفض — لو واحد نجح بالغلط مايزاحمش حد
const camp = (o: Record<string, unknown> = {}) => ({ advertiser: "كافيه النيل", headline: "قهوتك علينا", link: "https://example.com/a", ...W(25), placements: ["banner"], ...o });

describe("خريطة الإعلانات", () => {
  it("المواضع الافتراضية بمقاساتها وأسعارها، والتسعير = سعر الشهر × الشهور × المواضع", async () => {
    const ps = (await api().get("/admin/ads/placements").set(owner.auth).expect(200)).body;
    // من المصدر مش قايمة مكتوبة بالإيد — إضافة موضع جديد مايكسرش الاختبار،
    // وفي نفس الوقت الترتيب والعدد لسه متفحوصين
    expect(ps.map((p: { key: string }) => p.key)).toEqual(DEFAULT_PLACEMENTS.map((p) => p.key));
    expect(ps[1]).toMatchObject({ width: 1200, height: 300, slots: 3, pricePerMonth: 4500, pricePerDay: 150 });
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner", "services"], ...W(0) }).expect(200)).body;
    expect(q.months).toBe(1); expect(q.days).toBe(MONTH_DAYS); expect(q.total).toBe(4500 + 3600); expect(q.ok).toBe(true);
  });

  it("الحجز بيستهلك السعة، وبعد ما تمتلي الأيام دي بتبقى غير متاحة (409) والباقي متاح", async () => {
    await api().put("/admin/ads/placements/story").set(owner.auth).send({ name: "ستوري", kind: "story", width: 1080, height: 1920, slots: 1, pricePerMonth: 12000, active: true }).expect(200);
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["story"], ...W(5) })).expect(201)).body;
    expect(a.status).toBe("pending"); expect(a.total).toBe(12000);
    const r = await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "تاني", placements: ["story"], ...mo(1 + 5 * MONTH_DAYS + 10) }));
    expect(r.status).toBe(409); expect(r.body.code).toBe("ad_unavailable");
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "تاني", placements: ["story"], ...W(6) })).expect(201);
    const inv = (await api().get(`/admin/ads/inventory?from=${d(5 * MONTH_DAYS)}&days=3`).set(owner.auth).expect(200)).body;
    const st = inv.placements.find((p: { key: string }) => p.key === "story");
    expect(st.cells.map((c: { free: number }) => c.free)).toEqual([1, 0, 0]);
    expect(st.cells[1].held).toBe(1);
  });

  it("رفض/إلغاء بيحرر المكان، والموافقة بتحوّل الحجز المؤقت لمؤكد، والتعديل بيعيد التسعير", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["modal"], ...W(20) })).expect(201)).body;
    expect((await api().post(`/admin/ads/campaigns/${a.id}/approve`).set(owner.auth).expect(200)).body.status).toBe("approved");
    await api().post(`/admin/ads/campaigns/${a.id}/approve`).set(owner.auth).expect(400);
    const up = (await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth).send({ end: W(20, 2).end, placements: ["modal", "services"] }).expect(200)).body;
    expect(up.total).toBe((12000 + 3600) * 2);
    let inv = (await api().get(`/admin/ads/inventory?from=${W(20).start}&days=1`).set(owner.auth)).body;
    expect(inv.placements.find((p: { key: string }) => p.key === "modal").cells[0]).toMatchObject({ booked: 1, held: 0 });
    await api().post(`/admin/ads/campaigns/${a.id}/pause`).set(owner.auth).expect(200);
    await api().post(`/admin/ads/campaigns/${a.id}/cancel`).set(owner.auth).expect(200);
    inv = (await api().get(`/admin/ads/inventory?from=${W(20).start}&days=1`).set(owner.auth)).body;
    expect(inv.placements.find((p: { key: string }) => p.key === "modal").cells[0]).toMatchObject({ booked: 0, free: 4 });
    await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth).send({ headline: "x y" }).expect(400);
  });

  it("قفل موضع لفترة بيخليه غير متاح، وممنوع قفل فترة فيها حجز، وفتحه بيرجّعه", async () => {
    const blk = (await api().post("/admin/ads/blocks").set(owner.auth).send({ placement: "services", from: W(30).start, to: d(1 + 30 * MONTH_DAYS + 2), reason: "صيانة" }).expect(201)).body;
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["services"], ...W(30) }).expect(200)).body;
    expect(q.ok).toBe(false); expect(q.conflicts[0]).toMatchObject({ key: "services", day: W(30).start, reason: "blocked" });
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["services"], ...mo(1 + 30 * MONTH_DAYS + 1) })).expect(409);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...W(31) })).expect(201);
    await api().post("/admin/ads/blocks").set(owner.auth).send({ placement: "banner", from: d(1 + 31 * MONTH_DAYS + 1), to: d(1 + 31 * MONTH_DAYS + 2), reason: "حدث" }).expect(409);
    await api().delete(`/admin/ads/blocks/${blk.id}`).set(owner.auth).expect(204);
    expect((await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["services"], ...W(30) })).body.ok).toBe(true);
  });

  it("حجزين متزامنين على آخر مكان: واحد بس ينجح", async () => {
    await api().put("/admin/ads/placements/story").set(owner.auth).send({ name: "ستوري", kind: "story", width: 1080, height: 1920, slots: 1, pricePerMonth: 12000, active: true }).expect(200);
    const rs = await Promise.all([0, 1, 2].map((i) => api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "م" + i, placements: ["story"], ...W(60) }))));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it("تقليل سعة موضع تحت الحجوزات القائمة ممنوع", async () => {
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...W(50) })).expect(201);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...W(50) })).expect(201);
    const r = await api().put("/admin/ads/placements/banner").set(owner.auth).send({ name: "بانر", kind: "banner", width: 1200, height: 300, slots: 1, pricePerMonth: 4500, active: true });
    expect(r.status).toBe(409); expect(r.body.code).toBe("slots_in_use");
  });

  it("التحقق: تاريخ فات / نهاية قبل بداية / رابط مش https / موضع مجهول", async () => {
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ ...mo(-2) })).expect(400);  // تاريخ فات — والفترة شهر كامل عشان الرفض يبقى للسبب ده
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ start: d(5), end: d(4) })).expect(400);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ ...W(90), end: d(1 + 90 * MONTH_DAYS + 9) })).expect(400); // 🔴 عشرة أيام — مش شهورًا كاملة
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
    await api().post("/admin/ads/campaigns").set(acc.auth).send(camp({ ...W(70) })).expect(403);
    await api().get("/admin/ads/inventory").set(mgr.auth).expect(200);
    await api().post("/admin/ads/campaigns").set(mgr.auth).send(camp({ placements: ["services"], ...W(70), approve: true })).expect(201);
    const log = (await api().get("/admin/audit").set(owner.auth)).body as { what: string }[];
    expect(log.some((l) => l.what === "أنشأ واعتمد حملة")).toBe(true);
  });

  it("/ads/catalog بيرجّع الشغّال النهارده بس (معتمد وفي فترته)", async () => {
    const user = await env.login("01099000030", "مستخدم");
    const run = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "شغال", placements: ["modal", "services"], ...mo(0), approve: true })).expect(201)).body;
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "مستني", placements: ["story"], ...mo(0) })).expect(201);
    await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "بكرة", placements: ["modal"], ...W(1), approve: true })).expect(201);
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
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "إحصاء", placements: ["banner"], ...mo(0), approve: true })).expect(201)).body;
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
    // 🔴 التاريخ الأقلّ من ١٨ يُكتب **في القاعدة مباشرةً** من ٢٦ أكتوبر ٢٠٢٦: كل مسار
    // (التسجيل · الدخول بكود · `PATCH /me` · `set-birthdate.sh`) يرفضه، فالقاعدة هي
    // مصدره الواقعي الوحيد (استرجاع نسخة أو تعديل مباشر) — وفرع `!isAdult` موجود لها.
    await env.ctx.db.user.update({ where: { id: kid.user.id }, data: { birthDate: new Date(`${new Date().getUTCFullYear() - 12}-01-01T00:00:00Z`) } });
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "سلوك", placements: ["banner", "modal"], ...mo(0), approve: true })).expect(201)).body;

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
    // حملة شهرين على بانر (٤٥٠٠/شهر): الهدية بتغطي شهرًا = ٤٥٠٠ والباقي شهر = ٤٥٠٠
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(34, 2), giftCode: gs[0].code.toLowerCase() }).expect(200)).body;
    expect(q).toMatchObject({ gross: 9000, discount: 4500, total: 4500, months: 2, giftDays: 30, giftMonths: 1, giftError: null });
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...W(34, 2), giftCode: gs[0].code })).expect(201)).body;
    expect(c).toMatchObject({ total: 4500, discount: 4500, gross: 9000, giftCode: gs[0].code });
    const used = (await api().get("/admin/ads/gifts").set(owner.auth)).body as { code: string; status: string; usedBy: string }[];
    expect(used.find((g) => g.code === gs[0].code)).toMatchObject({ status: "used", usedBy: "كافيه النيل" });
    expect((await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["services"], ...W(36), giftCode: gs[0].code }))).body.code).toBe("gift_used");
    await api().delete(`/admin/ads/gifts/${used.find((g) => g.code === gs[0].code) ? (await api().get("/admin/ads/gifts").set(owner.auth)).body.find((g: { code: string }) => g.code === gs[0].code).id : ""}`).set(owner.auth).expect(409);
    await api().post(`/admin/ads/campaigns/${c.id}/reject`).set(owner.auth).expect(200);
    const back = (await api().get("/admin/ads/gifts").set(owner.auth)).body as { code: string; status: string }[];
    expect(back.find((g) => g.code === gs[0].code)!.status).toBe("available");
    await api().delete(`/admin/ads/gifts/${gs[1].id}`).set(owner.auth).expect(204);
    expect((await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(36), giftCode: gs[1].code })).body.giftError).toMatch(/غير صحيح/);
  });

  it("هدية مقيّدة بموضع بتخصم الموضع ده بس، ومرفوضة لموضع تاني", async () => {
    const [g] = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 3, placements: ["banner"], expiresAt: d(40 * MONTH_DAYS) }).expect(201)).body as { code: string }[];
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner", "services"], ...W(38), giftCode: g.code })).body;
    expect(q).toMatchObject({ gross: 8100, discount: 4500, total: 3600 });
    const q2 = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["services"], ...W(38), giftCode: g.code })).body;
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
      .send(camp({ placements: ["services"], ...mo(0), imageUrl: img, approve: true })).expect(201)).body;
    expect(a.imageUrl).toBe(img);

    const cat = (await api().get("/ads/catalog").set(owner.auth).expect(200)).body;
    const mine = cat.find((c: { id: string }) => c.id === a.id);
    expect(mine?.imageUrl, "الصورة مش بتوصل للتطبيق").toBe(img);
  });

  it("🔴 بيرفض الرابط الخارجي (٤٠٠) — وإلا المراجعة بلا معنى", async () => {
    const r = await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["services"], ...W(44), imageUrl: "https://evil.com/uploads/x1y2z3a4b5c6.png" }));
    expect(r.status, "اتقبل رابط خارجي").toBe(400);
  });

  it("الإعلان بلا صورة لسه شغّال (نصّ + تدرّج زي ما كان)", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["services"], ...W(48) })).expect(201)).body;
    expect(a.imageUrl).toBeNull();
  });

  it("التعديل بيقدر يشيل الصورة (null)", async () => {
    const img = "/uploads/ffeeddccbbaa9988.jpg";
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth)
      .send(camp({ placements: ["services"], ...W(52), imageUrl: img })).expect(201)).body;
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
      placements: ["banner", "modal"], ...mo(0), approve: true,
      images: { banner: WIDE, modal: TALL },
    })).expect(201)).body;
    expect(a.images).toEqual({ banner: WIDE, modal: TALL });

    const mine = ((await api().get("/ads/catalog").set(owner.auth).expect(200)).body as { id: string; images: Record<string, string> }[])
      .find((c) => c.id === a.id);
    expect(mine?.images, "الصور مش بتوصل للتطبيق بمفاتيح المواضع").toEqual({ banner: WIDE, modal: TALL });
  });

  it("الموضع اللي مالوش صورة بياخد صورة الحملة (الحملات القديمة)", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner", "modal"], ...W(56), imageUrl: WIDE, images: { modal: TALL },
    })).expect(201)).body;
    expect(a.imageUrl).toBe(WIDE);
    expect(a.images).toEqual({ modal: TALL });
  });

  it("🔴 الرابط الخارجي في صورة موضع بيترفض زي صورة الحملة", async () => {
    const r = await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner"], ...W(64), images: { banner: "https://evil.com/uploads/aaaabbbbccccdddd.png" },
    }));
    expect(r.status, "اتقبل رابط خارجي في صورة موضع").toBe(400);
  });

  it("التعديل بيبدّل صورة موضع ويشيل التانية", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner", "modal"], ...W(68), images: { banner: WIDE, modal: TALL },
    })).expect(201)).body;
    const b = (await api().patch(`/admin/ads/campaigns/${a.id}`).set(owner.auth)
      .send({ images: { banner: TALL, modal: null } }).expect(200)).body;
    expect(b.images).toEqual({ banner: TALL });
  });

  it("صورة لموضع مش في الحملة بترفض", async () => {
    const a = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({
      placements: ["banner"], ...W(72),
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
      // ⚠️ نافذة «النهاردة» (`mo(0)`) **مشتركة** بين كل اختبار محتاج حملة
      // شغّالة النهاردة — والبيع بالشهر خلّى الشهر ده واحدًا لكلهم، فسعة كل
      // موضع فيه محدودة: البانر (٣ أماكن) اتملا، فده على النافذة (٤).
      .send(camp({ placements: ["modal"], ...mo(0), approve: true })).expect(201)).body;
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
  it("🔴 شهور «شهر/٣/٦/سنة» في اللوحة نفس GIFT_MONTHS على السيرفر، وطول الشهر واحد", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../..");
    const src = fs.readFileSync(path.join(root, "admin/src/liveAds.jsx"), "utf8");

    const line = /const DURATIONS = (\[.*?\]);/s.exec(src);
    expect(line, "مالقاش DURATIONS في liveAds.jsx").toBeTruthy();
    const months = [...line![1].matchAll(/\[\s*(\d+)\s*,/g)].map((m) => +m[1]);
    expect(months, "المدد الجاهزة مش شهر/٣/٦/سنة").toEqual([1, 3, 6, 12]);

    // 🔴 والحاسم: **طول الشهر** في اللوحة نفسه اللي على السيرفر. لو اتفرقوا،
    // النهاية اللي اللوحة بتحسبها مابتبقاش شهورًا كاملة عند السيرفر، فالحجز
    // يترفض بـ٤٠٠ بعد ما الواحد يملا النموذج كله — أو أسوأ: يتقبل بفرق يوم
    // بفلوس زي اللي حصل فعلًا (٩٢٠ ج.م في عرض سعر حقيقي).
    const adminMonth = /const MONTH_DAYS = (\d+);/.exec(src);
    expect(adminMonth, "مالقاش MONTH_DAYS في liveAds.jsx").toBeTruthy();
    expect(+adminMonth![1], "طول الشهر في اللوحة مختلف عن السيرفر").toBe(MONTH_DAYS);

    const { GIFT_MONTHS } = await import("../src/lib/adsInventory.js");
    expect(months.map((m) => GIFT_MONTHS[m]), "أيام الهدايا مش مشتقّة من طول الشهر")
      .toEqual(months.map((m) => m * MONTH_DAYS));
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
    // بانر ٤٥٠٠/شهر × شهر = ٤٥٠٠
    const q0 = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(76) }).expect(200)).body;
    expect(q0.total).toBe(4500);

    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(76), offerPct: 20 }).expect(200)).body;
    expect(q.gross).toBe(4500);
    expect(q.offer).toBe(900);          // ٢٠٪ من ٤٥٠٠
    expect(q.total).toBe(3600);
    expect(+(q.total + q.discount).toFixed(2)).toBe(q.gross);

    // هدية شهر (٤٥٠٠) على حملة شهرين (٩٠٠٠) + عرض ٢٠٪
    // → ٢٠٪ من المتبقي (٤٥٠٠) = ٩٠٠، والمطلوب ٣٦٠٠
    const [gift] = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 1, placements: ["banner"] }).expect(201)).body as { code: string }[];
    const qg = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(76, 2), giftCode: gift.code, offerPct: 20 }).expect(200)).body;
    expect(qg.gross).toBe(9000);
    expect(qg.gift).toBe(4500);
    expect(qg.offer).toBe(900);
    expect(qg.total).toBe(3600);
    expect(+(qg.total + qg.discount).toFixed(2)).toBe(qg.gross);
  });

  it("الحملة بتتخزن بالعرض، وتغيير النسبة لوحدها بيعيد حساب الفاتورة", async () => {
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...W(80), offerPct: 10 })).expect(201)).body;
    expect(c.offerPct).toBe(10);
    expect(c.total).toBe(4050); // ٤٥٠٠ − ١٠٪

    // 🔴 النسبة لوحدها لازم تعيد الحساب — من غير كده الرقم بيتخزن
    // والفاتورة تفضل القديمة، والعميل يشوف نسبة متفق عليها بلا أثر
    const up = (await api().patch(`/admin/ads/campaigns/${c.id}`).set(owner.auth).send({ offerPct: 25 }).expect(200)).body;
    expect(up.offerPct).toBe(25);
    expect(up.total).toBe(3375);
    expect(up.discount).toBe(1125);
  });

  it("🔴 سحب الهدية عند الرفض مابيشيلش العرض معاها", async () => {
    const [gift] = (await api().post("/admin/ads/gifts").set(owner.auth).send({ months: 1, placements: ["banner"] }).expect(201)).body as { code: string }[];
    // حملة شهرين (٩٠٠٠)، هدية شهر (٤٥٠٠)، عرض ٢٠٪ على المتبقي (٤٥٠٠) = ٩٠٠
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...W(84, 2), giftCode: gift.code, offerPct: 20 })).expect(201)).body;
    expect(c.total).toBe(3600);

    const r = (await api().post(`/admin/ads/campaigns/${c.id}/reject`).set(owner.auth).send({ reason: "مش مناسب" }).expect(200)).body;
    // الهدية رجعت، **والعرض لسه مطبَّق**: ٩٠٠٠ − ٢٠٪ = ٧٢٠٠
    expect(r.giftCode).toBe(null);
    expect(r.offerPct).toBe(20);
    expect(r.total).toBe(7200);
    expect(r.discount).toBe(1800);
  });

  it("النسبة محدودة ٠–١٠٠ ومفيش قيم غريبة", async () => {
    await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(88), offerPct: 101 }).expect(400);
    await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(88), offerPct: -5 }).expect(400);
    const full = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(88), offerPct: 100 }).expect(200)).body;
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
    await api().put("/admin/ads/placements/rooms").set(owner.auth).send({ name: "بانر الغرف الصوتية", kind: "room", width: 1200, height: 300, slots: 1, pricePerMonth: 3000, active: true }).expect(200);
    const h = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "رع شات", placements: ["rooms"], house: true })).expect(201)).body;
    expect(h.isHouse).toBe(true);
    expect(h.status).toBe("approved"); // بلا مراجعة — إعلاننا إحنا
    expect(h.total).toBe(0);

    // المكان الوحيد لسه متاح للبيع
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["rooms"], ...W(92) }).expect(200)).body;
    expect(q.ok).toBe(true);
    const paid = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "معلن دافع", placements: ["rooms"], ...W(92), approve: true })).expect(201)).body;
    expect(paid.total).toBe(3000);
  });

  it("🔴 بيظهر في الكتالوج لما يكون فيه مكان فاضي، وبيختفي لما المدفوع يملا الموضع", async () => {
    await api().put("/admin/ads/placements/adsfeed").set(owner.auth).send({ name: "قائمة العروض", kind: "banner", width: 1200, height: 300, slots: 1, pricePerMonth: 2400, active: true }).expect(200);
    const h = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "إعلان بيتنا", placements: ["adsfeed"], house: true })).expect(201)).body;

    const inFeed = () => api().get("/ads/catalog").set(owner.auth).expect(200)
      .then((r) => r.body.filter((a: { placements: string[] }) => a.placements.includes("adsfeed")).map((a: { id: string }) => a.id));
    expect(await inFeed()).toContain(h.id);

    // معلن دافع بياخد المكان الوحيد النهارده → إعلاننا يفضي له
    const paid = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ advertiser: "دافع", placements: ["adsfeed"], ...mo(0), approve: true })).expect(201)).body;
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
    const q = (await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...W(96) }).expect(200)).body;
    expect(q.total).toBe(4500);
    expect(q.vat.pct).toBe(14);
    expect(q.vat.net).toBe(3947.37);
    expect(q.vat.vat).toBe(552.63);
    // الإجمالي ما اتغيّرش — دي الفرضية اللي بتحمي المعلن من مطالبة زايدة
    expect(+(q.vat.net + q.vat.vat).toFixed(2)).toBe(q.total);
    expect(q.vat.total).toBe(q.total);
  });

  it("الضريبة بتتحسب على المطلوب بعد الخصم والهدية، وبتفضل متسقة في الحملة المحفوظة", async () => {
    const c = (await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...W(100), offerPct: 20 })).expect(201)).body;
    expect(c.total).toBe(3600); // ٤٥٠٠ − ٢٠٪
    expect(+(c.vat.net + c.vat.vat).toFixed(2)).toBe(3600);
    expect(c.vat.vat).toBe(442.11);
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

/**
 * 🔴 **البيع شهور كاملة بس** (قرار داليا ١٩ أكتوبر ٢٠٢٦: «عايزة الإعلانات
 * بالشهر مش باليوم» → «شهور كاملة بس»).
 *
 * والرفض لازم يكون على **السيرفر** مش في اللوحة: السعر بقى `pricePerMonth`
 * وضربه في شهور، فلو فترة مش شهورًا كاملة عدّت، التسعير يا يقرّب يا يطلّع
 * كسرًا — **فاتورة برقم محدش يعرف جا منين**. فـ`priceOf` بترمي بدل ما
 * تقسّم باليوم، والمسار يرفض بـ٤٠٠ `bad_range` من أول الطريق.
 *
 * والحملات **القديمة** (اللي اتعملت قبل القرار وفترتها مش شهور) لسه
 * بتتعدّل: الرفض على اللي بيغيّر تواريخها بس — وإلا كل حملة قايمة في
 * الإنتاج تبقى محبوسة ومستحيل حتى تتوقف من اللوحة.
 */
describe("شهور كاملة بس", () => {
  it("🔴 فترة مش شهورًا كاملة بترفض ٤٠٠ في التسعيرة وفي الحجز", async () => {
    for (const days of [1, 10, 29, 31, 45, 59]) {
      const range = { start: d(1 + 110 * MONTH_DAYS), end: d(1 + 110 * MONTH_DAYS + days - 1) };
      const q = await api().post("/admin/ads/quote").set(owner.auth).send({ placements: ["banner"], ...range });
      expect(q.status, `${days} يوم اتقبل في التسعيرة`).toBe(400);
      const c = await api().post("/admin/ads/campaigns").set(owner.auth).send(camp({ placements: ["banner"], ...range }));
      expect(c.status, `${days} يوم اتقبل في الحجز`).toBe(400);
      // والرسالة بتقول **القاعدة** مش «قيمة غلط» — ده اللي بيوصل للي بيحجز
      // ⚠️ المطابقة على **الجذر**: النصّ «شهورًا كاملة» بالتنوين، فـ/شهور كاملة/
      // بتفشل على رسالة سليمة (نفس درس مطابقة العربي في الاختبارات)
      for (const r of [q, c]) expect(r.body.message, `الرسالة مش بتقول قاعدة الشهور: ${r.body.message}`).toMatch(/شهور.{0,3} كاملة/);
    }
  });

  it("الشهور الكاملة بتعدّي، والسعر = سعر الشهر × الشهور بلا كسور", async () => {
    for (const months of [1, 2, 3, 6, 12]) {
      const q = (await api().post("/admin/ads/quote").set(owner.auth)
        .send({ placements: ["banner"], ...mo(1 + 120 * MONTH_DAYS, months) }).expect(200)).body;
      expect(q.months, `${months} شهر اتحسبت غلط`).toBe(months);
      expect(q.total).toBe(4500 * months);
      expect(Number.isInteger(q.total * 100), "فاتورة فيها كسر قرش").toBe(true);
    }
  });

  it("🔴 هدية السنة بتغطي حملة السنة بالكامل — مفيش يوم بفلوس", async () => {
    const [gift] = (await api().post("/admin/ads/gifts").set(owner.auth)
      .send({ months: 12, placements: ["banner"] }).expect(201)).body as { code: string }[];
    expect(gift.code).toBeTruthy();
    const q = (await api().post("/admin/ads/quote").set(owner.auth)
      .send({ placements: ["banner"], ...mo(1 + 140 * MONTH_DAYS, 12), giftCode: gift.code }).expect(200)).body;
    expect(q.months).toBe(12);
    expect(q.giftMonths).toBe(12);
    // ده الرقم اللي كان بيطلع ٩٢٠ ج.م لما السنة كانت ٣٦٦ يوم والهدية ٣٦٥
    expect(q.total, "فاضل مبلغ على حملة الهدية بتغطيها بالكامل").toBe(0);
  });

  it("الحملة القديمة (فترتها مش شهور) لسه بتتعدّل طول ما تواريخها ما اتغيّرتش", async () => {
    // إنشاؤها بمسار اللوحة مستحيل دلوقتي — فالحالة بتتعمل في القاعدة زي
    // الحملات اللي في الإنتاج فعلًا قبل القرار
    const p = (await env.ctx.db.adPlacement.findFirstOrThrow({ where: { key: "banner" } }));
    const start = d(1 + 160 * MONTH_DAYS);
    const old = await env.ctx.db.adCampaign.create({ data: {
      advertiser: "حملة قديمة", headline: "من قبل القرار", link: "https://example.com/old",
      startDate: start, endDate: d(1 + 160 * MONTH_DAYS + 9), status: "approved", total: "1500",
      bookings: { create: [{ placementId: p.id, pricePerMonth: p.pricePerMonth, pricePerDay: p.pricePerDay }] },
    } });
    // تعديل بلا تواريخ: لازم يعدّي (وإلا الحملة محبوسة ومستحيل توقفها)
    await api().patch(`/admin/ads/campaigns/${old.id}`).set(owner.auth).send({ headline: "عنوان جديد" }).expect(200);
    // تعديل بيغيّر التواريخ لفترة مش شهور: يترفض
    const bad = await api().patch(`/admin/ads/campaigns/${old.id}`).set(owner.auth).send({ end: d(1 + 160 * MONTH_DAYS + 14) });
    expect(bad.status, "فترة مش شهور اتقبلت في التعديل").toBe(400);
    expect(bad.body.code).toBe("bad_range");
    // ولشهر كامل: يعدّي
    await api().patch(`/admin/ads/campaigns/${old.id}`).set(owner.auth).send({ end: mo(1 + 160 * MONTH_DAYS).end }).expect(200);
  });
});

/**
 * 🔴 **الموضع الجديد لازم يوصل لقاعدة فيها مواضع قديمة.**
 *
 * `ensureDefaultPlacements` كان بيرجع فورًا لو القاعدة فيها أي موضع، فأي
 * موضع بيتضاف لـ`DEFAULT_PLACEMENTS` بعد أول تشغيل **عمره ما يتخلق في
 * الإنتاج**. وحصل: `rooms` و`adsfeed` اتضافوا والإنتاج فضل على ٤ مواضع —
 * مكانان للبيع في الكود ومش موجودين في القاعدة، **بلا أي خطأ**.
 *
 * والاختبارات التانية مستحيل تمسكها: كلها على قاعدة **فاضية** فالشرط القديم
 * بيزرع الكل ويعدّي. فالاختبار ده بيعمل الحالة الحقيقية بإيده — قاعدة فيها
 * **بعض** المواضع — وهي الوحيدة اللي بتفرّق بين الصح والغلط.
 */
describe("زرع المواضع الناقصة", () => {
  it("الموضع الجديد بيتخلق على قاعدة فيها مواضع قديمة، والمعدَّل مابيتلمسش", async () => {
    // سعر معدَّل من اللوحة — لازم يفضل بعد الزرع
    await api().put("/admin/ads/placements/banner").set(owner.auth)
      .send({ name: "بانر الدردشات", kind: "banner", width: 1200, height: 300, slots: 3, pricePerMonth: 5970, active: true }).expect(200);
    // نرجّع القاعدة لحالة الإنتاج: المواضع القديمة بس.
    // ⚠️ الكتلة دي بتعدّل حالة مشتركة (بتمسح حجوزات المواضع دي) فلازم تفضل
    // **آخر** حاجة في الملف — أي اختبار بعدها هيشوف قاعدة ناقصة.
    const newKeys = ["rooms", "adsfeed"];
    await env.ctx.db.adBooking.deleteMany({ where: { placement: { key: { in: newKeys } } } });
    await env.ctx.db.adPlacement.deleteMany({ where: { key: { in: newKeys } } });
    // الفحص القبلي **من القاعدة مباشرة**: `GET /placements` بينادي الزرع هو
    // كمان، فقراءة الحالة منه بتصلّحها قبل ما نختبرها
    const before = (await env.ctx.db.adPlacement.findMany({ select: { key: true } })).map((p) => p.key);
    expect(before, "التجهيز فشل — الحالة اللي بنختبرها مش موجودة").not.toContain("rooms");
    expect(before.length, "لازم تفضل مواضع قديمة — قاعدة فاضية بتزرع الكل وتخفي العطل").toBeGreaterThan(0);

    // أي نداء على المخزون بيعدّي على ensureDefaultPlacements
    await api().get("/admin/ads/inventory?days=1").set(owner.auth).expect(200);

    const after = (await api().get("/admin/ads/placements").set(owner.auth).expect(200)).body;
    for (const k of DEFAULT_PLACEMENTS.map((p) => p.key)) {
      expect(after.map((p: { key: string }) => p.key), `الموضع ${k} ما اتخلقش — مكان للبيع مش موجود في القاعدة`).toContain(k);
    }
    const banner = after.find((p: { key: string }) => p.key === "banner");
    expect(banner.pricePerMonth, "الزرع كتب فوق سعر معدَّل من اللوحة").toBe(5970);
  });
});
