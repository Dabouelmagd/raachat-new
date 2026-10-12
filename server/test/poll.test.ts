import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

/**
 * الاستطلاعات. الاستطلاع **رسالة** جوّاها `Poll`، فالحوارس المفروض تكون موروثة
 * من مسار الرسايل — والاختبارات دي بتثبّت ده فعلًا مش بالنية.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const BAD = "كلمةممنوعة"; // من BANNED_WORDS في helpers

type Auth = { auth: Record<string, string> };
type PollMsg = { id: string; poll: { question: string; multi: boolean; closed: boolean; options: { id: string; text: string; voterIds: string[] }[] } };

const group = async (a: Auth, name: string, ids: string[]) =>
  (await request(env.app).post("/threads").set(a.auth).send({ type: "group", name, memberIds: ids }).expect(201)).body;

const makePoll = async (a: Auth, threadId: string, body: Record<string, unknown>, code = 201) =>
  (await request(env.app).post(`/threads/${threadId}/polls`).set(a.auth).send(body).expect(code)).body as PollMsg;

const vote = (a: Auth, msgId: string, optionIds: string[], code = 200) =>
  request(env.app).post(`/messages/${msgId}/poll/vote`).set(a.auth).send({ optionIds }).expect(code);

describe("الاستطلاعات", () => {
  it("إنشاء وتصويت: الصوت بيتسجّل والاختيار الواحد بيستبدل اللي قبله", async () => {
    const a = await env.login("01097000001", "صاحب الاستطلاع");
    const b = await env.login("01097000002", "مصوّت");
    const g = await group(a, "جروب الاستطلاع", [b.user.id]);
    const msg = await makePoll(a, g.id, { question: "نتقابل إمتى؟", options: ["الجمعة", "السبت"] });
    expect(msg.poll.question).toBe("نتقابل إمتى؟");
    expect(msg.poll.options).toHaveLength(2);

    const [fri, sat] = msg.poll.options;
    const r1 = (await vote(b, msg.id, [fri!.id])).body as PollMsg;
    expect(r1.poll.options.find((o) => o.id === fri!.id)!.voterIds).toEqual([b.user.id]);

    // اختيار تاني = **استبدال** مش صوت زيادة
    const r2 = (await vote(b, msg.id, [sat!.id])).body as PollMsg;
    expect(r2.poll.options.find((o) => o.id === fri!.id)!.voterIds).toEqual([]);
    expect(r2.poll.options.find((o) => o.id === sat!.id)!.voterIds).toEqual([b.user.id]);

    // الاستطلاع بيرجع كامل مع رسايل المحادثة
    const list = (await request(env.app).get(`/threads/${g.id}/messages`).set(b.auth).expect(200)).body as PollMsg[];
    expect(list.at(-1)!.poll.options.find((o) => o.id === sat!.id)!.voterIds).toEqual([b.user.id]);
  });

  it("الاختيار الواحد بيرفض أكتر من إجابة، والمتعدد بيقبلها", async () => {
    const a = await env.login("01097000003", "ج");
    const b = await env.login("01097000004", "د");
    const g = await group(a, "جروب ٢", [b.user.id]);
    const single = await makePoll(a, g.id, { question: "لون واحد؟", options: ["أحمر", "أخضر"] });
    const r = await vote(b, single.id, single.poll.options.map((o) => o.id), 400);
    expect(r.body.code).toBe("single_choice");

    const multi = await makePoll(a, g.id, { question: "ألوان؟", options: ["أحمر", "أخضر"], multi: true });
    const out = (await vote(b, multi.id, multi.poll.options.map((o) => o.id))).body as PollMsg;
    expect(out.poll.options.every((o) => o.voterIds.includes(b.user.id))).toBe(true);
    expect(out.poll.multi).toBe(true);
  });

  it("المقفول مابيقبلش تصويت، والقفل لصاحبه بس", async () => {
    const a = await env.login("01097000005", "هـ");
    const b = await env.login("01097000006", "و");
    const g = await group(a, "جروب ٣", [b.user.id]);
    const msg = await makePoll(a, g.id, { question: "نقفل؟", options: ["أيوه", "لأ"] });

    // عضو عادي مش صاحبه = مايقدرش يقفل
    await request(env.app).post(`/messages/${msg.id}/poll/close`).set(b.auth).expect(403);
    await vote(b, msg.id, [msg.poll.options[0]!.id]);

    const closed = (await request(env.app).post(`/messages/${msg.id}/poll/close`).set(a.auth).expect(200)).body as PollMsg;
    expect(closed.poll.closed).toBe(true);
    const r = await vote(b, msg.id, [msg.poll.options[1]!.id], 400);
    expect(r.body.code).toBe("poll_closed");
    // والصوت القديم فاضل زي ما هو
    expect(closed.poll.options[0]!.voterIds).toEqual([b.user.id]);
  });

  it("اختيار من استطلاع تاني بيترفض", async () => {
    const a = await env.login("01097000007", "ز");
    const b = await env.login("01097000008", "ح");
    const g = await group(a, "جروب ٤", [b.user.id]);
    const p1 = await makePoll(a, g.id, { question: "الأول؟", options: ["١", "٢"] });
    const p2 = await makePoll(a, g.id, { question: "التاني؟", options: ["٣", "٤"] });
    const r = await vote(b, p1.id, [p2.poll.options[0]!.id], 400);
    expect(r.body.code).toBe("bad_option");
  });

  it("مش عضو = لا إنشاء ولا تصويت", async () => {
    const a = await env.login("01097000009", "ط");
    const b = await env.login("01097000010", "ظ");
    const outsider = await env.login("01097000011", "برّه");
    const g = await group(a, "جروب مقفول", [b.user.id]);
    const msg = await makePoll(a, g.id, { question: "سؤال", options: ["أ", "ب"] });
    await request(env.app).post(`/threads/${g.id}/polls`).set(outsider.auth).send({ question: "س", options: ["أ", "ب"] }).expect(403);
    await vote(outsider, msg.id, [msg.poll.options[0]!.id], 403);
  });

  it("الاختيارات متفلترة زي السؤال، والمكرر بيترفض", async () => {
    const a = await env.login("01097000012", "ي");
    const b = await env.login("01097000013", "ك");
    const g = await group(a, "جروب ٥", [b.user.id]);
    // الكلمة الممنوعة في **اختيار** مش في السؤال — المسار اللي بينساه الناس
    const r = await request(env.app).post(`/threads/${g.id}/polls`).set(a.auth).send({ question: "سؤال نظيف", options: ["عادي", `خد ${BAD}`] }).expect(400);
    expect(r.body.code).toBe("objectionable");
    const dup = await request(env.app).post(`/threads/${g.id}/polls`).set(a.auth).send({ question: "سؤال", options: ["نفس الكلام", "نفس الكلام"] }).expect(400);
    expect(dup.body.code).toBe("duplicate_options");
    await request(env.app).post(`/threads/${g.id}/polls`).set(a.auth).send({ question: "سؤال", options: ["واحد"] }).expect(400);
  });

  it("الجروب المتقيّد: لا استطلاع جديد ولا تصويت", async () => {
    const a = await env.login("01097000014", "ل");
    const b = await env.login("01097000015", "م");
    const g = await group(a, "جروب هيتقيّد", [b.user.id]);
    const msg = await makePoll(a, g.id, { question: "قبل التقييد", options: ["أ", "ب"] });
    await env.ctx.db.thread.update({ where: { id: g.id }, data: { restrictedAt: new Date() } });
    await request(env.app).post(`/threads/${g.id}/polls`).set(a.auth).send({ question: "بعد التقييد", options: ["أ", "ب"] }).expect(403);
    await vote(b, msg.id, [msg.poll.options[0]!.id], 403);
    // والرفض مابيسيبش صوت متسجّل
    const after = (await request(env.app).get(`/threads/${g.id}/messages`).set(a.auth).expect(200)).body as PollMsg[];
    expect(after.at(-1)!.poll.options.every((o) => o.voterIds.length === 0)).toBe(true);
  });
});
