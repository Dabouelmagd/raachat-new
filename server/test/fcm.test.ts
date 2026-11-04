/**
 * الإشعارات الأصلية (FCM) — التطبيق المثبَّت.
 *
 * Web Push مابيشتغلش جوه WebView، فالـAPK **مايوصلوش ولا إشعار** مهما كان
 * VAPID متضبطًا. الملف ده بيفحص الطريق الأصلي: توقيع JWT حقيقي، شكل الرسالة،
 * التفرقة بين «التوكن مات» و«فشل مؤقت»، والفان-أوت على القناتين.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import {
  DeadTokenError,
  createNativePush,
  fcmMessage,
  parseServiceAccount,
  signJwt,
} from "../src/lib/fcm.js";
import type { Config } from "../src/config.js";
import { startTestEnv } from "./helpers.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const sa = (over: Record<string, unknown> = {}) =>
  Buffer.from(
    JSON.stringify({
      project_id: "raachat-test",
      client_email: "fcm@raachat-test.iam.gserviceaccount.com",
      private_key: PEM,
      ...over,
    }),
  ).toString("base64");

const cfg = (v?: string) => ({ FCM_SERVICE_ACCOUNT: v }) as unknown as Config;
const payload = (kind: "message" | "call") => ({
  kind,
  title: "دالية",
  body: "أهلًا",
  tag: `msg-t1`,
  threadId: "t1",
});

describe("حساب الخدمة", () => {
  it("بيترفض لو مش base64 أو مش JSON أو ناقصه حقل", () => {
    expect(() => parseServiceAccount("!!! not base64 !!!")).toThrow();
    expect(() => parseServiceAccount(Buffer.from("لا شيء").toString("base64"))).toThrow(/JSON/);
    expect(() => parseServiceAccount(sa({ project_id: "" }))).toThrow(/project_id/);
    expect(() => parseServiceAccount(sa({ private_key: "مش مفتاح" }))).toThrow(/PEM/);
  });

  /**
   * ملف جوجل بييجي بأسطر حقيقية، إنما اللي ينسخه في محرّر أو في JSON متداخل
   * بيطلّعه بـ`\n` حرفية — والتوقيع بيفشل ساعتها برسالة تشفير غامضة.
   */
  it("بيقبل private_key بأسطر `\\n` حرفية", () => {
    const escaped = sa({ private_key: PEM.replace(/\n/g, "\\n") });
    expect(parseServiceAccount(escaped).private_key).toContain("\n");
  });
});

describe("توقيع JWT", () => {
  /**
   * 🔴 الفحص على **التحقّق من التوقيع بالمفتاح العام** مش على شكل النصّ: JWT
   * بثلاث أجزاء وتوقيع غلط شكله مطابق تمامًا، وجوجل هي اللي ترفضه — يعني
   * الإشعارات تقف وإحنا شايفين سلسلة سليمة.
   */
  it("توقيع RS256 حقيقي بيتحقّق بالمفتاح العام", () => {
    const t = signJwt(parseServiceAccount(sa()), 1_700_000_000);
    const [h, b, s] = t.split(".");
    expect([h, b, s].every(Boolean)).toBe(true);
    const sig = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const ok = createVerify("RSA-SHA256").update(`${h}.${b}`).end()
      .verify(createPublicKey(publicKey.export({ type: "spki", format: "pem" }).toString()), sig);
    expect(ok, "التوقيع مش متحقِّق بالمفتاح العام").toBe(true);

    const claims = JSON.parse(Buffer.from(b, "base64").toString("utf8"));
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.scope).toContain("firebase.messaging");
    expect(claims.exp - claims.iat).toBe(3600);
  });
});

describe("شكل رسالة FCM", () => {
  /**
   * 🔴 `notification` **إلزامي**: لما التطبيق يكون مقفول، أندرويد هو اللي
   * بيعرض الإشعار من الحقل ده. رسالة داتا-بس بتوصل للجهاز وماتظهرش خالص —
   * عطل صامت بالكامل (المستخدم مايعرفش إن فيه رسالة، ومفيش ولا خطأ).
   */
  it("فيها notification مش داتا بس", () => {
    const m = fcmMessage("tok", payload("message")).message;
    expect(m.notification.title).toBe("دالية");
    expect(m.notification.body).toBe("أهلًا");
    expect(m.data.threadId).toBe("t1");
    expect(m.token).toBe("tok");
  });

  it("المكالمة أولوية عالية وعمرها ٤٥ ثانية، والرسالة عادية ليوم", () => {
    const call = fcmMessage("t", payload("call")).message.android;
    const msg = fcmMessage("t", payload("message")).message.android;
    expect(call.priority).toBe("HIGH");
    expect(call.ttl).toBe("45s"); // مكالمة بعد دقيقة خبر قديم
    expect(msg.priority).toBe("NORMAL");
    expect(msg.ttl).toBe("86400s");
  });
});

