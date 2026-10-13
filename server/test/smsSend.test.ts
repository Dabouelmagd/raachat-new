/**
 * `scripts/lib/smssend.mjs` — السكربت اللي `set-sms-keys.sh` بيحكم بيه، متجرَّب
 * على **مزوّد وهمي بيتكلّم زي المجمّعات المصرية**: HTTPS، و**HTTP 200 دايمًا**،
 * والنجاح/الفشل في كود جوه الجسم.
 *
 * ليه الاختبار ده: سكربت بيعدّي في كل الحالات أسوأ من مفيش سكربت. فلازم نشوفه
 * **يفشل** على ٢٠٠-مع-كود-خطأ (الرصيد خلص / المرسل مرفوض) مش يقول ✅.
 * وبيستخدم `src/lib/sms.ts` نفسه — نفس الكود اللي بيشتغل في الإنتاج.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/lib/smssend.mjs");
const LIB = path.join(ROOT, "server/src/lib/sms.ts");
const PASS = "p@ss#1"; // فيها $-زي رموز عن قصد — دي اللي base64 موجودة عشانها

let dir: string, port: number, server: https.Server;
// العنوان 127.0.0.1 مش localhost: node بيحلّ localhost لـ ::1 الأول، والسيرفر هنا
// سامع على IPv4 بس — فالنداء كان بيقعد ١٠ ثواني ويطلّع Connect Timeout.
const hits: { body: string }[] = [];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-sms-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"),
  ], { stdio: "ignore" });

  server = https.createServer(
    { key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem")) },
    (req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        hits.push({ body });
        const p = new URLSearchParams(body);
        // زي المجمّعات: الحالة دايمًا ٢٠٠ والحكم في الجسم
        const ok = p.get("password") === PASS;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(ok ? { code: "1901", SMSID: "42" } : { code: "4904", message: "Insufficient balance" }));
      });
    },
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
}, 60_000);

afterAll(() => { server?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const spec = (password: string) =>
  Buffer.from(JSON.stringify({
    url: `https://127.0.0.1:${port}/api/`,
    method: "POST",
    format: "form",
    params: { username: "myuser", password, sender: "RaaChat", Mobile: "{to20}", Message: "{text}", Language: "1" },
    ok: "1901",
  })).toString("base64");

/**
 * **لازم غير متزامن:** المزوّد الوهمي شغّال في نفس عملية الاختبار، و`execFileSync`
 * بيقفل حلقة الأحداث — فالسيرفر مابيقدرش يستقبل الاتصال والنداء يقعد ١٠ ثواني
 * ويطلّع Connect Timeout. (أول نسخة من الاختبار سقطت على كود سليم بسبب ده.)
 */
function run(SMS_HTTP: string, to = "01222139111", code = "778899") {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(
      "node", ["--import", "tsx", SCRIPT, to, code],
      {
        encoding: "utf8",
        env: { ...process.env, SMS_HTTP, SMS_LIB: LIB, NODE_EXTRA_CA_CERTS: path.join(dir, "c.pem") },
        cwd: path.join(ROOT, "server"),
      },
      (err, stdout, stderr) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr }),
    );
  });
}

describe("إرسال SMS حقيقي (مزوّد وهمي)", () => {
  it("بينجح بالمفاتيح الصح، وبيبعت الرقم بصيغة 20 ونصّ الكود", async () => {
    hits.length = 0;
    const r = await run(spec(PASS));
    expect(r.code).toBe(0);
    expect(r.out).toContain("✅");
    const p = new URLSearchParams(hits.at(-1)!.body);
    expect(p.get("Mobile")).toBe("201222139111");
    expect(p.get("Message")).toContain("778899");
    expect(p.get("sender")).toBe("RaaChat");
  });

  it("**بيفشل** على ٢٠٠ مع كود خطأ — ومابيقولش نجحت", async () => {
    const r = await run(spec("كلمة-غلط"));
    expect(r.code).toBe(1);
    expect(r.out).toContain("المزوّد مارضيش");
    expect(r.out).not.toContain("✅");
  });

  it("مابيطبعش كلمة السر ولا اسم المستخدم حتى لو المزوّد رجّعهم في الرد", async () => {
    // المزوّد الوهمي بيرجّع رسالة فيها الرصيد بس؛ نتأكد إن الحجب شغّال على أي رد
    const r = await run(spec(PASS));
    expect(r.out).not.toContain(PASS);
    expect(r.out).not.toContain("myuser");
  });

  it("بيرفض مواصفة من غير علامة نجاح، ورقم مش مصري، ومواصفة معطوبة — من غير أي نداء", async () => {
    hits.length = 0;
    const noOk = Buffer.from(JSON.stringify({
      url: `https://127.0.0.1:${port}/api/`, method: "POST", format: "form",
      params: { Mobile: "{to}", Message: "{text}" },
    })).toString("base64");
    expect((await run(noOk)).out).toMatch(/ok مطلوب/);
    expect((await run(spec(PASS), "0122")).out).toMatch(/مش رقم مصري سليم/);
    expect((await run("not-base64-at-all")).code).toBe(1);
    expect(hits).toHaveLength(0); // ولا نداء واحد خرج
  });

  it("المزوّد اللي مابيردّش خالص = فشل واضح مش تعليق", async () => {
    const dead = Buffer.from(JSON.stringify({
      url: "https://127.0.0.1:1/api/", method: "POST", format: "form",
      params: { Mobile: "{to}", Message: "{text}" }, ok: "1901",
    })).toString("base64");
    const r = await run(dead);
    expect(r.code).toBe(1);
    expect(r.out).toContain("النداء نفسه فشل");
  }, 30_000);
});
