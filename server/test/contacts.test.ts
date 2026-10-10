import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);

describe("مطابقة جهات الاتصال", () => {
  it("يطابق بصيغ مختلفة، يستثني نفسي والمحظور، ومحتاج تسجيل دخول", async () => {
    const me = await env.login("01095000001", "أنا"), a = await env.login("01095000002", "صديق"), b = await env.login("01095000003", "محظور");
    await api().post("/contacts/match").send({ phones: ["01095000002"] }).expect(401);
    await api().post("/blocks").set(me.auth).send({ userId: b.user.id }).expect(204);
    const r = (await api().post("/contacts/match").set(me.auth).send({ phones: ["+20 109 5000002", "01095000001", "01095000003", "01000000000"] }).expect(200)).body;
    expect(r.onApp.map((u: any) => u.id)).toEqual([a.user.id]);
    expect(r.onApp[0]).not.toHaveProperty("phone");
    expect(r.notOnApp).toEqual(expect.arrayContaining(["01095000001", "01095000003", "01000000000"]));
    expect(r.notOnApp).not.toContain("+20 109 5000002");
  });
});
