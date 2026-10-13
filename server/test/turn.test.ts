import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { startTestEnv } from "./helpers.js";

/**
 * بيانات دخول TURN المؤقتة.
 *
 * coturn مع `--use-auth-secret` بيتحقق كده بالظبط: الاسم `<انتهاء>:<مستخدم>`
 * والكلمة **base64(HMAC-SHA1(secret, username))**. لو الخوارزمية اتغيّرت (sha256
 * أو hex أو ترتيب مختلف) الـ API بيرجّع بيانات **شكلها سليم** وcoturn بيرفضها في
 * سكوت — المكالمة ترن وتتقفل من غير صوت، ومفيش ولا خطأ في اللوج عندنا. فالاختبار
 * بيحسب الكلمة لوحده ويقارن بدل ما يكتفي بإنها «موجودة».
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

type Ice = { urls: string[]; username?: string; credential?: string };
const config = async (a: { auth: Record<string, string> }) =>
  (await request(env.app).get("/rtc/config").set(a.auth).expect(200)).body.iceServers as Ice[];

describe("بيانات TURN المؤقتة", () => {
  it("الكلمة = base64(HMAC-SHA1(secret, username)) بالظبط، والانتهاء بعد ساعة", async () => {
    const a = await env.login("01094000001", "أ");
    Object.assign(env.ctx.config, { TURN_URLS: "turn:kenoz.org:3478?transport=udp", TURN_SECRET: "secret-for-test-only" });
    const [, turn] = await config(a);
    expect(turn!.urls).toEqual(["turn:kenoz.org:3478?transport=udp"]);

    const [exp, user] = turn!.username!.split(":");
    expect(user).toBe(a.user.id);
    const secs = Number(exp);
    const now = Math.floor(Date.now() / 1000);
    expect(secs).toBeGreaterThan(now + 3500);
    expect(secs).toBeLessThanOrEqual(now + 3600);

    // الحساب المستقل — نفس اللي coturn هيعمله
    const expected = crypto.createHmac("sha1", "secret-for-test-only").update(turn!.username!).digest("base64");
    expect(turn!.credential).toBe(expected);
  });

  it("فاصلة زايدة أو مسافات في TURN_URLS مابتعملش عنوان فاضي", async () => {
    const a = await env.login("01094000002", "ب");
    Object.assign(env.ctx.config, { TURN_URLS: " turn:kenoz.org:3478?transport=udp , turn:kenoz.org:3478?transport=tcp , ", TURN_SECRET: "s" });
    const [, turn] = await config(a);
    // المتصفح بيرفض مدخل ICE فيه عنوان غير صالح، فعنوان فاضي واحد بيضيّع TURN كله
    expect(turn!.urls).toEqual(["turn:kenoz.org:3478?transport=udp", "turn:kenoz.org:3478?transport=tcp"]);
    expect(turn!.urls.every((u) => u.length > 0)).toBe(true);
  });

  it("مفيش سر = مفيش مدخل TURN (STUN بس) — ومفيش بيانات نصف جاهزة", async () => {
    const a = await env.login("01094000003", "ج");
    Object.assign(env.ctx.config, { TURN_URLS: "turn:kenoz.org:3478", TURN_SECRET: "" });
    expect(await config(a)).toHaveLength(1);
    Object.assign(env.ctx.config, { TURN_URLS: "", TURN_SECRET: "s" });
    expect(await config(a)).toHaveLength(1);
    // وحتى لو العناوين كلها فاضية بعد التنضيف
    Object.assign(env.ctx.config, { TURN_URLS: " , ", TURN_SECRET: "s" });
    expect(await config(a)).toHaveLength(1);
  });

  it("كل مستخدم له اسمه، ومفيش بيانات تخرج بدون تسجيل دخول", async () => {
    const a = await env.login("01094000004", "د");
    const b = await env.login("01094000005", "هـ");
    Object.assign(env.ctx.config, { TURN_URLS: "turn:kenoz.org:3478", TURN_SECRET: "s" });
    const [, ta] = await config(a);
    const [, tb] = await config(b);
    expect(ta!.username).not.toBe(tb!.username);
    expect(ta!.credential).not.toBe(tb!.credential);
    await request(env.app).get("/rtc/config").expect(401);
  });
});
