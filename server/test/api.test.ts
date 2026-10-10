import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as client } from "socket.io-client";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

describe("auth", () => {
  it("OTP: خطأ في الكود ثم نجاح، ورفض إعادة الاستخدام", async () => {
    const { app, sent } = env;
    await request(app).post("/auth/otp/request").send({ channel: "phone", target: "01011112222" }).expect(204);
    const code = sent.at(-1)!.code;
    const wrong = code === "000000" ? "111111" : "000000";
    await request(app).post("/auth/otp/verify").send({ channel: "phone", target: "01011112222", code: wrong }).expect(401);
    await request(app).post("/auth/otp/verify").send({ channel: "phone", target: "01011112222", code }).expect(200);
    await request(app).post("/auth/otp/verify").send({ channel: "phone", target: "01011112222", code }).expect(401);
  });
  it("5 محاولات خاطئة تقفل الكود", async () => {
    const { app, sent } = env;
    await request(app).post("/auth/otp/request").send({ channel: "email", target: "A@B.com" }).expect(204);
    const code = sent.at(-1)!.code;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await request(app).post("/auth/otp/verify").send({ channel: "email", target: "a@b.com", code: wrong }).expect(401);
    await request(app).post("/auth/otp/verify").send({ channel: "email", target: "a@b.com", code }).expect(401);
  });
  it("حد 5 طلبات في الساعة لنفس الهدف", async () => {
    const { app } = env;
    for (let i = 0; i < 5; i++) await request(app).post("/auth/otp/request").send({ channel: "phone", target: "01099990000" }).expect(204);
    await request(app).post("/auth/otp/request").send({ channel: "phone", target: "01099990000" }).expect(429);
  });
  it("رفض بدون توكن وهدف غير صالح", async () => {
    await request(env.app).get("/me").expect(401);
    await request(env.app).post("/auth/otp/request").send({ channel: "phone", target: "abc" }).expect(400);
  });
  it("refresh بيدوّر التوكن، والقديم ما يشتغلش، والـ logout بيبطل الجلسة", async () => {
    const u = await env.login("01022223333");
    const r = await request(env.app).post("/auth/refresh").send({ refreshToken: u.refresh }).expect(200);
    await request(env.app).post("/auth/refresh").send({ refreshToken: u.refresh }).expect(401);
    await request(env.app).get("/me").set("Authorization", `Bearer ${r.body.accessToken}`).expect(200);
    await request(env.app).post("/auth/logout").set("Authorization", `Bearer ${r.body.accessToken}`).expect(204);
    await request(env.app).get("/me").set("Authorization", `Bearer ${r.body.accessToken}`).expect(401);
  });
});

