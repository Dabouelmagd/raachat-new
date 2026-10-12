import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

/** تثبيت المحادثة فوق القايمة — خاص بصاحبه، وبحد ٣ زي واتساب. */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

type Auth = { auth: Record<string, string> };
const list = async (a: Auth) => (await request(env.app).get("/threads").set(a.auth).expect(200)).body as { id: string; pinned: boolean }[];
const group = async (a: Auth, name: string, ids: string[]) =>
  (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name, memberIds: ids }).expect(201)).body;

describe("تثبيت المحادثات", () => {
  it("المثبّتة بتطلع فوق مهما كان آخر نشاط", async () => {
    const a = await env.login("01096000001", "أ");
    const b = await env.login("01096000002", "ب");
    const old = await group(a, "قديمة", [b.user.id]);
    const fresh = await group(a, "فيها كلام جديد", [b.user.id]);
    await request(env.app).post(`/threads/${fresh.id}/messages`).set(b.auth).send({ text: "رسالة جديدة" }).expect(201);

    expect((await list(a))[0]!.id).toBe(fresh.id); // الأحدث فوق طبيعي
    await request(env.app).put(`/threads/${old.id}/pin`).set(a.auth).expect(204);
    const after = await list(a);
    expect(after[0]!.id).toBe(old.id);
    expect(after[0]!.pinned).toBe(true);
    expect(after[1]!.pinned).toBe(false);

    await request(env.app).delete(`/threads/${old.id}/pin`).set(a.auth).expect(204);
    expect((await list(a))[0]!.id).toBe(fresh.id); // رجعت زي ما كانت
  });

  it("تثبيتي مش بيبان للطرف التاني", async () => {
    const a = await env.login("01096000003", "ج");
    const b = await env.login("01096000004", "د");
    const g = await group(a, "مشتركة", [b.user.id]);
    await request(env.app).put(`/threads/${g.id}/pin`).set(a.auth).expect(204);
    expect((await list(a)).find((t) => t.id === g.id)!.pinned).toBe(true);
    expect((await list(b)).find((t) => t.id === g.id)!.pinned).toBe(false);
  });

  it("الحد ٣ محادثات، والرابعة بترفض برسالة واضحة", async () => {
    const a = await env.login("01096000005", "هـ");
    const b = await env.login("01096000006", "و");
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) ids.push((await group(a, `جروب ${i}`, [b.user.id])).id);
    for (const id of ids.slice(0, 3)) await request(env.app).put(`/threads/${id}/pin`).set(a.auth).expect(204);
    const r = await request(env.app).put(`/threads/${ids[3]}/pin`).set(a.auth).expect(400);
    expect(r.body.code).toBe("too_many_pinned");
    // إعادة تثبيت محادثة **متثبّتة بالفعل** مش بتتحسب على الحد
    await request(env.app).put(`/threads/${ids[0]}/pin`).set(a.auth).expect(204);
    // وبعد ما نشيل واحدة، الرابعة بتعدّي
    await request(env.app).delete(`/threads/${ids[0]}/pin`).set(a.auth).expect(204);
    await request(env.app).put(`/threads/${ids[3]}/pin`).set(a.auth).expect(204);
  });

  it("مش عضو = مايقدرش يثبّت", async () => {
    const a = await env.login("01096000007", "ز");
    const b = await env.login("01096000008", "ح");
    const outsider = await env.login("01096000009", "برّه");
    const g = await group(a, "مقفولة", [b.user.id]);
    await request(env.app).put(`/threads/${g.id}/pin`).set(outsider.auth).expect(403);
  });
});
