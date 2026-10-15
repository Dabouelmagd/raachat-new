import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
let owner: Awaited<ReturnType<typeof env.login>>;
beforeAll(async () => { env = await startTestEnv(); owner = await env.login("01099000001", "داليا"); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);

async function world(tag: string) {
  const a = await env.login(`0109700${tag}1`, "مبلِّغ");
  const b = await env.login(`0109700${tag}2`, "مسيء");
  const c = await env.login(`0109700${tag}3`, "غريب");
  const th = (await api().post("/threads").set(b.auth).send({ type: "group", name: "جروب", memberIds: [a.user.id] }).expect(201)).body;
  const msg = (await api().post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "كلام مسيء" }).expect(201)).body;
  return { a, b, c, th, msg };
}
const staff = async (phone: string, key: string) => {
  const roles = (await api().get("/admin/roles").set(owner.auth)).body as { id: string; key: string }[];
  await api().post("/admin/staff").set(owner.auth).send({ contact: phone, roleId: roles.find((r) => r.key === key)!.id }).expect(201);
  return env.login(phone);
};

describe("البلاغات", () => {
  it("المستخدم يبلّغ عن رسالة في جروبه، وغير العضو ما يعرفش إنها موجودة، وتكرار البلاغ نفس السجل", async () => {
    const w = await world("1");
    await api().post("/reports").send({ kind: "message", targetId: w.msg.id, reason: "abuse" }).expect(401);
    await api().post("/reports").set(w.c.auth).send({ kind: "message", targetId: w.msg.id, reason: "abuse" }).expect(404);
    await api().post("/reports").set(w.b.auth).send({ kind: "message", targetId: w.msg.id, reason: "abuse" }).expect(400); // نفسه
    const r1 = await api().post("/reports").set(w.a.auth).send({ kind: "message", targetId: w.msg.id, reason: "abuse", note: "شتيمة" }).expect(201);
    const r2 = await api().post("/reports").set(w.a.auth).send({ kind: "message", targetId: w.msg.id, reason: "spam" }).expect(201);
    expect(r2.body.id).toBe(r1.body.id);
    await api().post("/reports").set(w.a.auth).send({ kind: "message", targetId: w.msg.id, reason: "غلط" }).expect(400);
  });

  it("المشرف يشوف البلاغ بنسخة النص، والمستخدم العادي يتمنع، والمحاسب ما يشوفش", async () => {
    const w = await world("2");
    await api().post("/reports").set(w.a.auth).send({ kind: "message", targetId: w.msg.id, reason: "abuse" }).expect(201);
    await api().get("/admin/reports").set(w.a.auth).expect(403);
    const acc = await staff("01097000090", "accountant");
    await api().get("/admin/reports").set(acc.auth).expect(403);
    const mod = await staff("01097000091", "moderator");
    const list = (await api().get("/admin/reports").set(mod.auth).expect(200)).body;
    const rep = list.find((x: any) => x.targetId === w.msg.id);
    expect(rep).toMatchObject({ kind: "message", target: "مسيء", text: "كلام مسيء", reporter: "مبلِّغ", status: "open" });
  });

  it("حذف + حظر: الرسالة تتمسح، صاحبها يتحظر وجلسته تتقفل، وكل البلاغات على نفس الهدف تتقفل", async () => {
    const w = await world("3");
    const d = await env.login("0109700393", "مبلّغ تاني");
    await api().post(`/threads/${w.th.id}/members`).set(w.b.auth).send({ memberIds: [d.user.id] });
    await api().post("/reports").set(w.a.auth).send({ kind: "message", targetId: w.msg.id, reason: "abuse" }).expect(201);
    await api().post("/reports").set(d.auth).send({ kind: "message", targetId: w.msg.id, reason: "abuse" }).expect(201);
    const mod = await staff("01097000092", "moderator"); // مشرف بدون users.manage
    const id = (await api().get("/admin/reports").set(mod.auth)).body.find((x: any) => x.targetId === w.msg.id).id;
    expect((await api().get("/admin/reports").set(mod.auth)).body.find((x: any) => x.id === id).count).toBe(2);
    await api().post(`/admin/reports/${id}/resolve`).set(mod.auth).send({ action: "delete_ban" }).expect(403);
    await api().post(`/admin/reports/${id}/resolve`).set(owner.auth).send({ action: "delete_ban" }).expect(200);
    const msgs = (await api().get(`/threads/${w.th.id}/messages`).set(w.a.auth).expect(200)).body;
    expect((msgs.items ?? msgs).find((m: any) => m.id === w.msg.id).deleted).toBe(true);
    await api().get("/threads").set(w.b.auth).expect(401); // الجلسة اتقفلت
    await api().post(`/admin/reports/${id}/resolve`).set(owner.auth).send({ action: "dismiss" }).expect(400); // اتعالج قبل كده
    const open = (await api().get("/admin/reports?status=open").set(owner.auth)).body;
    expect(open.find((x: any) => x.targetId === w.msg.id)).toBeUndefined();
    const done = (await api().get("/admin/reports?status=resolved").set(owner.auth)).body.filter((x: any) => x.targetId === w.msg.id);
    expect(done).toHaveLength(2);
    const audit = (await api().get("/admin/audit").set(owner.auth)).body;
    expect(audit.some((x: any) => x.what === "حذف محتوى وحظر صاحبه")).toBe(true);
  });

  it("تحذير يبعت إشعار، وتجاهل ما يغيّرش المحتوى، وStory تتحذف من البلاغ، وغرفة تتقفل", async () => {
    const w = await world("4");
    await api().post("/push/subscribe").set(w.b.auth).send({ endpoint: "https://push.example/b", keys: { p256dh: "p", auth: "a" } }).expect(204);
    const st = (await api().post("/stories").set(w.b.auth).send({ caption: "احتيال", colorFrom: "#112233", colorTo: "#445566" }).expect(201)).body;
    const room = (await api().post("/rooms").set(w.b.auth).send({ name: "غرفة مسيئة" }).expect(201)).body;
    const rs = await Promise.all([
      api().post("/reports").set(w.a.auth).send({ kind: "message", targetId: w.msg.id, reason: "spam" }),
      api().post("/reports").set(w.a.auth).send({ kind: "story", targetId: st.id, reason: "scam" }),
      api().post("/reports").set(w.a.auth).send({ kind: "room", targetId: room.id, reason: "inappropriate" }),
    ]);
    rs.forEach((x) => expect(x.status).toBe(201));
    const list = (await api().get("/admin/reports").set(owner.auth)).body;
    const idOf = (kind: string, tid: string) => list.find((x: any) => x.kind === kind && x.targetId === tid).id;
    await api().post(`/admin/reports/${idOf("message", w.msg.id)}/resolve`).set(owner.auth).send({ action: "warn" }).expect(200);
    expect(env.pushed.some((p) => p.sub.endpoint === "https://push.example/b" && p.payload.kind === "notice")).toBe(true);
    await api().post(`/admin/reports/${idOf("story", st.id)}/resolve`).set(owner.auth).send({ action: "delete" }).expect(200);
    expect((await api().get("/admin/stories").set(owner.auth)).body.find((x: any) => x.id === st.id)).toBeUndefined();
    await api().post(`/admin/reports/${idOf("room", room.id)}/resolve`).set(owner.auth).send({ action: "delete" }).expect(200);
    expect((await api().get("/rooms").set(w.a.auth)).body.find((x: any) => x.id === room.id)).toBeUndefined();
    const m = (await api().get(`/threads/${w.th.id}/messages`).set(w.a.auth)).body;
    expect((m.items ?? m).find((x: any) => x.id === w.msg.id).deleted).toBe(false); // التحذير ما حذفش
  });

  it("بلاغ عن مستخدم: حذف عادي مرفوض، وStories اللوحة بتعدّ البلاغات، والحد اليومي", async () => {
    const w = await world("5");
    const rep = (await api().post("/reports").set(w.a.auth).send({ kind: "user", targetId: w.b.user.id, reason: "impersonation" }).expect(201)).body;
    await api().post(`/admin/reports/${rep.id}/resolve`).set(owner.auth).send({ action: "delete" }).expect(400);
    await api().post(`/admin/reports/${rep.id}/resolve`).set(owner.auth).send({ action: "dismiss" }).expect(200);
    const sum = (await api().get("/admin/reports/summary").set(owner.auth)).body;
    expect(sum.resolved).toBeGreaterThan(0);
    // حد ٢٠ بلاغ/يوم
    const spammer = await env.login("01097000599", "كتير");
    const users = await Promise.all(Array.from({ length: 21 }, (_, i) => env.login(`0109760${String(i).padStart(4, "0")}`, `u${i}`)));
    let last = 201;
    for (const u of users) { last = (await api().post("/reports").set(spammer.auth).send({ kind: "user", targetId: u.user.id, reason: "spam" })).status; }
    expect(last).toBe(429);

    // **والحد العادي لمّا يمتلي مايقفلش بلاغ سلامة الأطفال** — لو حد عمل ٢٠ بلاغ
    // سبام النهاردة، مينفعش ده يكون السبب اللي يمنعه من الإبلاغ عن إيذاء طفل.
    const kid = await env.login("01097000598", "هدف");
    await api().post("/reports").set(spammer.auth).send({ kind: "user", targetId: kid.user.id, reason: "child_safety" }).expect(201);
  });

  /**
   * **سبب `child_safety` ومساره** — بلاي بتطلب مسار إبلاغ صريح لـ CSAE،
   * و`community.html` بيوعد بالإجراء «من أول بلاغ وبأقصى درجة». قبل ١٥ أكتوبر
   * مكانش فيه غير «غير لائق» و«سبب آخر»، فالبلاغ كان بيقع في طابور السبام.
   */
  describe("بلاغات سلامة الأطفال", () => {
    it("السبب مقبول ومتسجّل بالاسم", async () => {
      const w = await world("6");
      const rep = (await api().post("/reports").set(w.a.auth)
        .send({ kind: "message", targetId: w.msg.id, reason: "child_safety", note: "محتوى يمسّ طفل" }).expect(201)).body;
      const row = await env.ctx.db.report.findUnique({ where: { id: rep.id }, select: { reason: true } });
      expect(row?.reason).toBe("child_safety");
    });

    it("**في أول طابور اللوحة** مهما كان فيه بلاغات أحدث منه", async () => {
      const w = await world("7");
      const viewer = await staff("01097000701", "moderator");
      // بلاغ سلامة أطفال **الأول**، وبعده بلاغات أحدث منه
      await api().post("/reports").set(w.a.auth).send({ kind: "message", targetId: w.msg.id, reason: "child_safety" }).expect(201);
      for (let i = 0; i < 3; i++) {
        const u = await env.login(`010977001${i}`, `ح${i}`);
        await api().post("/reports").set(w.a.auth).send({ kind: "user", targetId: u.user.id, reason: "spam" }).expect(201);
      }
      const rows = (await api().get("/admin/reports").set(viewer.auth).expect(200)).body as { reason: string }[];
      expect(rows.length).toBeGreaterThan(3);
      // بالترتيب الزمني لوحده كان هيبقى رابعًا؛ دلوقتي أول واحد
      expect(rows[0]!.reason).toBe("child_safety");
    });

    it("والحد الأقصى للطابور مابيتعدّاش بسببه", async () => {
      const viewer = await staff("01097000702", "moderator");
      const rows = (await api().get("/admin/reports?limit=2").set(viewer.auth).expect(200)).body as unknown[];
      expect(rows.length).toBeLessThanOrEqual(2);
    });
  });
});
