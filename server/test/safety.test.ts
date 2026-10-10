import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);
const list = (r: any) => (r.body.items ?? r.body) as any[];

describe("أمان المحتوى (شروط المتاجر)", () => {
  it("الحظر: يمنع الخاص في الاتجاهين، يخفي الرسائل والستوريز، وإلغاء الحظر يرجّعهم", async () => {
    const a = await env.login("01093000001", "أنا"), b = await env.login("01093000002", "مزعج"), c = await env.login("01093000003", "صديق");
    const g = (await api().post("/threads").set(a.auth).send({ type: "group", name: "جروب", memberIds: [b.user.id, c.user.id] }).expect(201)).body;
    const dm = (await api().post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    await api().post(`/threads/${g.id}/messages`).set(b.auth).send({ text: "من المزعج" }).expect(201);
    await api().post(`/threads/${g.id}/messages`).set(c.auth).send({ text: "من الصديق" }).expect(201);
    await api().post("/stories").set(b.auth).send({ caption: "ستوري المزعج", colorFrom: "#112233", colorTo: "#445566" }).expect(201);

    await api().post("/blocks").send({ userId: b.user.id }).expect(401);
    await api().post("/blocks").set(a.auth).send({ userId: a.user.id }).expect(400);
    await api().post("/blocks").set(a.auth).send({ userId: "nope" }).expect(404);
    await api().post("/blocks").set(a.auth).send({ userId: b.user.id }).expect(204);
    await api().post("/blocks").set(a.auth).send({ userId: b.user.id }).expect(204); // idempotent
    expect((await api().get("/blocks").set(a.auth).expect(200)).body.map((x: any) => x.id)).toEqual([b.user.id]);

    const texts = list(await api().get(`/threads/${g.id}/messages`).set(a.auth)).map((m) => m.text);
    expect(texts).toContain("من الصديق"); expect(texts).not.toContain("من المزعج");
    expect(list(await api().get(`/threads/${g.id}/messages`).set(c.auth)).map((m) => m.text)).toContain("من المزعج"); // غيري يشوفه
    expect((await api().get("/stories").set(a.auth)).body.find((s: any) => s.caption === "ستوري المزعج")).toBeUndefined();
    await api().post(`/threads/${dm.id}/messages`).set(a.auth).send({ text: "x" }).expect(403); // أنا حاظره
    await api().post(`/threads/${dm.id}/messages`).set(b.auth).send({ text: "x" }).expect(403); // هو محظور
    await api().post("/threads").set(b.auth).send({ type: "dm", memberIds: [a.user.id] }).expect(403);

    await api().delete(`/blocks/${b.user.id}`).set(a.auth).expect(204);
    expect(list(await api().get(`/threads/${g.id}/messages`).set(a.auth)).map((m) => m.text)).toContain("من المزعج");
    await api().post(`/threads/${dm.id}/messages`).set(b.auth).send({ text: "رجعنا" }).expect(201);
  });

  it("فلتر المحتوى: الكلمات الممنوعة (حتى بتشكيل وهمزات) في الرسائل والاسم والستوري واسم الجروب", async () => {
    const a = await env.login("01093000011", "نضيف"), b = await env.login("01093000012", "ب");
    const g = (await api().post("/threads").set(a.auth).send({ type: "group", name: "ج", memberIds: [b.user.id] }).expect(201)).body;
    expect((await api().post(`/threads/${g.id}/messages`).set(a.auth).send({ text: "هذه كَلِمَةمَمنوعة هنا" }).expect(400)).body.code).toBe("objectionable");
    await api().post(`/threads/${g.id}/messages`).set(a.auth).send({ text: "this has a BadWord inside" }).expect(400);
    await api().post(`/threads/${g.id}/messages`).set(a.auth).send({ text: "كلام عادي" }).expect(201);
    await api().patch("/me").set(a.auth).send({ name: "badword" }).expect(400);
    await api().post("/stories").set(a.auth).send({ caption: "badword", colorFrom: "#112233", colorTo: "#445566" }).expect(400);
    await api().post("/threads").set(a.auth).send({ type: "group", name: "كلمةممنوعة", memberIds: [] }).expect(400);
  });
});