describe("الإرسال", () => {
  it("مفيش مفتاح = متوقّف بالكامل (مش رمية)", () => {
    expect(createNativePush(cfg(undefined))).toBeUndefined();
    expect(createNativePush(cfg(""))).toBeUndefined();
  });

  /** ردّ وهمي: أول نداء توكن، وبعدها نداءات الإرسال. */
  function stub(sendStatus: number, sendBody = "{}") {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
      }
      return new Response(sendBody, { status: sendStatus });
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  it("بياخد توكن مرة واحدة وبيكاشّه", async () => {
    const { f, calls } = stub(200);
    const n = createNativePush(cfg(sa()), f)!;
    expect(n.projectId).toBe("raachat-test");
    await n.send("tok1", payload("message"));
    await n.send("tok2", payload("message"));
    // توكن واحد + إرسالتان — من غير الكاش كل إشعار بيتكلّف نداء توقيع ونداء
    // شبكة زيادة لجوجل، وده على كل رسالة لكل جهاز.
    expect(calls.filter((u) => u.includes("oauth2")).length).toBe(1);
    expect(calls.filter((u) => u.includes("messages:send")).length).toBe(2);
    expect(calls.some((u) => u.includes("/v1/projects/raachat-test/messages:send"))).toBe(true);
  });

  /**
   * 🔴 الفرق بين الاتنين دول هو كل الفرق: الميت يتمسح، والمؤقت **ما يتمسحش**.
   * مسح توكن سليم على فشل عابر بيخلّي الجهاز بلا إشعارات **للأبد** — لأنه
   * مابيعيدش التسجيل إلا لما FCM نفسه يجدّد التوكن (ممكن أسابيع).
   */
  it("٤٠٤ = التوكن مات · ٥٠٠ = فشل مؤقت", async () => {
    const dead = createNativePush(cfg(sa()), stub(404, '{"error":{"status":"NOT_FOUND"}}').f)!;
    await expect(dead.send("t", payload("message"))).rejects.toBeInstanceOf(DeadTokenError);

    const sender = createNativePush(cfg(sa()), stub(403, '{"error":{"status":"SENDER_ID_MISMATCH"}}').f)!;
    await expect(sender.send("t", payload("message"))).rejects.toBeInstanceOf(DeadTokenError);

    const temp = createNativePush(cfg(sa()), stub(500, "boom").f)!;
    await expect(temp.send("t", payload("message"))).rejects.not.toBeInstanceOf(DeadTokenError);
  });

  it("رسالة الفشل فيها الحالة وجسم الرد ومفيهاش التوكن", async () => {
    const n = createNativePush(cfg(sa()), stub(503, "service unavailable").f)!;
    let e: Error | undefined;
    try { await n.send("SECRET-DEVICE-TOKEN", payload("message")); } catch (x) { e = x as Error; }
    expect(e, "المفروض يرمي").toBeTruthy();
    expect(e!.message).toContain("status=503");
    expect(e!.message).toContain("service unavailable");
    expect(e!.message, "التوكن مايتطبعش في اللوج").not.toContain("SECRET-DEVICE-TOKEN");
  });
});

describe("حارس المصدر الواحد", () => {
  /**
   * 🔴 الحارس ده هو اللي بيمنع رجوع العطل اللي الاختبار فوق كشفه: أي مسار
   * بيحكم بـ`ctx.push` لوحده بيطفّي الإشعارات الأصلية **في سكوت** لما يكون
   * VAPID مش متضبطًا. الحكم من `pushEnabled` وحده، و`lib/push.ts` نفسه مستثنى
   * لأنه هو المصدر.
   */
  it("مفيش مسار بيحكم بـ ctx.push لوحده", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../src");
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "generated") walk(full); continue; }
        if (!e.name.endsWith(".ts")) continue;
        const rel = path.relative(root, full);
        if (rel === path.join("lib", "push.ts") || rel === "index.ts") continue; // المصدر + سطر التحذير
        // الحكم على الكود بعد شيل التعليقات — التعليق بيشرح الممنوع فبيكتبه.
        const code = fs.readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        if (/if\s*\(\s*!?ctx\.push\s*\)/.test(code)) bad.push(rel);
      }
    };
    walk(root);
    expect(bad, "استخدم pushEnabled(ctx) — ctx.push لوحده بيطفّي FCM في سكوت").toEqual([]);
  });
});

