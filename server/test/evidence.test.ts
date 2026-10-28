/**
 * سجل أدلة بلاغات إيذاء الأطفال.
 *
 * 🔴 العطل اللي الاختبارات دي موجودة عشانه (مذكرة المحامي ٢١ أكتوبر ٢٠٢٦):
 * `Report.snippet` **نصّ مقصوص بس**، فالملف المبلَّغ عنه — وهو الدليل الحقيقي —
 * كان بيتمسح خلال ساعات من تلات طرق (كنس الستوري · إجراء المشرف · كنس الملفات
 * اليتيمة) ومحدش حافظه في أي مكان.
 *
 * **والفحص الحاسم مش «فيه صفّ في جدول الأدلة»** — ده بيعدّي على سجل فاضي.
 * الفحص إننا نمسح المصدر فعلًا (كنس أو إجراء مشرف) وبعدها **نفتح الدليل
 * ونقارن البايتات بالأصل**. ده الفرق بين «محفوظ» و«مكتوب في جدول».
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { startTestEnv } from "./helpers.js";
import { retentionSweep } from "../src/lib/retention.js";
import { openEvidence, sealEvidence, sha256 } from "../src/lib/evidence.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
let owner: Awaited<ReturnType<typeof env.login>>;
beforeAll(async () => { env = await startTestEnv(); owner = await env.login("01099000001", "داليا"); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);
const api = () => request(env.app);

/** بايتات مش نصّية عن قصد — الأدلة صور وفيديو */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x11, 0xff, 0xfe, 0x42]);

/** بيرفع ملف حقيقي على القرص ويرجّع رابطه */
async function upload(auth: Record<string, string>, bytes = PNG) {
  const r = await api().post("/uploads").set(auth).attach("file", bytes, "proof.png").expect(201);
  return r.body.url as string;
}
const onDisk = (url: string) => path.join(env.ctx.config.UPLOAD_DIR, path.basename(url));

const openIt = (ev: { blob: Uint8Array | null; iv: Uint8Array | null; tag: Uint8Array | null }) =>
  openEvidence(env.ctx.config.EVIDENCE_KEY!, Buffer.from(ev.blob!), Buffer.from(ev.iv!), Buffer.from(ev.tag!));

describe("تشفير سجل الأدلة", () => {
  it("معايرة: الدورة كاملة، والمفتاح الغلط بيترفض", () => {
    const { blob, iv, tag } = sealEvidence("k1", PNG);
    expect(Buffer.from(blob).equals(PNG)).toBe(false); // مش نفس المدخل = تشفير فعلًا
    expect(openEvidence("k1", blob, iv, tag).equals(PNG)).toBe(true);
    // GCM بيتحقق من السلامة — من غير ده التشفير مابيحميش حاجة
    expect(() => openEvidence("k2", blob, iv, tag)).toThrow();
  });

  it("البصمة على الأصل مش على المشفّر (إثبات سلامة الدليل وقت التسليم)", () => {
    const a = sealEvidence("k", PNG), b = sealEvidence("k", PNG);
    // نفس الملف بيتشفّر مرتين مختلفتين (IV عشوائي) — فالبصمة لازم تبقى على الأصل
    expect(Buffer.from(a.blob).equals(Buffer.from(b.blob))).toBe(false);
    expect(sha256(PNG)).toBe(sha256(PNG));
  });
});

