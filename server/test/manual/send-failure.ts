/**
 * تحقّق **يدوي** (مش في الـ CI): هل الواجهة بتضيّع نص المستخدم لو الإرسال فشل؟
 *
 * ليه يدوي: اختبارات الواجهة في `test/ui/` بتشتغل على بناء الديمو (`dist-single`)
 * اللي مابيعملش ولا نداء شبكة — فمفيش فيه فشل إرسال أصلًا. التحقّق ده بيشغّل
 * **سيرفر حقيقي** + بناء الواجهة في **وضع الـ API**، وبعدين يخلّي نداء الإرسال
 * بس هو اللي يفشل (مرة بقطع الاتصال ومرة برد ٤٠٠).
 *
 * الخطوات (محتاج postgres شغّال على 5432):
 *   1) cd /home/claude/raachat-new && VITE_API_URL=http://localhost:4111 npx vite build -c vite.single.config.ts
 *   2) cd server && npx tsx test/manual/send-failure.ts
 *
 * المتوقّع: شريط «الرسالة ما اتبعتتش» بسبب الفشل، والخانة فاضية، وزرار «رجّع
 * النص للخانة» بيرجّع النص بالحرف. على الكود القديم: مفيش شريط، والنص ضاع،
 * والرفض بيظهر كـ PAGEERROR بس (يعني المستخدم مايشوفش حاجة خالص).
 *
 * ملحوظة: playwright متثبّت في `test/` لوحده (مش في تبعيات الإنتاج) فبيتحمّل
 * بمساره الصريح من هناك.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import pg from "pg";
const ROOT = path.resolve(import.meta.dirname, "../../..");
const { chromium } = require(path.join(ROOT, "test/node_modules/playwright/index.js")) as typeof import("playwright");
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/db.js";
import { attachRealtime } from "../../src/realtime.js";
import type { Ctx } from "../../src/context.js";
import type { OtpSender } from "../../src/lib/senders.js";

const ADMIN = "postgresql://rachat:rachat@localhost:5432/postgres";
const NAME = "rc_verify_send";
const API = 4111;
const WEB = 5173;

async function main() {
  const a0 = new pg.Client({ connectionString: ADMIN });
  await a0.connect();
  await a0.query(`DROP DATABASE IF EXISTS "${NAME}" WITH (FORCE)`);
  await a0.query(`CREATE DATABASE "${NAME}"`);
  await a0.end();
  const url = `postgresql://rachat:rachat@localhost:5432/${NAME}`;
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const migdir = path.join(ROOT, "server/prisma/migrations");
  for (const d of fs.readdirSync(migdir).sort()) {
    const p = path.join(migdir, d, "migration.sql");
    if (fs.existsSync(p)) await c.query(fs.readFileSync(p, "utf8"));
  }
  await c.end();

  const codes: { target: string; code: string }[] = [];
  const sender: OtpSender = { async send(_ch, target, code) { codes.push({ target, code }); } };
  const config = loadConfig({
    NODE_ENV: "test", DATABASE_URL: url, JWT_SECRET: "verify-secret-verify-secret",
    RATE_LIMIT: "off", UPLOAD_DIR: fs.mkdtempSync("/tmp/rc-up-"), CORS_ORIGIN: `http://localhost:${WEB}`,
  } as NodeJS.ProcessEnv);
  const ctx: Ctx = { db: createDb(url), config, sender, fetch };
  const server = http.createServer(createApp(ctx));
  attachRealtime(ctx, server);
  await new Promise<void>((r) => server.listen(API, r));

  const post = async (p: string, body: unknown, token?: string) => {
    const r = await fetch(`http://localhost:${API}${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  const login = async (phone: string, name: string) => {
    await post("/auth/otp/request", { channel: "phone", target: phone });
    const code = codes.filter((x) => x.target === phone).at(-1)!.code;
    const v = (await post("/auth/otp/verify", { channel: "phone", target: phone, code })).body as any;
    await fetch(`http://localhost:${API}/me`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.accessToken}` }, body: JSON.stringify({ name }) });
    return v;
  };
  const me = await login("01099000011", "داليا");
  const other = await login("01099000012", "صاحبي");
  const th = (await post("/threads", { type: "dm", memberIds: [other.user.id] }, me.accessToken)).body as any;

  // خادم ثابت لبناء الملف الواحد
  const web = http.createServer((req, res) => {
    const f = (req.url ?? "/").split("?")[0]!;
    const p = path.join(ROOT, "dist-single", f === "/" ? "index.html" : f);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(200, { "Content-Type": "text/html" }); res.end(fs.readFileSync(path.join(ROOT, "dist-single/index.html"))); return; }
    const ext = path.extname(p);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".png" ? "image/png" : "text/html" });
    res.end(fs.readFileSync(p));
  });
  await new Promise<void>((r) => web.listen(WEB, r));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sess = JSON.stringify({ access: me.accessToken, refresh: me.refreshToken, meId: me.user.id });
  await page.addInitScript((s) => localStorage.setItem("rachat-session", s), sess);
  const out: string[] = [];
  page.on("pageerror", (e) => out.push("PAGEERROR " + e.message));

  for (const mode of ["net", "400"] as const) {
    await page.goto(`http://localhost:${WEB}/`);
    await page.waitForTimeout(2000);
    const dlg = page.locator('[role="dialog"]');
    if (await dlg.count()) {
      out.push("dialog=" + JSON.stringify((await dlg.first().innerText()).slice(0, 200)));
      const skip = page.getByRole("button", { name: /لاحقًا|تخطّى|تخطي|مش دلوقتي|إغلاق|Later|Skip|Not now|Close/ });
      if (await skip.count()) await skip.first().click(); else await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
    // MemoryRouter: مفيش تنقّل بالرابط — ندخل المحادثة من القايمة زي المستخدم
    await page.getByText("صاحبي").first().click();
    await page.waitForTimeout(1200);
    // نخلّي نداء إرسال الرسالة بس هو اللي يفشل
    await page.evaluate((m) => {
      const orig = window.fetch;
      (window as any).fetch = (input: any, init?: any) => {
        const u = String(typeof input === "string" ? input : input.url);
        if (/\/threads\/[^/]+\/messages$/.test(u) && (init?.method ?? "GET") === "POST") {
          return m === "net"
            ? Promise.reject(new TypeError("Failed to fetch"))
            : Promise.resolve(new Response(JSON.stringify({ code: "objectionable", message: "المحتوى ده مخالف لقواعد المجتمع في رع شات ومينفعش يتنشر" }), { status: 400, headers: { "Content-Type": "application/json" } }));
        }
        return orig(input, init);
      };
    }, mode);

    const TEXT = "رسالة طويلة كتبتها بتعب وماينفعش تضيع";
    const input = page.getByPlaceholder(/اكتب رسالة|Type a message/);
    await input.fill(TEXT);
    await page.getByRole("button", { name: /^إرسال$|^Send$/ }).click();
    await page.waitForTimeout(1200);
    const alert = page.locator('[role="alert"]');
    const txt = (await alert.allInnerTexts()).join(" | ");
    out.push(`[${mode}] alert=${JSON.stringify(txt)}`);
    out.push(`[${mode}] input-after-send=${JSON.stringify(await input.inputValue())}`);
    // زرار «رجّع النص للخانة»
    const back = page.getByRole("button", { name: /رجّع النص|Put the text back/ });
    if (await back.count()) {
      await back.click();
      await page.waitForTimeout(300);
      out.push(`[${mode}] after-restore=${JSON.stringify(await input.inputValue())}`);
    } else out.push(`[${mode}] after-restore=NO-BUTTON`);
  }

  console.log(out.join("\n"));
  await browser.close();
  web.close();
  server.close();
  await ctx.db.$disconnect();
  const a2 = new pg.Client({ connectionString: ADMIN });
  await a2.connect();
  await a2.query(`DROP DATABASE IF EXISTS "${NAME}" WITH (FORCE)`);
  await a2.end();
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