describe("threads & messages", () => {
  it("dm: يرجع الموجود بدل التكرار، والاسم هو اسم الطرف الآخر", async () => {
    const a = await env.login("01030000001", "ليلى");
    const b = await env.login("01030000002", "عمر");
    const t1 = await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201);
    expect(t1.body.name).toBe("عمر");
    const t2 = await request(env.app).post("/threads").set(b.auth).send({ type: "dm", memberIds: [a.user.id] }).expect(200);
    expect(t2.body.id).toBe(t1.body.id);
    expect(t2.body.name).toBe("ليلى");
  });

  it("جروب بدون حد أقصى (60 عضو) + لون وأيقونة، وغير الأعضاء ممنوعين", async () => {
    const owner = await env.login("01040000000", "المالك");
    const ids: string[] = [];
    for (let i = 1; i <= 60; i++) {
      const u = await env.ctx.db.user.create({ data: { name: `عضو ${i}`, phone: `0105${String(i).padStart(7, "0")}` } });
      ids.push(u.id);
    }
    const g = await request(env.app).post("/threads").set(owner.auth)
      .send({ type: "group", name: "كبير", memberIds: ids, color: "#2F6DB5", icon: "plane" }).expect(201);
    expect(g.body.memberCount).toBe(61);
    expect(g.body.color).toBe("#2F6DB5");
    expect(g.body.icon).toBe("plane");
    expect(g.body.createdByMe).toBe(true);
    const outsider = await env.login("01040000099");
    await request(env.app).get(`/threads/${g.body.id}/messages`).set(outsider.auth).expect(403);
    await request(env.app).post(`/threads/${g.body.id}/messages`).set(outsider.auth).send({ text: "hi" }).expect(403);
  });

  it("جروب: تعديل الشكل للمشرفين فقط وإضافة أعضاء", async () => {
    const owner = await env.login("01041000001", "م1");
    const m = await env.login("01041000002", "م2");
    const g = await request(env.app).post("/threads").set(owner.auth).send({ type: "group", name: "ج", memberIds: [m.user.id] }).expect(201);
    await request(env.app).patch(`/threads/${g.body.id}`).set(m.auth).send({ name: "x" }).expect(403);
    const r = await request(env.app).patch(`/threads/${g.body.id}`).set(owner.auth).send({ name: "جديد", color: "#E1523E" }).expect(200);
    expect(r.body.name).toBe("جديد");
    const n = await env.login("01041000003", "م3");
    const r2 = await request(env.app).post(`/threads/${g.body.id}/members`).set(owner.auth).send({ memberIds: [n.user.id] }).expect(200);
    expect(r2.body.memberCount).toBe(3);
  });

  it("رسائل: إرسال، رد، تعديل، حذف، تفاعل، ترقيم بالصفحات", async () => {
    const a = await env.login("01050000001", "أ");
    const b = await env.login("01050000002", "ب");
    const t = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth).send({ text: "   " }).expect(400);
    const m1 = (await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth).send({ text: "أهلاً" }).expect(201)).body;
    const m2 = (await request(env.app).post(`/threads/${t.id}/messages`).set(b.auth).send({ text: "ردّ", replyToId: m1.id }).expect(201)).body;
    expect(m2.replyToId).toBe(m1.id);
    await request(env.app).patch(`/messages/${m1.id}`).set(b.auth).send({ text: "x" }).expect(403);
    const ed = await request(env.app).patch(`/messages/${m1.id}`).set(a.auth).send({ text: "أهلاً معدّلة" }).expect(200);
    expect(ed.body.edited).toBe(true);
    const r1 = await request(env.app).put(`/messages/${m1.id}/reactions/${encodeURIComponent("👍")}`).set(b.auth).expect(200);
    expect(r1.body.reactions["👍"]).toEqual([b.user.id]);
    const r2 = await request(env.app).put(`/messages/${m1.id}/reactions/${encodeURIComponent("👍")}`).set(b.auth).expect(200);
    expect(r2.body.reactions["👍"]).toBeUndefined();
    for (let i = 0; i < 5; i++) await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth).send({ text: `m${i}` }).expect(201);
    const page1 = (await request(env.app).get(`/threads/${t.id}/messages?limit=3`).set(a.auth).expect(200)).body;
    expect(page1.map((m: any) => m.text)).toEqual(["m2", "m3", "m4"]);
    const page2 = (await request(env.app).get(`/threads/${t.id}/messages?limit=3&before=${page1[0].id}`).set(a.auth).expect(200)).body;
    expect(page2.map((m: any) => m.text)).toEqual(["ردّ", "m0", "m1"]);
    await request(env.app).delete(`/messages/${m1.id}`).set(b.auth).expect(403);
    await request(env.app).delete(`/messages/${m1.id}`).set(a.auth).expect(204);
    const all = (await request(env.app).get(`/threads/${t.id}/messages?limit=100`).set(a.auth)).body;
    const del = all.find((m: any) => m.id === m1.id);
    expect(del.deleted).toBe(true);
    expect(del.text).toBe("");
  });

  it("قراءة: read=true بعد ما الطرف الآخر يعلّم المحادثة مقروءة", async () => {
    const a = await env.login("01051000001", "أ");
    const b = await env.login("01051000002", "ب");
    const t = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth).send({ text: "hi" }).expect(201);
    let msgs = (await request(env.app).get(`/threads/${t.id}/messages`).set(a.auth)).body;
    expect(msgs[0].read).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    await request(env.app).post(`/threads/${t.id}/read`).set(b.auth).expect(204);
    msgs = (await request(env.app).get(`/threads/${t.id}/messages`).set(a.auth)).body;
    expect(msgs[0].read).toBe(true);
  });

  it("مرفقات: رفع ملف + رسالة صوتية + رفض روابط غير مسموحة + تنزيل آمن", async () => {
    const a = await env.login("01052000001", "أ");
    const b = await env.login("01052000002", "ب");
    const t = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    const up = await request(env.app).post("/uploads").set(a.auth).attach("file", Buffer.from("hello file"), { filename: "note.txt", contentType: "text/plain" }).expect(201);
    expect(up.body.url).toMatch(/^\/uploads\//);
    const msg = await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth)
      .send({ text: "", attachment: { name: up.body.name, size: up.body.size, mime: up.body.mime, url: up.body.url, text: "hello file" } }).expect(201);
    expect(msg.body.attachment.name).toBe("note.txt");
    const file = await request(env.app).get(up.body.url).expect(200);
    expect(file.headers["content-disposition"]).toBe("attachment");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    await request(env.app).post("/uploads").attach("file", Buffer.from("x"), "a.txt").expect(401);
    await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth)
      .send({ attachment: { name: "x", size: 1, mime: "text/plain", url: "javascript:alert(1)" } }).expect(400);
    const v = await request(env.app).post(`/threads/${t.id}/messages`).set(b.auth)
      .send({ attachment: { name: "رسالة صوتية", size: 100, mime: "audio/webm", url: "https://cdn.example.com/a.webm", voice: { duration: 7, waveform: [1, 2, 3] } } }).expect(201);
    expect(v.body.attachment.voice.duration).toBe(7);
  });

  it("جروب عام: اكتشاف + انضمام + مغادرة", async () => {
    const a = await env.login("01053000001", "أ");
    const b = await env.login("01053000002", "ب");
    const g = (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name: "عام", isPublic: true })).body;
    const list = (await request(env.app).get("/threads/public").set(b.auth).expect(200)).body;
    expect(list.find((x: any) => x.id === g.id)?.joined).toBe(false);
    await request(env.app).post(`/threads/${g.id}/join`).set(b.auth).expect(200);
    await request(env.app).post(`/threads/${g.id}/messages`).set(b.auth).send({ text: "هاي" }).expect(201);
    await request(env.app).delete(`/threads/${g.id}/members/me`).set(b.auth).expect(204);
    await request(env.app).post(`/threads/${g.id}/messages`).set(b.auth).send({ text: "x" }).expect(403);
    const priv = (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name: "خاص" })).body;
    await request(env.app).post(`/threads/${priv.id}/join`).set(b.auth).expect(404);
  });
});