describe("حفظ الدليل وقت البلاغ", () => {
  it("🔴 ستوري مبلَّغ عنها: الكنس بيمسح الصف والصورة من القرص — والدليل بيفضل مفتوحًا", async () => {
    const a = await env.login("01081100001", "مبلِّغة");
    const b = await env.login("01081100002", "مسيء");
    const url = await upload(b.auth);
    expect(fs.existsSync(onDisk(url))).toBe(true);
    const st = (await api().post("/stories").set(b.auth).send({ caption: "نص الستوري", colorFrom: "#111111", colorTo: "#222222", imageUrl: url }).expect(201)).body;

    await api().post("/reports").set(a.auth).send({ kind: "story", targetId: st.id, reason: "child_safety" }).expect(201);

    // الكنس بيشيل الستوري **والصورة من القرص** — ده المسار الحقيقي اللي كان بياكل الدليل
    await env.ctx.db.story.update({ where: { id: st.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await retentionSweep(env.ctx, "on");
    expect(await env.ctx.db.story.count({ where: { id: st.id } })).toBe(0);
    expect(fs.existsSync(onDisk(url))).toBe(false);

    // ومع كده الدليل كامل: البايتات بالظبط + البصمة + نصّ المحضر
    const ev = await env.ctx.db.evidence.findUnique({ where: { kind_targetId: { kind: "story", targetId: st.id } } });
    expect(ev, "مفيش سجل دليل أصلًا").toBeTruthy();
    expect(ev!.problem).toBe("");
    expect(openIt(ev!).equals(PNG)).toBe(true);
    expect(ev!.sha256).toBe(sha256(PNG));
    expect(ev!.text).toBe("نص الستوري");
  });

  it("🔴 رسالة بمرفق: إجراء المشرف بيمسح المرفق — والدليل بيفضل مفتوحًا", async () => {
    const a = await env.login("01081100011", "مبلِّغ");
    const b = await env.login("01081100012", "مسيء");
    const th = (await api().post("/threads").set(b.auth).send({ type: "group", name: "ج", memberIds: [a.user.id] }).expect(201)).body;
    const url = await upload(b.auth);
    const msg = (await api().post(`/threads/${th.id}/messages`).set(b.auth)
      .send({ text: "كلام", attachment: { name: "proof.png", size: PNG.length, mime: "image/png", url } }).expect(201)).body;

    await api().post("/reports").set(a.auth).send({ kind: "message", targetId: msg.id, reason: "child_safety" }).expect(201);

    const rep = (await api().get("/admin/reports").set(owner.auth).expect(200)).body.find((x: { targetId: string }) => x.targetId === msg.id);
    await api().post(`/admin/reports/${rep.id}/resolve`).set(owner.auth).send({ action: "delete" }).expect(200);
    expect(await env.ctx.db.attachment.count({ where: { messageId: msg.id } })).toBe(0); // المرفق راح

    const ev = await env.ctx.db.evidence.findUnique({ where: { kind_targetId: { kind: "message", targetId: msg.id } } });
    expect(ev, "مفيش سجل دليل للرسالة").toBeTruthy();
    expect(openIt(ev!).equals(PNG)).toBe(true);
    expect(ev!.fileName).toBe("proof.png");
    expect(ev!.fileMime).toBe("image/png");
  });

  it("🔴 بلاغ عادي مابيحفظش أي ملف — مابنكدّسش مرفقات الناس", async () => {
    const a = await env.login("01081100021", "مبلِّغ");
    const b = await env.login("01081100022", "حد");
    const th = (await api().post("/threads").set(b.auth).send({ type: "group", name: "ج", memberIds: [a.user.id] }).expect(201)).body;
    const url = await upload(b.auth);
    const msg = (await api().post(`/threads/${th.id}/messages`).set(b.auth)
      .send({ text: "سبام", attachment: { name: "x.png", size: PNG.length, mime: "image/png", url } }).expect(201)).body;
    await api().post("/reports").set(a.auth).send({ kind: "message", targetId: msg.id, reason: "spam" }).expect(201);
    expect(await env.ctx.db.evidence.count({ where: { targetId: msg.id } })).toBe(0);
  });

  it("النصّ بيتحفظ كامل مش مقصوص زي snippet", async () => {
    const a = await env.login("01081100031", "مبلِّغة");
    const b = await env.login("01081100032", "مسيء");
    const th = (await api().post("/threads").set(b.auth).send({ type: "group", name: "ج", memberIds: [a.user.id] }).expect(201)).body;
    const long = "ن".repeat(900);
    const msg = (await api().post(`/threads/${th.id}/messages`).set(b.auth).send({ text: long }).expect(201)).body;
    await api().post("/reports").set(a.auth).send({ kind: "message", targetId: msg.id, reason: "child_safety" }).expect(201);
    const ev = await env.ctx.db.evidence.findUnique({ where: { kind_targetId: { kind: "message", targetId: msg.id } } });
    expect(ev!.text.length).toBe(900);
    const rep = await env.ctx.db.report.findFirst({ where: { targetId: msg.id } });
    expect(rep!.snippet.length).toBe(500); // الفرق هو بيت القصيد
  });

  it("🔴 مفيش مفتاح: الملف مابيتخزنش، والبلاغ **بيعدّي** والسبب بيتسجّل", async () => {
    const a = await env.login("01081100041", "مبلِّغة");
    const b = await env.login("01081100042", "مسيء");
    const url = await upload(b.auth);
    const st = (await api().post("/stories").set(b.auth).send({ caption: "ك", colorFrom: "#111111", colorTo: "#222222", imageUrl: url }).expect(201)).body;

    const keep = env.ctx.config.EVIDENCE_KEY;
    (env.ctx.config as { EVIDENCE_KEY?: string }).EVIDENCE_KEY = undefined;
    try {
      // الإبلاغ عن اعتداء على طفل **ماينفعش** يترفض عشان مفتاح ناقص
      await api().post("/reports").set(a.auth).send({ kind: "story", targetId: st.id, reason: "child_safety" }).expect(201);
    } finally {
      (env.ctx.config as { EVIDENCE_KEY?: string }).EVIDENCE_KEY = keep;
    }
    const ev = await env.ctx.db.evidence.findUnique({ where: { kind_targetId: { kind: "story", targetId: st.id } } });
    expect(ev!.problem).toBe("no_key");
    expect(ev!.blob).toBeNull(); // مادة خام في نسخة رايحة لدرايف = أسوأ من مفيش
    expect(ev!.sha256).toBe(sha256(PNG)); // البصمة بتفضل فالمحضر لسه مفيد
  });

  it("بلاغ تاني بعد ما الملف راح مابيدهسش نسخة ناجحة", async () => {
    const a = await env.login("01081100051", "أول");
    const c = await env.login("01081100052", "تاني");
    const b = await env.login("01081100053", "مسيء");
    const url = await upload(b.auth);
    const st = (await api().post("/stories").set(b.auth).send({ caption: "ك", colorFrom: "#111111", colorTo: "#222222", imageUrl: url }).expect(201)).body;
    await api().post("/reports").set(a.auth).send({ kind: "story", targetId: st.id, reason: "child_safety" }).expect(201);

    fs.unlinkSync(onDisk(url)); // الملف راح من القرص
    await api().post("/reports").set(c.auth).send({ kind: "story", targetId: st.id, reason: "child_safety" }).expect(201);

    const ev = await env.ctx.db.evidence.findUnique({ where: { kind_targetId: { kind: "story", targetId: st.id } } });
    expect(ev!.problem).toBe("");
    expect(openIt(ev!).equals(PNG)).toBe(true);
  });
});

describe("الاحتفاظ والتسليم", () => {
  /**
   * 🔴 **الاسمان القديمان لهذا الاختبار والذي يليه كانا «مابتتمسحش بعد سنتين»
   * و«الكنس عمره ما بيلمس جدول الأدلة» — وسقطا في ٢٨ أكتوبر ٢٠٢٦ لأن السلوك
   * تغيّر عمدًا، لا لأن الكود انكسر.** مذكرة المحامي حدّت الاحتفاظ بـ«سنة إلى
   * ٣ سنوات كحد أقصى»، فالاحتفاظ الأبدي الذي كانا يحرسانه صار هو المخالفة.
   * (الدرس المكتوب في `CLAUDE.md`: الاختبار الذي يوثّق سلوكًا غلط يحميه، فتُقرأ
   * أسماء الاختبارات الساقطة قبل «تصليحها».)
   *
   * والمدة الأطول من الباقي لم تتغيّر: سنتان لبلاغ عادي، وثلاث لبلاغ إيذاء طفل.
   */
  it("🔴 بلاغ إيذاء الأطفال بيعيش أطول من الباقي — بيفضل بعد سنتين ونصف ويروح بعد التلاتة", async () => {
    const a = await env.login("01081100061", "مبلِّغ");
    const b = await env.login("01081100062", "مسيء");
    const th = (await api().post("/threads").set(b.auth).send({ type: "group", name: "ج", memberIds: [a.user.id] }).expect(201)).body;
    const m1 = (await api().post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "واحد" }).expect(201)).body;
    const m2 = (await api().post(`/threads/${th.id}/messages`).set(b.auth).send({ text: "اتنين" }).expect(201)).body;
    await api().post("/reports").set(a.auth).send({ kind: "message", targetId: m1.id, reason: "child_safety" }).expect(201);
    await api().post("/reports").set(a.auth).send({ kind: "message", targetId: m2.id, reason: "spam" }).expect(201);

    const YEAR = 365.25 * 86_400_000;
    const at = (y: number) => new Date(Date.now() - y * YEAR);

    // سنتان ونصف: السبام عدّى مدته (سنتان) وبلاغ إيذاء الطفل لسه جوّه الـ٣
    await env.ctx.db.report.updateMany({ where: { targetId: { in: [m1.id, m2.id] } }, data: { status: "resolved", resolvedAt: at(2.5) } });
    await retentionSweep(env.ctx, "on");
    expect(await env.ctx.db.report.count({ where: { targetId: m1.id } }), "بلاغ إيذاء طفل اتمسح بدري").toBe(1);
    expect(await env.ctx.db.report.count({ where: { targetId: m2.id } }), "بلاغ السبام ما اتمسحش").toBe(0);

    // وبعد التلاتة يروح هو كمان — «للأبد» مش مدة
    await env.ctx.db.report.updateMany({ where: { targetId: m1.id }, data: { resolvedAt: at(3.5) } });
    await retentionSweep(env.ctx, "on");
    expect(await env.ctx.db.report.count({ where: { targetId: m1.id } }), "عدّى الـ٣ سنين ولسه موجود").toBe(0);
  });

  /**
   * 🔴 الكنس بقى **بيلمس** جدول الأدلة بسقف ٣ سنين — والفحص هنا على الحدّ:
   * دليل عمره سنة يفضل. (وحماية «البلاغ لسه مفتوح» متفحوصة في `retention.test.ts`.)
   */
  it("🔴 الكنس مابيلمسش دليلًا لسه جوّه مدته", async () => {
    const before = await env.ctx.db.evidence.count();
    expect(before).toBeGreaterThan(0); // وإلا الفحص بلا معنى
    await env.ctx.db.evidence.updateMany({ data: { savedAt: new Date(Date.now() - 365.25 * 86_400_000) } });
    await retentionSweep(env.ctx, "on");
    expect(await env.ctx.db.evidence.count()).toBe(before);
  });

  it("🔴 القايمة مابترجّعش المحتوى، والتسليم محتاج صلاحية وطلب رسمي وتأكيد", async () => {
    const a = await env.login("01081100071", "مبلِّغة");
    const b = await env.login("01081100072", "مسيء");
    const url = await upload(b.auth);
    const st = (await api().post("/stories").set(b.auth).send({ caption: "ك", colorFrom: "#111111", colorTo: "#222222", imageUrl: url }).expect(201)).body;
    await api().post("/reports").set(a.auth).send({ kind: "story", targetId: st.id, reason: "child_safety" }).expect(201);
    const ev = (await env.ctx.db.evidence.findUnique({ where: { kind_targetId: { kind: "story", targetId: st.id } } }))!;

    // مستخدم عادي — ومشرف محتوى كمان: الصلاحية مش في أي دور جاهز
    await api().get("/admin/evidence").set(a.auth).expect(403);
    const roles = (await api().get("/admin/roles").set(owner.auth)).body as { id: string; key: string }[];
    await api().post("/admin/staff").set(owner.auth).send({ contact: "01081100079", roleId: roles.find((r) => r.key === "moderator")!.id }).expect(201);
    const mod = await env.login("01081100079");
    await api().get("/admin/evidence").set(mod.auth).expect(403);

    const list = (await api().get("/admin/evidence").set(owner.auth).expect(200)).body as Record<string, unknown>[];
    const row = list.find((x) => x.id === ev.id)!;
    expect(row.hasFile).toBe(true);
    expect(row.sha256).toBe(sha256(PNG));
    // 🔴 الفحص على **نصّ الرد كله**: المحتوى ماينفعش يخرج من مسار القايمة أبدًا
    expect(JSON.stringify(list)).not.toContain(PNG.toString("base64"));
    expect(JSON.stringify(list)).not.toContain("blob");

    await api().post(`/admin/evidence/${ev.id}/release`).set(owner.auth).send({ ref: "طلب نيابة ١٢٣" }).expect(400); // بلا confirm
    await api().post(`/admin/evidence/${ev.id}/release`).set(owner.auth).send({ confirm: true }).expect(400); // بلا رقم طلب
    await api().post(`/admin/evidence/${ev.id}/release`).set(mod.auth).send({ ref: "طلب نيابة ١٢٣", confirm: true }).expect(403);

    const out = await api().post(`/admin/evidence/${ev.id}/release`).set(owner.auth).send({ ref: "طلب نيابة ١٢٣", confirm: true }).expect(200);
    expect(Buffer.from(out.body).equals(PNG)).toBe(true); // البايتات الأصلية بالظبط
    const after = await env.ctx.db.evidence.findUnique({ where: { id: ev.id } });
    expect(after!.releaseRef).toBe("طلب نيابة ١٢٣");
    expect(after!.releasedAt).toBeTruthy();
    const log = await env.ctx.db.auditLog.findFirst({ where: { action: { contains: "دليل" } }, orderBy: { createdAt: "desc" } });
    expect(log, "التسليم ما اتسجّلش في سجل المراجعة").toBeTruthy();
  });
});
