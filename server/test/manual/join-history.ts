/**
 * تحقّق في **وضع الـ API** (بقى في الـ CI من ١٥ أكتوبر ٢٠٢٦): لما تنضم لجروب عام، هل كلامه القديم بيبان؟
 *
 * ليه يدوي: اختبارات `test/ui/` بتشتغل على بناء الديمو اللي **مابيعملش ولا نداء
 * شبكة**، والعطل ده بالتحديد في **تحميل البيانات من السيرفر**: الواجهة كانت
 * بتجيب رسايل المحادثات **مرة واحدة** وقت تشغيل التطبيق، فأي محادثة بتدخلها بعد
 * كده (جروب عام · قناة · محادثة جاية من السوكت) تبان **فاضية** لحد التحديث.
 *
 * الخطوات (محتاج postgres شغّال على 5432):
 *   1) cd /home/claude/raachat-new && VITE_API_URL=http://localhost:4112 npx vite build -c vite.single.config.ts
 *   2) cd server && npx tsx test/manual/join-history.ts
 *
 * المتوقّع على الكود الجديد: `after-join-messages` فيها الرسالتين القديمتين.
 * وعلى الكود القديم: فاضية (الجروب يبان مالوش أي كلام).
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
const NAME = "rc_verify_join";
const API = 4112;
const WEB = 5174;
const OLD1 = "كلام قديم قبل ما تنضم";
const OLD2 = "وده كلام تاني من قبلك";

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
    // `birthDate` **مطلوب** لإنشاء أي حساب جديد من ١٣ أكتوبر (التطبيق ١٨+).
    // ومن غيره المسار بيرجّع `birth_date_required` و`v.user` تبقى undefined —
    // وده اللي كان مكسّر السكربتين دول في سكوت، لأنهم مكانوش في الـ CI.
    const v = (await post("/auth/otp/verify", { channel: "phone", target: phone, code, birthDate: "1990-05-20" })).body as any;
    if (!v?.user?.id) throw new Error(`تسجيل الدخول فشل لـ ${phone}: ${JSON.stringify(v)}`);
    await fetch(`http://localhost:${API}/me`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.accessToken}` }, body: JSON.stringify({ name }) });
    return v;
  };

  // صاحب الجروب بيعمل جروب **عام** وبيكتب فيه كلام قبل ما ننضم
  const owner = await login("01099000021", "صاحب الجروب");
  const me = await login("01099000022", "داليا");
  const g = (await post("/threads", { type: "group", name: "جروب الأخبار العام", isPublic: true }, owner.accessToken)).body as any;
  await post(`/threads/${g.id}/messages`, { text: OLD1 }, owner.accessToken);
  await post(`/threads/${g.id}/messages`, { text: OLD2 }, owner.accessToken);

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

  await page.goto(`http://localhost:${WEB}/`);
  await page.waitForTimeout(2500);
  const dlg = page.locator('[role="dialog"]');
  if (await dlg.count()) {
    const skip = page.getByRole("button", { name: /لاحقًا|تخطّى|تخطي|مش دلوقتي|إغلاق|Later|Skip|Not now|Close/ });
    if (await skip.count()) await skip.first().click(); else await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }
  await page.evaluate(() => document.querySelectorAll(".fixed.inset-0").forEach((e) => e.remove()));

  // تاب الجروبات → «اكتشف جروبات» → انضمام
  await page.getByRole("link", { name: /الجروبات|Groups/ }).click();
  await page.waitForTimeout(1500);
  const join = page.getByRole("button", { name: /^انضمام$|^Join$/ });
  out.push(`join-buttons=${await join.count()}`);
  await join.first().click();
  await page.waitForTimeout(2000);

  // ندخل الجروب من قايمة «جروباتي» (من غير أي تحديث للصفحة — ده بيت القصيد)
  await page.getByText("جروب الأخبار العام").first().click();
  await page.waitForTimeout(2000);
  const body = await page.locator("body").innerText();
  const has1 = body.includes(OLD1), has2 = body.includes(OLD2);
  out.push(`after-join-messages=${JSON.stringify([has1 ? OLD1 : null, has2 ? OLD2 : null].filter(Boolean))}`);
  out.push(has1 && has2 ? "✅ الكلام القديم بان من غير تحديث" : "❌ الجروب بان فاضي (الكلام القديم ما اتحمّلش)");

  console.log(out.join("\n"));
  await browser.close();
  web.close();
  server.close();
  await ctx.db.$disconnect();
  const a2 = new pg.Client({ connectionString: ADMIN });
  await a2.connect();
  await a2.query(`DROP DATABASE IF EXISTS "${NAME}" WITH (FORCE)`);
  await a2.end();
  process.exit(has1 && has2 ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