describe("الفان-أوت على القناتين", () => {
  let env: Awaited<ReturnType<typeof startTestEnv>>;
  beforeAll(async () => { env = await startTestEnv(); }, 120_000);
  afterAll(async () => { await env?.stop(); }, 60_000);
  afterEach(() => { env.ctx.native = undefined; });

  const sent: { token: string; title: string }[] = [];
  const fake = (fail?: Error) => ({
    projectId: "p",
    async send(token: string, p: { title: string }) {
      if (fail) throw fail;
      sent.push({ token, title: p.title });
    },
  });

  const reg = async (auth: Record<string, string>, token: string) =>
    request(env.app).post("/push/device").set(auth).send({ token, platform: "android" }).expect(204);

  it("التوكن بيتسجّل وبيتشال، وبينتقل للحساب اللي سجّل بيه آخر مرة", async () => {
    const a = await env.login("01097000001", "دالية");
    const b = await env.login("01097000002", "مريم");
    await request(env.app).post("/push/device").set(a.auth).send({ token: "short", platform: "android" }).expect(400);
    await request(env.app).post("/push/device").set(a.auth).send({ token: "x".repeat(20), platform: "windows" }).expect(400);
    await reg(a.auth, "tok-shared-device-1");
    expect(await env.ctx.db.deviceToken.count({ where: { userId: a.user.id } })).toBe(1);
    // نفس الجهاز بحساب تاني: لو التوكن فضل على الأول، إشعارات دالية (وفيها
    // نصّ الرسالة) بتروح لجهاز مريم.
    await reg(b.auth, "tok-shared-device-1");
    expect(await env.ctx.db.deviceToken.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await env.ctx.db.deviceToken.count({ where: { userId: b.user.id } })).toBe(1);
    await request(env.app).post("/push/device/remove").set(b.auth).send({ token: "tok-shared-device-1" }).expect(204);
    expect(await env.ctx.db.deviceToken.count({ where: { userId: b.user.id } })).toBe(0);
  });

  /**
   * 🔴 الارتداد اللي الاختبار ده موجود عشانه: `notifyPush` كان بيبدأ بـ
   * `if (!ctx.push) return`. أول ما يبقى FCM متضبطًا وVAPID لأ (أو العكس)،
   * الشرط ده بيطفّي القناة الشغّالة **في سكوت** — الإشعار best-effort ومابيرميش.
   */
  it("بيبعت للتطبيق المثبَّت حتى لو Web Push متوقّف", async () => {
    const a = await env.login("01097000011", "الباعتة");
    const b = await env.login("01097000012", "المستقبل");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await reg(b.auth, "tok-offline-receiver");
    const web = env.ctx.push;
    env.ctx.push = undefined; // Web Push متوقّف
    env.ctx.native = fake() as never;
    sent.length = 0;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "رسالة" }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    env.ctx.push = web;
    expect(sent.map((s) => s.token)).toEqual(["tok-offline-receiver"]);
  });

  it("التوكن الميت بيتمسح، والفشل المؤقت مابيمسحش", async () => {
    const a = await env.login("01097000021", "الباعتة٢");
    const b = await env.login("01097000022", "المستقبل٢");
    const th = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    await reg(b.auth, "tok-will-survive");

    env.ctx.native = fake(new Error("boom")) as never; // فشل مؤقت
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "١" }).expect(201);
    await new Promise((r) => setTimeout(r, 150));
    expect(await env.ctx.db.deviceToken.count({ where: { userId: b.user.id } }), "فشل مؤقت مسح توكن سليم").toBe(1);

    env.ctx.native = fake(new DeadTokenError("UNREGISTERED")) as never;
    await request(env.app).post(`/threads/${th.id}/messages`).set(a.auth).send({ text: "٢" }).expect(201);
    await new Promise((r) => setTimeout(r, 150));
    expect(await env.ctx.db.deviceToken.count({ where: { userId: b.user.id } }), "التوكن الميت ما اتمسحش").toBe(0);
  });

  /** محو الحساب لازم يشيل التوكن كمان — وإلا إشعار بيروح لجهاز حساب ممحو. */
  it("محو الحساب بيشيل توكناته", async () => {
    const a = await env.login("01097000031", "ممحوّة");
    await reg(a.auth, "tok-to-erase-0123456789");
    const { eraseUser } = await import("../src/lib/eraseUser.js");
    await eraseUser(env.ctx, a.user.id, { id: a.user.id, name: "اختبار", action: "erase" });
    expect(await env.ctx.db.deviceToken.count({ where: { userId: a.user.id } })).toBe(0);
  });
});