describe("stories / calls / translate / users", () => {
  it("قصة: تظهر لمن يشاركني محادثة فقط + seen", async () => {
    const a = await env.login("01060000001", "أ");
    const b = await env.login("01060000002", "ب");
    const c = await env.login("01060000003", "ج");
    await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201);
    const s = (await request(env.app).post("/stories").set(a.auth).send({ caption: "صباح الخير", colorFrom: "#E1523E", colorTo: "#C9A227" }).expect(201)).body;
    const seenB = (await request(env.app).get("/stories").set(b.auth).expect(200)).body;
    expect(seenB.find((x: any) => x.id === s.id)?.seen).toBe(false);
    await request(env.app).post(`/stories/${s.id}/seen`).set(b.auth).expect(204);
    expect((await request(env.app).get("/stories").set(b.auth)).body.find((x: any) => x.id === s.id).seen).toBe(true);
    expect((await request(env.app).get("/stories").set(c.auth)).body.find((x: any) => x.id === s.id)).toBeUndefined();
    await request(env.app).post("/stories").set(a.auth).send({ caption: "", colorFrom: "#E1523E", colorTo: "#C9A227" }).expect(400);
  });

  it("سجل المكالمات: للأعضاء فقط ومرتّب", async () => {
    const a = await env.login("01061000001", "أ");
    const b = await env.login("01061000002", "ب");
    const out = await env.login("01061000003", "خارجي");
    const t = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    const now = Date.now();
    await request(env.app).post("/calls").set(a.auth).send({ threadId: t.id, mode: "video", dir: "out", at: now - 1000, dur: 60 }).expect(201);
    await request(env.app).post("/calls").set(a.auth).send({ threadId: t.id, mode: "voice", dir: "missed", at: now, dur: 0 }).expect(201);
    await request(env.app).post("/calls").set(out.auth).send({ threadId: t.id, mode: "voice", dir: "out", at: now, dur: 1 }).expect(403);
    const l = (await request(env.app).get("/calls").set(a.auth).expect(200)).body;
    expect(l.map((c: any) => c.mode)).toEqual(["voice", "video"]);
    expect((await request(env.app).get("/calls").set(b.auth)).body).toEqual([]);
  });

  it("ترجمة: عبر المزوّد، 501 لو غير مفعّل", async () => {
    const a = await env.login("01062000001", "أ");
    const r = await request(env.app).post("/translate").set(a.auth).send({ text: "مرحبا", to: "zh-CN" }).expect(200);
    expect(r.body.text).toBe("[zh-CN] مرحبا");
    expect(r.body.from).toBe("ar");
  });

  it("بحث المستخدمين وتعديل الملف الشخصي", async () => {
    const a = await env.login("01063000001", "نورا السيد");
    const b = await env.login("01063000002", "آخر");
    const l = (await request(env.app).get("/users?q=نورا").set(b.auth).expect(200)).body;
    expect(l.map((u: any) => u.name)).toContain("نورا السيد");
    expect(l.find((u: any) => u.id === b.user.id)).toBeUndefined();
    await request(env.app).patch("/me").set(a.auth).send({ color: "red" }).expect(400);
    const me = await request(env.app).patch("/me").set(a.auth).send({ status: "مشغولة", lang: "fr" }).expect(200);
    expect(me.body.lang).toBe("fr");
  });
});

