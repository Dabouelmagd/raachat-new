/**
 * تحقّق في **وضع الـ API**: حالات الرسالة التلاتة — **اتبعتت ← وصلت ← اتقرت**.
 *
 * ليه هنا مش في `test/ui/`: الحالات دي **كلها من السيرفر والسوكت**. «وصلت»
 * بتتسجّل أول ما جهاز الطرف التاني **يتصل بالسوكت** (`markDelivered`)، و«اتقرت»
 * أول ما **يفتح المحادثة** — وبناء الديمو مابيعملش ولا نداء شبكة، فالحالات
 * تتولد فيه من بيانات مزروعة، ومفيش فيه طريق نجرّب بيه الانتقال الحقيقي.
 * واختبارات السيرفر (`delivered.test.ts`) بتفحص الأعمدة والردود — **مش العلامة
 * اللي المستخدم بيشوفها على الشاشة**.
 *
 * الخطوات (محتاج postgres شغّال على 5432):
 *   1) cd /home/claude/raachat-new && VITE_API_URL=http://localhost:4113 npx vite build -c vite.single.config.ts
 *   2) cd server && npx tsx test/manual/message-states.ts
 *
 * الحكم: بيخرج بـ **٢** لو أي حالة ما ظهرتش بالترتيب الصح. والعلامة بتتقرا من
 * `aria-label` (اتبعتت/وصلت/اتقرت) مش من لون ولا كلاس — ده اللي قارئ الشاشة
 * بيقوله فعلًا، وبيتغيّر مع المعنى مش مع التنسيق.
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
const NAME = "rc_verify_states";
const API = 4113;
const WEB = 5175;
const TEXT = "علامات التسليم يا مريم";

const fail: string[] = [];
const out: string[] = [];

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
    const v = (await post("/auth/otp/verify", { channel: "phone", target: phone, code, birthDate: "1990-05-20" })).body as any;
    if (!v?.user?.id) throw new Error(`تسجيل الدخول فشل لـ ${phone}: ${JSON.stringify(v)}`);
    await fetch(`http://localhost:${API}/me`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.accessToken}` }, body: JSON.stringify({ name }) });
    return v;
  };

  const me = await login("01099000031", "داليا");
  const her = await login("01099000032", "مريم");
  const th = (await post("/threads", { type: "dm", memberIds: [her.user.id] }, me.accessToken)).body as any;
  if (!th?.id) throw new Error(`المحادثة ما اتعملتش: ${JSON.stringify(th)}`);

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
  const openAs = async (v: any) => {
    const ctxB = await browser.newContext();
    const page = await ctxB.newPage();
    await page.addInitScript((s) => localStorage.setItem("rachat-session", s), JSON.stringify({ access: v.accessToken, refresh: v.refreshToken, meId: v.user.id }));
    page.on("pageerror", (e) => out.push("PAGEERROR " + e.message));
    await page.goto(`http://localhost:${WEB}/`);
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelectorAll(".fixed.inset-0").forEach((e) => e.remove()));
    return page;
  };

  /** العلامة على آخر رسالة بعتّها: بنقرا الأسماء المتاحة لقارئ الشاشة */
  const tickOf = async (page: import("playwright").Page) => {
    for (const label of ["اتقرت", "وصلت", "اتبعتت"]) {
      if (await page.getByLabel(label, { exact: true }).count()) return label;
    }
    return "مفيش";
  };
  const expectTick = async (page: import("playwright").Page, want: string, step: string) => {
    for (let i = 0; i < 24; i++) { // لحد ١٢ ثانية — السوكت والبثّ محتاجين وقت
      if ((await tickOf(page)) === want) { out.push(`✅ ${step}: ${want}`); return; }
      await page.waitForTimeout(500);
    }
    const got = await tickOf(page);
    out.push(`❌ ${step}: المتوقّع «${want}» واللي ظهر «${got}»`);
    fail.push(`${step}: ${got} ≠ ${want}`);
  };

  // ١) داليا بتبعت ومريم **عمرها ما اتصلت** → لازم «اتبعتت» بس
  const mine = await openAs(me);
  await mine.getByText("مريم").first().click();
  await mine.waitForTimeout(1200);
  const box = mine.getByPlaceholder(/اكتب رسالة|Type a message/);
  await box.fill(TEXT);
  await mine.getByRole("button", { name: /إرسال|Send/ }).click();
  await expectTick(mine, "اتبعتت", "١) بعد الإرسال ومريم مش متصلة");

  // ٢) مريم بتفتح التطبيق بس **مش بتفتح المحادثة** → السوكت بيتصل فتبقى «وصلت»
  const hers = await openAs(her);
  await expectTick(mine, "وصلت", "٢) بعد ما جهاز مريم اتصل");

  // ٣) مريم بتفتح المحادثة → «اتقرت» (وبيوصل لداليا على السوكت من غير تحديث)
  await hers.getByText("داليا").first().click();
  await hers.waitForTimeout(1500);
  await expectTick(mine, "اتقرت", "٣) بعد ما مريم فتحت المحادثة");

  // 🔴 تشخيص: لو بعد إعادة التحميل بقت «اتقرت»، يبقى **الداتا سليمة والبثّ
  // هو المكسور** — يعني المستخدم بيبعت والطرف التاني يقرا والعلامة عنده
  // مافيهاش حركة لحد ما يعمل تحديث. ولو فضلت «اتبعتت» يبقى السيرفر نفسه.
  await mine.reload();
  await mine.waitForTimeout(2500);
  await mine.evaluate(() => document.querySelectorAll(".fixed.inset-0").forEach((e) => e.remove()));
  await mine.getByText("مريم").first().click();
  await mine.waitForTimeout(1500);
  out.push(`tick-after-reload=${await tickOf(mine)}`);

  // ٤) والعدّاد عند مريم لازم يكون اتصفّر بعد ما فتحت (مش علامة عند داليا — ده عندها)
  const herBody = await hers.locator("body").innerText();
  out.push(`unread-badge-at-her=${/\b1\b/.test(herBody.split("داليا")[0] ?? "") ? "لسه" : "اتصفّر"}`);

  console.log(out.join("\n"));
  await browser.close();
  server.close(); web.close();
  const a1 = new pg.Client({ connectionString: ADMIN });
  await a1.connect();
  await a1.query(`DROP DATABASE IF EXISTS "${NAME}" WITH (FORCE)`).catch(() => {});
  await a1.end();
}

main().then(() => {
  if (fail.length) { console.error("\n❌ حالات ما ظهرتش صح:\n- " + fail.join("\n- ")); process.exit(2); }
  console.log("\n✅ التلات حالات ظهرت بالترتيب: اتبعتت ← وصلت ← اتقرت");
}).catch((e) => { console.error(e); process.exit(1); });
