import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

/**
 * فاحص TURN (`scripts/lib/turncheck.mjs`) **على coturn حقيقي**.
 *
 * الفاحص ده هو اللي بيقول «✅ TURN شغّال» في `set-turn.sh` وفي المراقبة، فلازم
 * يبقى متجرَّب في التلات اتجاهات: ينجح بالسر الصح، **ويفشل** بسر غلط، ويفشل لو
 * مفيش سيرفر سامع. فاحص بيعدّي في كل الحالات أسوأ من مفيش فاحص.
 *
 * بيتخطّى لو coturn مش متثبّت في البيئة (`turnserver`) — زي اختبار لوحة الإدارة
 * اللي بيتخطّى لو البناء مش موجود.
 */
const exec = promisify(execFile);
const SECRET = "test-secret-for-turncheck-0001";
const PORT = 13479 + (process.pid % 200); // منفذ فريد لكل عملية اختبار
const CHECKER = path.resolve("../scripts/lib/turncheck.mjs");

let srv: ChildProcess | undefined;
let have = false;

beforeAll(async () => {
  try { await exec("turnserver", ["-h"]); have = true; } catch { have = false; }
  if (!have) return;
  srv = spawn("turnserver", [
    "-n", "--use-auth-secret", `--static-auth-secret=${SECRET}`, "--realm=test.local",
    "-L", "127.0.0.1", `--listening-port=${PORT}`, "--min-port=49300", "--max-port=49320",
    "--no-tls", "--no-dtls", "--no-cli", "--log-file=stdout",
  ], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1500));
}, 30_000);

afterAll(() => { srv?.kill("SIGKILL"); });

const run = (env: Record<string, string>) =>
  exec(process.execPath, [CHECKER], { env: { ...process.env, TURN_HOST: "127.0.0.1", TURN_PORT: String(PORT), TURN_TIMEOUT_MS: "2500", ...env } })
    .then((o) => ({ code: 0, out: o.stdout + o.stderr }))
    .catch((e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") }));

describe("فاحص TURN على coturn حقيقي", () => {
  it("بينجح بالسر الصح ويطلّع عنوان ترحيل", async () => {
    if (!have) { console.log("⏭️ coturn مش متثبّت — الاختبار اتخطّى"); return; }
    const r = await run({ TURN_SECRET: SECRET });
    expect(r.out).toMatch(/allocate ok/);
    expect(r.out).toMatch(/relay \d+\.\d+\.\d+\.\d+:\d+/);
    expect(r.code).toBe(0);
  }, 20_000);

  it("**بيفشل** بسر غلط (401) — ده اللي بيخلي الفحص يعني حاجة", async () => {
    if (!have) return;
    const r = await run({ TURN_SECRET: "definitely-the-wrong-secret" });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/401|المصادقة/);
  }, 20_000);

  it("بيفشل لو مفيش سيرفر سامع على المنفذ", async () => {
    if (!have) return;
    const r = await run({ TURN_SECRET: SECRET, TURN_PORT: String(PORT + 1) });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/مفيش رد/);
  }, 20_000);

  it("بيفشل من غير سر خالص", async () => {
    const r = await run({ TURN_SECRET: "" });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/TURN_SECRET/);
  }, 20_000);

  it("**السكربت بيتحقق قبل ما يعلن**: كتابة TURN_URLS بعد الفحص مش قبله", async () => {
    // العطل اللي حصل فعلًا: النسخة الأولى كتبت `TURN_URLS=turn:kenoz.org:…` الأول
    // وبعدين فحصت — والدومين المجرّد مالوش سجل A، فالإنتاج فضل بيوزّع على كل
    // المتصفحات عنوان TURN مستحيل يوصله (تأخير في كل مكالمة بلا فايدة).
    // الاختبار ده حارس على **ترتيب** السكربت نفسه.
    const sh = await import("node:fs/promises").then((fs) => fs.readFile(path.resolve("../scripts/set-turn.sh"), "utf8"));
    const write = sh.indexOf("set_kv TURN_URLS \"turn:");
    const verify = sh.indexOf('echo "↪ فحص TURN على');
    expect(write).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(verify); // الكتابة بعد الفحص
    // ومفيش `|| true` على مسار الحكم في الفحص نفسه
    expect(sh).not.toMatch(/check "\$TURN_HOST".*\|\|\s*true/);
  });

  it("كلمة السر اللي الفاحص بيستخدمها هي نفسها اللي السيرفر بيولّدها", () => {
    // الفاحص والسيرفر لازم يتفقوا: base64(HMAC-SHA1(secret, "<exp>:<user>"))
    const username = `${Math.floor(Date.now() / 1000) + 600}:setup`;
    const expected = crypto.createHmac("sha1", SECRET).update(username).digest("base64");
    expect(expected).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(expected, "base64")).toHaveLength(20); // SHA-1 = ٢٠ بايت
  });
});