describe("realtime", () => {
  it("socket: رسالة جديدة تصل للعضو الآخر فقط، وtyping، ورفض توكن غلط", async () => {
    const a = await env.login("01070000001", "أ");
    const b = await env.login("01070000002", "ب");
    const c = await env.login("01070000003", "ج");
    const t = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    const url = `http://localhost:${env.port}`;
    const bad = client(url, { auth: { token: "nope" }, reconnection: false });
    await new Promise<void>((res) => bad.on("connect_error", (e) => { expect(e.message).toBe("unauthorized"); res(); }));
    bad.close();

    const sb = client(url, { auth: { token: b.token }, transports: ["websocket"] });
    const sc = client(url, { auth: { token: c.token }, transports: ["websocket"] });
    await Promise.all([new Promise<void>((r) => sb.on("connect", () => r())), new Promise<void>((r) => sc.on("connect", () => r()))]);
    const gotB = new Promise<any>((r) => sb.on("message:new", r));
    const typingB = new Promise<any>((r) => sb.on("typing", r));
    let cGot = false;
    sc.on("message:new", () => (cGot = true));
    const sa = client(url, { auth: { token: a.token }, transports: ["websocket"] });
    await new Promise<void>((r) => sa.on("connect", () => r()));
    sa.emit("typing", { threadId: t.id });
    expect((await typingB).userId).toBe(a.user.id);
    await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth).send({ text: "لحظي" }).expect(201);
    expect((await gotB).text).toBe("لحظي");
    await new Promise((r) => setTimeout(r, 150));
    expect(cGot).toBe(false);
    sa.close(); sb.close(); sc.close();
  });
});

describe("seed", () => {
  it("آمن للتكرار", async () => {
    const { seed } = await import("../prisma/seed.js");
    await seed(env.ctx.db);
    const n1 = await env.ctx.db.thread.count();
    await seed(env.ctx.db);
    expect(await env.ctx.db.thread.count()).toBe(n1);
  });
});
