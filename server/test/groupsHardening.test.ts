import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as client } from "socket.io-client";
import { startTestEnv } from "./helpers.js";

/**
 * مراجعة الغرف والمحادثات الجماعية (١٢ أكتوبر). كل اختبار هنا بيغطّي ثغرة كانت
 * موجودة فعلًا — والنوع واحد: **الحارس موجود على مسار واحد وناقص على الباقي**،
 * فالقاعدة تبان مطبّقة وهي متخطّاة بخطوة واحدة.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const BAD = "كلمةممنوعة"; // من BANNED_WORDS في helpers

describe("فلتر الكلمات: كان على الإنشاء بس", () => {
  it("تعديل الرسالة لكلمة ممنوعة بيترفض (كان بيعدّي)", async () => {
    const a = await env.login("01090000001", "أ");
    const b = await env.login("01090000002", "ب");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    const m = (await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "كلام عادي" }).expect(201)).body;
    const r = await request(env.app).patch(`/messages/${m.id}`).set(a.auth).send({ text: `خد ${BAD}` }).expect(400);
    expect(r.body.code).toBe("objectionable");
    // والنص الأصلي ما اتغيّرش
    expect((await request(env.app).get(`/threads/${th.id}/messages`).set(a.auth)).body.at(-1).text).toBe("كلام عادي");
  });

  it("تغيير اسم الجروب لكلمة ممنوعة بيترفض (كان بيعدّي)", async () => {
    const a = await env.login("01090000003", "ج");
    const b = await env.login("01090000004", "د");
    const g = (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name: "شغل", memberIds: [b.user.id] }).expect(201)).body;
    expect((await request(env.app).patch(`/threads/${g.id}`).set(a.auth).send({ name: BAD }).expect(400)).body.code).toBe("objectionable");
  });

  it("اسم الغرفة الصوتية بيتفلتر (كان المكان الوحيد المكشوف)", async () => {
    const a = await env.login("01090000005", "هـ");
    expect((await request(env.app).post("/rooms").set(a.auth).send({ name: BAD }).expect(400)).body.code).toBe("objectionable");
    await request(env.app).post("/rooms").set(a.auth).send({ name: "غرفة الشغل" }).expect(201);
  });
});

describe("الجروب المتقيّد من الإدارة = متجمّد بالكامل", () => {
  it("مينفعش تعديل ولا حذف ولا تفاعل ولا تغيير اسم ولا إضافة أعضاء", async () => {
    const owner = await env.login("01090000010", "مالك");
    const mem = await env.login("01090000011", "عضو");
    const extra = await env.login("01090000012", "زيادة");
    const g = (await request(env.app).post("/threads").set(owner.auth).send({ type: "group", name: "جروب", memberIds: [mem.user.id] }).expect(201)).body;
    const msg = (await request(env.app).post(`/threads/${g.id}/messages`).set(mem.auth).send({ text: "رسالة" }).expect(201)).body;

    await env.ctx.db.thread.update({ where: { id: g.id }, data: { restrictedAt: new Date() } });

    await request(env.app).post(`/threads/${g.id}/messages`).set(mem.auth).send({ text: "تاني" }).expect(403); // كان متغطّى
    await request(env.app).patch(`/messages/${msg.id}`).set(mem.auth).send({ text: "معدّلة" }).expect(403);
    await request(env.app).put(`/messages/${msg.id}/reactions/${encodeURIComponent("👍")}`).set(mem.auth).expect(403);
    // والتفاعل ما اتسجّلش فعلًا: الفحص كان بعد الكتابة، فالرد ٤٠٣ والصف موجود
    expect(await env.ctx.db.reaction.count({ where: { messageId: msg.id } })).toBe(0);
    await request(env.app).delete(`/messages/${msg.id}`).set(mem.auth).expect(403);
    await request(env.app).patch(`/threads/${g.id}`).set(owner.auth).send({ name: "اسم جديد" }).expect(403);
    await request(env.app).post(`/threads/${g.id}/members`).set(owner.auth).send({ memberIds: [extra.user.id] }).expect(403);
  });
});

describe("العضوية والأدوار", () => {
  it("المالك اللي خرج ورجع لجروب عام يفضل مالك (كان بيتحوّل لعضو للأبد)", async () => {
    const owner = await env.login("01090000020", "مالك عام");
    const other = await env.login("01090000021", "تاني");
    const g = (await request(env.app).post("/threads").set(owner.auth).send({ type: "group", name: "عام", memberIds: [other.user.id], isPublic: true }).expect(201)).body;
    // لازم يبقى فيه مشرف تاني عشان يقدر يخرج
    await env.ctx.db.membership.update({ where: { threadId_userId: { threadId: g.id, userId: other.user.id } }, data: { role: "owner" } });

    await request(env.app).delete(`/threads/${g.id}/members/me`).set(owner.auth).expect(204);
    await request(env.app).post(`/threads/${g.id}/join`).set(owner.auth).expect(200);
    // الدليل: يقدر يغيّر الاسم تاني
    await request(env.app).patch(`/threads/${g.id}`).set(owner.auth).send({ name: "اسم المالك" }).expect(200);
  });

  it("آخر مشرف مايقدرش يسيب الجروب بلا مشرف", async () => {
    const owner = await env.login("01090000022", "مالك وحيد");
    const mem = await env.login("01090000023", "عضو عادي");
    const g = (await request(env.app).post("/threads").set(owner.auth).send({ type: "group", name: "بمالك واحد", memberIds: [mem.user.id] }).expect(201)).body;
    expect((await request(env.app).delete(`/threads/${g.id}/members/me`).set(owner.auth).expect(400)).body.code).toBe("last_owner");
    await request(env.app).delete(`/threads/${g.id}/members/me`).set(mem.auth).expect(204); // العضو عادي يخرج
  });

  it("المحادثة الفردية مالهاش «خروج» (كان بيخلي الطرف التاني يشوف «الحساب ده اتحذف»)", async () => {
    const a = await env.login("01090000024", "و");
    const b = await env.login("01090000025", "ز");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201)).body;
    expect((await request(env.app).delete(`/threads/${th.id}/members/me`).set(a.auth).expect(400)).body.code).toBe("not_group");
    // والطرف التاني لسه يقدر يبعت عادي
    await request(env.app).post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "أهلا" }).expect(201);
  });

  it("إضافة عضو بمعرّف مجهول بترفض بدل ما ترجّع ٢٠٠ في سكوت", async () => {
    const owner = await env.login("01090000026", "ح");
    const mem = await env.login("01090000027", "ط");
    const g = (await request(env.app).post("/threads").set(owner.auth).send({ type: "group", name: "إضافة", memberIds: [mem.user.id] }).expect(201)).body;
    const r = await request(env.app).post(`/threads/${g.id}/members`).set(owner.auth).send({ memberIds: ["مش-موجود"] }).expect(400);
    expect(r.body.code).toBe("unknown_member");
  });
});

describe("الحظر جوه الجروبات", () => {
  /**
   * مسار الإرسال كان بيفلتر الحاظرين، إنما **التعديل والتفاعل** كانوا بيبثّوا
   * للكل. والواجهة بتُدخل أي رسالة جاية من السوكت حتى لو ما شفتهاش قبل كده —
   * فاللي حظر حد كانت تظهر له رسالته كاملة بمجرد ما المحظور يعدّلها أو يتفاعل.
   * الاختبار على السوكت نفسه: القراءة بالـ HTTP كانت بتفلتر صح أصلًا، فهي
   * **مابتفرّقش** بين الكود القديم والجديد.
   */
  it("اللي حظر حد مايوصلوش تعديل ولا تفاعل منه على السوكت", async () => {
    const a = await env.login("01090000030", "حاظر");
    const b = await env.login("01090000031", "محظور");
    const c = await env.login("01090000032", "ثالث");
    const g = (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name: "مشترك", memberIds: [b.user.id, c.user.id] }).expect(201)).body;
    const m = (await request(env.app).post(`/threads/${g.id}/messages`).set(b.auth).send({ text: "رسالة من ب" }).expect(201)).body;
    await request(env.app).post("/blocks").set(a.auth).send({ userId: b.user.id }).expect(204);

    const sock = client(`http://localhost:${env.port}`, { auth: { token: a.token } });
    await new Promise<void>((r) => sock.on("connect", () => r()));
    const got: { ev: string; id: string }[] = [];
    for (const ev of ["message:new", "message:updated", "message:deleted"]) sock.on(ev, (p: { id: string }) => got.push({ ev, id: p.id }));

    await request(env.app).patch(`/messages/${m.id}`).set(b.auth).send({ text: "نص جديد" }).expect(200);
    await request(env.app).put(`/messages/${m.id}/reactions/${encodeURIComponent("👍")}`).set(b.auth).expect(200);
    // رسالة من الثالث: وصولها هو اللي يثبّت إن السوكت شغّال وإحنا مش بنقيس سكوت ميّت
    const mc = (await request(env.app).post(`/threads/${g.id}/messages`).set(c.auth).send({ text: "رسالة من ج" }).expect(201)).body;
    await new Promise<void>((r) => {
      const t = setInterval(() => { if (got.some((x) => x.id === mc.id)) { clearInterval(t); r(); } }, 20);
    });

    sock.close();
    expect(got.map((x) => x.id)).toContain(mc.id);
    expect(got.filter((x) => x.id === m.id)).toEqual([]);
  }, 20_000);
});
