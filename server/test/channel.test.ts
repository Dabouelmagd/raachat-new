import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

/**
 * القنوات. القناة **بث مش جروب**: المالك والمشرفين بينشروا، والمشترك بيقرا
 * ويتفاعل، والمشتركين **مابيشوفوش بعض**.
 *
 * نوع جديد في `ThreadType` عن قصد: كل فحص قديم من شكل `type !== "group"` بيرفض
 * القناة تلقائيًا (فشل مقفول)، وبعدين بنفتح المسارات الخاصة بها واحد واحد.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const BAD = "كلمةممنوعة"; // من BANNED_WORDS في helpers

type Auth = { auth: Record<string, string> };
type ChannelView = { id: string; type: string; name: string; about?: string; memberIds: string[]; memberCount: number; myRole: string | null; canPost: boolean };

const channel = async (a: Auth, name: string, about?: string) =>
  (await request(env.app).post("/threads").set(a.auth).send({ type: "channel", name, about }).expect(201)).body as ChannelView;

const post = (a: Auth, id: string, text: string, code = 201) =>
  request(env.app).post(`/threads/${id}/messages`).set(a.auth).send({ text }).expect(code);

const subscribe = (a: Auth, id: string, code = 200) => request(env.app).post(`/threads/${id}/subscribe`).set(a.auth).expect(code);

describe("القنوات", () => {
  it("الإنشاء: صاحبها مالك وبيقدر ينشر، وبتبان في الاكتشاف", async () => {
    const a = await env.login("01098000001", "صاحب القناة");
    const ch = await channel(a, "أخبار رع", "كل جديد في التطبيق");
    expect(ch.type).toBe("channel");
    expect(ch.myRole).toBe("owner");
    expect(ch.canPost).toBe(true);
    expect(ch.about).toBe("كل جديد في التطبيق");
    await post(a, ch.id, "أول منشور");

    const list = (await request(env.app).get("/channels").set(a.auth).expect(200)).body as (ChannelView & { subscribed: boolean })[];
    const mine = list.find((c) => c.id === ch.id)!;
    expect(mine.subscribed).toBe(true);
    expect(mine.memberCount).toBe(1);
  });

  it("المشترك بيقرا ويتفاعل، ومابيقدرش ينشر ولا يعمل استطلاع", async () => {
    const a = await env.login("01098000002", "صاحب");
    const b = await env.login("01098000003", "مشترك");
    const ch = await channel(a, "قناة القراءة");
    const msg = (await post(a, ch.id, "منشور للناس")).body as { id: string };

    await subscribe(b, ch.id);
    const seen = (await request(env.app).get(`/threads/${ch.id}/messages`).set(b.auth).expect(200)).body as { text: string }[];
    expect(seen.at(-1)!.text).toBe("منشور للناس");

    // التفاعل مسموح
    await request(env.app).put(`/messages/${msg.id}/reactions/${encodeURIComponent("👍")}`).set(b.auth).expect(200);

    // النشر ممنوع — نص ومرفق واستطلاع
    const r = await post(b, ch.id, "عايز أكتب", 403);
    expect(r.body.message).toMatch(/للقراءة بس/);
    await request(env.app).post(`/threads/${ch.id}/polls`).set(b.auth).send({ question: "س؟", options: ["أ", "ب"] }).expect(403);
    // ومفيش ولا رسالة اتسجّلت من المشترك
    const after = (await request(env.app).get(`/threads/${ch.id}/messages`).set(a.auth).expect(200)).body as { authorId: string }[];
    expect(after.every((m) => m.authorId !== b.user.id)).toBe(true);
  });

  it("المشتركين مابيشوفوش بعض — العدد بس", async () => {
    const a = await env.login("01098000004", "صاحب ٢");
    const b = await env.login("01098000005", "مشترك ١");
    const c = await env.login("01098000006", "مشترك ٢");
    const ch = await channel(a, "قناة الخصوصية");
    await subscribe(b, ch.id);
    await subscribe(c, ch.id);

    const asB = ((await request(env.app).get("/threads").set(b.auth).expect(200)).body as ChannelView[]).find((t) => t.id === ch.id)!;
    expect(asB.memberIds).toEqual([]);
    expect(asB.memberCount).toBe(3);
    expect(asB.canPost).toBe(false);
  });

  it("إلغاء الاشتراك بيشيلها من قايمتي، والمالك مايقدرش", async () => {
    const a = await env.login("01098000007", "صاحب ٣");
    const b = await env.login("01098000008", "مشترك ٣");
    const ch = await channel(a, "قناة الاشتراك");
    await subscribe(b, ch.id);
    await request(env.app).delete(`/threads/${ch.id}/subscribe`).set(b.auth).expect(204);
    const mine = (await request(env.app).get("/threads").set(b.auth).expect(200)).body as ChannelView[];
    expect(mine.some((t) => t.id === ch.id)).toBe(false);

    const r = await request(env.app).delete(`/threads/${ch.id}/subscribe`).set(a.auth).expect(400);
    expect(r.body.code).toBe("channel_owner");
  });

  it("مسارات الجروبات مقفولة على القناة", async () => {
    const a = await env.login("01098000009", "صاحب ٤");
    const b = await env.login("01098000010", "حد تاني");
    const ch = await channel(a, "قناة مقفولة");
    // مفيش «ضيف أعضاء» في قناة، ومفيش انضمام بمسار الجروب، ومفيش خروج
    await request(env.app).post(`/threads/${ch.id}/members`).set(a.auth).send({ memberIds: [b.user.id] }).expect(404);
    await request(env.app).post(`/threads/${ch.id}/join`).set(b.auth).expect(404);
    const r = await request(env.app).delete(`/threads/${ch.id}/members/me`).set(a.auth).expect(400);
    expect(r.body.code).toBe("use_unsubscribe");
  });

  it("الاسم والوصف متفلترين في الإنشاء وفي التعديل", async () => {
    const a = await env.login("01098000011", "صاحب ٥");
    await request(env.app).post("/threads").set(a.auth).send({ type: "channel", name: `قناة ${BAD}` }).expect(400);
    // الوصف كمان — وهو بيبان لكل الناس في الاكتشاف
    await request(env.app).post("/threads").set(a.auth).send({ type: "channel", name: "قناة نظيفة", about: `وصف فيه ${BAD}` }).expect(400);
    const ch = await channel(a, "قناة سليمة", "وصف سليم");
    const r = await request(env.app).patch(`/threads/${ch.id}`).set(a.auth).send({ about: `تعديل فيه ${BAD}` }).expect(400);
    expect(r.body.code).toBe("objectionable");
    const ok = (await request(env.app).patch(`/threads/${ch.id}`).set(a.auth).send({ about: "وصف جديد" }).expect(200)).body as ChannelView;
    expect(ok.about).toBe("وصف جديد");
  });

  it("صاحب القناة اللي ألغى اشتراكه… مايقدرش، إنما المشرف لو رجع يفضل مشرف", async () => {
    const a = await env.login("01098000012", "صاحب ٦");
    const ch = await channel(a, "قناة الرجوع");
    // الاشتراك تاني (upsert) مابيحوّلش المالك لعضو عادي
    const again = (await subscribe(a, ch.id)).body as ChannelView;
    expect(again.myRole).toBe("owner");
    expect(again.canPost).toBe(true);
  });

  it("القناة المتقيّدة من الإدارة: مفيش نشر ولا تفاعل", async () => {
    const a = await env.login("01098000013", "صاحب ٧");
    const b = await env.login("01098000014", "مشترك ٤");
    const ch = await channel(a, "قناة هتتقيّد");
    const msg = (await post(a, ch.id, "قبل التقييد")).body as { id: string };
    await subscribe(b, ch.id);
    await env.ctx.db.thread.update({ where: { id: ch.id }, data: { restrictedAt: new Date() } });
    await post(a, ch.id, "بعد التقييد", 403);
    await request(env.app).put(`/messages/${msg.id}/reactions/${encodeURIComponent("👍")}`).set(b.auth).expect(403);
  });
});
