import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db.js";
import { attachRealtime } from "../src/realtime.js";
import type { Ctx } from "../src/context.js";
import type { OtpSender } from "../src/lib/senders.js";
import type { PushPayload, PushSender, PushSub } from "../src/lib/push.js";

const PORT = 54330 + Math.floor(Math.random() * 500);

/**
 * الافتراضي: postgres مدمج (مفيش تجهيز على جهاز المطوّر ولا في CI).
 * لكن النسخة المدمجة محتاجة مكتبات ICU قديمة ومابتشتغلش على كل توزيعة — فلو البيئة
 * فيها postgres حقيقي، `TEST_PG_URL` بيستخدمه: بيعمل **قاعدة باسم فريد لكل ملف
 * اختبار** (عشان الملفات اللي بتتشغّل بالتوازي ما تتلخبطش) وبيمسحها في الآخر.
 * مثال: TEST_PG_URL=postgresql://rachat:rachat@localhost:5432/postgres
 */
const EXTERNAL = process.env.TEST_PG_URL;

export async function startTestEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-pg-"));
  let embedded: EmbeddedPostgres | undefined;
  let url: string;
  let dropDb: (() => Promise<void>) | undefined;
  if (EXTERNAL) {
    const name = `rc_test_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
    const admin = new pg.Client({ connectionString: EXTERNAL });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();
    url = EXTERNAL.replace(/\/[^/?]*(\?|$)/, `/${name}$1`);
    dropDb = async () => {
      const a2 = new pg.Client({ connectionString: EXTERNAL });
      await a2.connect();
      await a2.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await a2.end();
    };
  } else {
    embedded = new EmbeddedPostgres({ databaseDir: dir, user: "rachat", password: "rachat", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C.UTF-8"] });
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase("rachat");
    url = `postgresql://rachat:rachat@localhost:${PORT}/rachat`;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  for (const d of fs.readdirSync(path.resolve("prisma/migrations")).sort()) {
    const p = path.resolve("prisma/migrations", d, "migration.sql");
    if (fs.existsSync(p)) await client.query(fs.readFileSync(p, "utf8"));
  }
  await client.end();

  const sent: { channel: string; target: string; code: string }[] = [];
  const sender: OtpSender = { async send(channel, target, code) { sent.push({ channel, target, code }); } };
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "rc-up-"));
  const config = loadConfig({
    NODE_ENV: "test", DATABASE_URL: url, JWT_SECRET: "test-secret-test-secret", RATE_LIMIT: "off", UPLOAD_DIR: uploads,
    GOOGLE_TRANSLATE_KEY: "k", OWNER_CONTACTS: "01099000001, boss@example.com", BANNED_WORDS: "كلمةممنوعة, badword",
  } as NodeJS.ProcessEnv);
  /** كل نداء شبكة خارج (للتأكد إن الكاش بيمنع نداءات متكررة للمزوّد المدفوع) */
  const fetched: string[] = [];
  const fakeFetch = (async (input: any, init?: any) => {
    const u = String(input);
    fetched.push(u);
    if (u.includes("translation.googleapis.com")) {
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: `[${body.target}] ${body.q}`, detectedSourceLanguage: "ar" }] } }), { status: 200 });
    }
    throw new Error("unexpected fetch " + u);
  }) as typeof fetch;
  const pushed: { sub: PushSub; payload: PushPayload }[] = [];
  const dead = new Set<string>(); // endpoints اللي هترجّع 410
  const push: PushSender = { publicKey: "test-public-key", async send(sub, payload) { if (dead.has(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 }); pushed.push({ sub, payload }); } };
  const ctx: Ctx = { db: createDb(url), config, sender, fetch: fakeFetch, push };
  const app = createApp(ctx);
  const server = http.createServer(app);
  attachRealtime(ctx, server);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;

  async function login(phone: string, name?: string) {
    await request(app).post("/auth/otp/request").send({ channel: "phone", target: phone }).expect(204);
    const code = sent.filter((s) => s.target === phone).at(-1)!.code;
    const r = await request(app).post("/auth/otp/verify").send({ channel: "phone", target: phone, code }).expect(200);
    const token = r.body.accessToken as string;
    if (name) await request(app).patch("/me").set("Authorization", `Bearer ${token}`).send({ name }).expect(200);
    return { token, refresh: r.body.refreshToken as string, user: r.body.user as { id: string; name: string }, auth: { Authorization: `Bearer ${token}` } };
  }

  return {
    app, ctx, sent, port, login, pushed, dead, fetched,
    async stop() {
      server.close();
      ctx.io?.close();
      await ctx.db.$disconnect();
      if (embedded) await embedded.stop();
      if (dropDb) await dropDb();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(uploads, { recursive: true, force: true });
    },
  };
}
