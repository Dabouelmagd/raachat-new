/**
 * مفاتيح VAPID: التوليد (`scripts/lib/vapidgen.js`) والفحص (`scripts/lib/vapidcheck.mjs`).
 *
 * ليه الاختبار ده موجود: المفتاح العام بيوصل للمتصفح وقت الاشتراك، والمفتاح الخاص
 * بيوقّع كل إشعار. لو الزوج غير متطابق — أو لو التوليد قصّ المفتاح الخاص غلط —
 * **مفيش أي خطأ عندنا**: `web-push` بيبعت عادي، وخدمة الدفع هي اللي ترفض بـ 403،
 * والمستخدم مايوصلوش إشعار من غير ما حد يعرف. والاختبار بيثبّت الحقيقة دي
 * (`web-push` مابيكتشفش الزوج الغلط) وإن الفاحص بيكتشفه.
 *
 * ملحوظة على التوليد: `vapidgen.js` بياخد المفتاح الخاص **بإزاحة ثابتة** من
 * PKCS8 DER (`subarray(36, 68)`). الفحص بالاشتقاق هو اللي بيثبّت إن الإزاحة صح.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";

const ROOT = path.resolve(import.meta.dirname, "../..");
const GEN = path.join(ROOT, "scripts/lib/vapidgen.js");
const CHECK = path.join(ROOT, "scripts/lib/vapidcheck.mjs");

/** بيشغّل المولّد بنفس طريقة السكربت بالظبط: `node < vapidgen.js` (stdin = CommonJS). */
function generate() {
  const out = execFileSync("node", { input: fs.readFileSync(GEN), encoding: "utf8" });
  const [pub, prv] = out.trim().split(/\s+/);
  return { pub: pub!, prv: prv! };
}

function check(env: Record<string, string>) {
  try {
    const stdout = execFileSync("node", [CHECK], { encoding: "utf8", env: { ...process.env, ...env } });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { status: number; stderr: string; stdout: string };
    return { code: err.status, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

describe("مفاتيح VAPID", () => {
  it("المولّد بيطلّع زوج سليم والفاحص بيقبله", () => {
    const { pub, prv } = generate();
    expect(fromB64url(pub).length).toBe(65);
    expect(fromB64url(pub)[0]).toBe(0x04);
    expect(fromB64url(prv).length).toBe(32);
    const r = check({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv, VAPID_SUBJECT: "mailto:a@b.c" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("✅");
  });

  it("المفتاح العام فعلًا مشتق من الخاص (مش بس شكله سليم)", () => {
    const { pub, prv } = generate();
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(fromB64url(prv));
    expect(ecdh.getPublicKey().equals(fromB64url(pub))).toBe(true);
  });

  it("الفاحص بيكشف الزوج غير المتطابق — واللي بيبعت فعلًا (web-push) مابيكشفهوش", () => {
    const a = generate();
    const b = generate();
    // ١) الفاحص بيرفض
    const r = check({ VAPID_PUBLIC: a.pub, VAPID_PRIVATE: b.prv });
    expect(r.code).toBe(1);
    expect(r.out).toContain("مش مشتقًّا");

    // ٢) web-push بيبعت الهيدر عادي — فمفيش خطأ عندنا، والرفض بييجي من خدمة الدفع
    const h = webpush.getVapidHeaders("https://fcm.googleapis.com", "mailto:a@b.c", a.pub, b.prv, "aes128gcm");
    expect(h.Authorization).toContain("vapid t=");
    const [t, k] = h.Authorization.replace("vapid ", "").split(", ").map((s) => s.split("=").slice(1).join("="));
    const [head, body, sig] = t!.split(".");
    const kb = fromB64url(k!);
    const pubKey = crypto.createPublicKey({
      key: { kty: "EC", crv: "P-256", x: kb.subarray(1, 33).toString("base64url"), y: kb.subarray(33, 65).toString("base64url") },
      format: "jwk",
    });
    // التوقيع **مش** متحقَّق بالمفتاح المعلن (k=) — ده بالظبط الـ 403 الصامت
    const ok = crypto.verify("sha256", Buffer.from(`${head}.${body}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, fromB64url(sig!));
    expect(ok).toBe(false);
  });

  it("الزوج المتطابق: توقيع web-push متحقَّق بالمفتاح المعلن، والمعلن هو اللي بنديه للمتصفح", () => {
    const { pub, prv } = generate();
    const h = webpush.getVapidHeaders("https://fcm.googleapis.com", "mailto:a@b.c", pub, prv, "aes128gcm");
    const [t, k] = h.Authorization.replace("vapid ", "").split(", ").map((s) => s.split("=").slice(1).join("="));
    expect(k).toBe(pub); // نفس المفتاح اللي /push/key بيرجّعه للمتصفح
    const [head, body, sig] = t!.split(".");
    const kb = fromB64url(k!);
    const pubKey = crypto.createPublicKey({
      key: { kty: "EC", crv: "P-256", x: kb.subarray(1, 33).toString("base64url"), y: kb.subarray(33, 65).toString("base64url") },
      format: "jwk",
    });
    expect(crypto.verify("sha256", Buffer.from(`${head}.${body}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, fromB64url(sig!))).toBe(true);
    expect(JSON.parse(fromB64url(head!).toString()).alg).toBe("ES256");
  });

  it("الـ API مابيحذّرش من الزوج الغلط — فالفحص القديم (غياب التحذير) كان بيطبع ✅ عليه", async () => {
    const a = generate();
    const b = generate();
    const { createWebPush } = await import("../src/lib/push.js");
    // السيرفر بيشوف المفاتيح «متضبطة» لأن الاتنين موجودين — مافيش أي تحقق من تطابقهم،
    // فالتحذير مابيطلعش في اللوج، والفحص القديم كان بيعتبر ده نجاح.
    const sender = createWebPush({ VAPID_PUBLIC: a.pub, VAPID_PRIVATE: b.prv, VAPID_SUBJECT: "mailto:a@b.c" } as never);
    expect(sender).toBeDefined();
    expect(sender!.publicKey).toBe(a.pub);
  });

  it("السكربت بيفحص قبل الكتابة، وحكمه مش «غياب تحذير من اللوج»", () => {
    const sh = fs.readFileSync(path.join(ROOT, "scripts/set-vapid.sh"), "utf8");
    // مفيش حكم على غياب تحذير في اللوج (الفحص السلبي اللي قاعدة الفحوص بتمنعه)
    expect(sh).not.toMatch(/logs .*\|\s*grep -q "VAPID/);
    // الفحص قبل الكتابة في .env.production
    const check = sh.indexOf("vapidcheck.mjs");
    const write = sh.indexOf("open(p).read()"); // سطر الكتابة في .env.production
    expect(check).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(check);
    // وبعد إعادة التشغيل: فحص جوه الكونتينر الشغّال نفسه
    expect(sh).toMatch(/exec -T api node .*--input-type=module/);
  });

  it("المراقبة بتفحص Push **بس لو متضبط**، وبفحص إيجابي مش بغياب تحذير", () => {
    const mon = fs.readFileSync(path.join(ROOT, "scripts/monitor.sh"), "utf8");
    const i = mon.indexOf("VAPID_PRIVATE=.+");
    expect(i, "فحص Push مش مشروط بوجود المفتاح — مش متضبط هيبقى عطل كل ١٠ دقايق").toBeGreaterThan(0);
    // الفحص نفسه هو vapidcheck (اشتقاق + توقيع)، مش grep على اللوج
    expect(mon.indexOf("vapidcheck.mjs")).toBeGreaterThan(i);
    expect(mon).not.toMatch(/logs .*\|\s*grep -q "VAPID/);
  });

  it("مفتاح واحد بس متضبط = الإشعارات مقفولة **في سكوت** (ده اللي --check بيكشفه)", async () => {
    const { pub, prv } = generate();
    const { createWebPush } = await import("../src/lib/push.js");
    // الحارس في set-vapid.sh بيطابق `^VAPID_PRIVATE=.+` لوحده — فلو العام ناقص،
    // السكربت يقول «متضبط بالفعل» و`createWebPush` بيرجّع undefined، و/push/key
    // بيرجّع null، والواجهة تقول «غير متاح»: مفيش ولا إشعار ومفيش ولا خطأ.
    expect(createWebPush({ VAPID_PUBLIC: "", VAPID_PRIVATE: prv, VAPID_SUBJECT: "mailto:a@b.c" } as never)).toBeUndefined();
    expect(createWebPush({ VAPID_PUBLIC: pub, VAPID_PRIVATE: "", VAPID_SUBJECT: "mailto:a@b.c" } as never)).toBeUndefined();
    // والزوج الكامل بيطلّع مُرسِلًا، والمفتاح العام هو اللي /push/key بيوزّعه
    expect(createWebPush({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv, VAPID_SUBJECT: "mailto:a@b.c" } as never)?.publicKey).toBe(pub);
  });

  it("السكربت فيه --check بيفحص بلا كتابة ولا توليد", () => {
    const sh = fs.readFileSync(path.join(ROOT, "scripts/set-vapid.sh"), "utf8");
    const chk = sh.indexOf('--check');
    expect(chk, "مفيش --check — الحالة الحقيقية مش معروفة إلا بتوليد مفاتيح جديدة").toBeGreaterThan(0);
    // بيخرج قبل التوليد وقبل الكتابة: مفيش أثر جانبي خالص
    const exitChk = sh.indexOf("exit 0", chk);
    expect(exitChk).toBeLessThan(sh.indexOf("vapidgen.js"));
    expect(exitChk).toBeLessThan(sh.indexOf("open(p,'w').write"));
    // وبيفحص الزوج **و** المفتاح اللي بيوصل للمتصفح — والاتنين جوه الحاوية
    expect(sh.slice(chk, exitChk)).toMatch(/vapidcheck\.mjs/);
    expect(sh.slice(chk, exitChk)).toMatch(/pushprobe\.mjs/);
    // **مش بـ curl على /push/key** — المسار ورا التوكن (الاختبار اللي بعده).
    // بنشيل التعليقات الأول، لأن التعليق نفسه بيشرح إننا مابنستخدمش curl.
    const code = sh.slice(chk, exitChk).split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
    expect(code).not.toMatch(/curl/);
  });

  it("المراقبة مابتكتفيش بتطابق الزوج — بتتأكد إن المفتاح بيوصل للمتصفح", () => {
    const mon = fs.readFileSync(path.join(ROOT, "scripts/monitor.sh"), "utf8");
    const i = mon.indexOf("vapidcheck.mjs");
    const j = mon.indexOf("pushprobe.mjs", i);
    // الزوج المتطابق مش كفاية: لو مفتاح من الزوج ناقص، createWebPush بترجّع
    // undefined و/push/key يرجّع null والواجهة تقول «غير متاح» — في سكوت.
    expect(j, "فحص Push مابيتأكدش إن المفتاح بيتوزّع — null بيعدّي بـ ✅").toBeGreaterThan(i);
    expect(mon.slice(i)).toMatch(/fail "push"/);
    expect(mon.slice(i, i + 1200)).not.toMatch(/curl[\s\S]*push\/key/);
  });

  it("`/push/key` ورا التوكن — فأي فحص بـ curl بيرجّع 401 مهما كانت المفاتيح سليمة", async () => {
    // ده سبب وجود pushprobe.mjs: أول نسخة من --check نادت المسار بـ curl
    // فطلعت 401 على إنتاج مفاتيحه سليمة تمامًا.
    const { startTestEnv } = await import("./helpers.js");
    const env = await startTestEnv();
    try {
      await request(env.app).get("/push/key").expect(401);
      const a = await env.login("01097000001", "دالية");
      expect((await request(env.app).get("/push/key").set(a.auth)).body.publicKey).toBeTruthy();
    } finally { await env.stop(); }
  }, 120_000);

  it("الفاحص بيرفض الموضوع اللي web-push بترمي عليه (والـ API مش بيقوم بيه)", () => {
    const { pub, prv } = generate();
    for (const bad of ["admin@kenoz.org", "http://kenoz.org", "mailto:", "رع شات"]) {
      const r = check({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv, VAPID_SUBJECT: bad });
      expect(r.code, `الموضوع «${bad}» عدّى والمفروض يترفض`).toBe(1);
      expect(r.out).toMatch(/mailto:/);
    }
    for (const good of ["mailto:info@datalifeai.com", "https://app.kenoz.org"]) {
      expect(check({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv, VAPID_SUBJECT: good }).code).toBe(0);
    }
    // و`web-push` فعلًا بترمي على الشكل الغلط — فالفحص مطابق لسلوك الإنتاج
    expect(() => webpush.setVapidDetails("admin@kenoz.org", pub, prv)).toThrow();
  });

  it("الموضوع النموذجي بيتنبّه عليه ومابيفشّلش (الاشتراكات مش بتتأثر بتغييره)", () => {
    const { pub, prv } = generate();
    // `.env.production.example` فيه `mailto:you@yourdomain.com` — إيميل مش
    // موجود. المواصفة بتسمح لخدمة الدفع ترفض، فلازم ينبّه؛ إنما مش عطل مثبّت
    // فمابيفشّلش المراقبة كل ١٠ دقايق.
    const r = check({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv, VAPID_SUBJECT: "mailto:you@yourdomain.com" });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/⚠️/);
    expect(r.out).toMatch(/--subject/);
    // والتصليح موجود فعلًا وبيغيّر الموضوع **بس**
    const sh = fs.readFileSync(path.join(ROOT, "scripts/set-vapid.sh"), "utf8");
    const i = sh.indexOf('"--subject"');
    expect(i).toBeGreaterThan(0);
    const block = sh.slice(i, sh.indexOf("exit 0", i));
    expect(block).toMatch(/VAPID_SUBJECT=/);
    expect(block, "مسار --subject بيولّد مفاتيح — ده بيقتل الاشتراكات").not.toMatch(/vapidgen/);
    expect(block).toMatch(/VAPID_PUBLIC=/); // بيعيد استخدام المفاتيح الموجودة
  });

  it("pushprobe بيكشف اللي /push/key هيرجّعه فعلًا (بلا توكن)", async () => {
    const { pub, prv } = generate();
    const src = fs.readFileSync(path.join(ROOT, "scripts/lib/pushprobe.mjs"), "utf8");
    const base = {
      RC_PUSH_LIB: path.join(ROOT, "server/src/lib/push.ts"),
      RC_CONFIG_LIB: path.join(ROOT, "server/src/config.ts"),
      DATABASE_URL: "postgresql://x/y", JWT_SECRET: "x".repeat(20),
      VAPID_SUBJECT: "mailto:a@b.co",
    };
    const run = (env: Record<string, string>) =>
      new Promise<{ code: number; out: string }>((resolve) => {
        execFile("node", ["--import", "tsx", "--input-type=module", "-"],
          { encoding: "utf8", env: { ...process.env, ...base, ...env }, cwd: path.join(ROOT, "server") },
          (err, so, se) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: so + se }),
        ).stdin!.end(src);
      });
    // الزوج الكامل: المفتاح بيتوزّع
    const okRun = await run({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv });
    expect(okRun.out).toContain("✅");
    expect(okRun.code).toBe(0);
    // العام ناقص: createWebPush بترجّع undefined → /push/key = null **في سكوت**
    const half = await run({ VAPID_PUBLIC: "", VAPID_PRIVATE: prv });
    expect(half.code).toBe(1);
    expect(half.out).toMatch(/null/);
  }, 60_000);

  it("الفاحص بيرفض المفتاح المقصوص والمفقود", () => {
    const { pub, prv } = generate();
    expect(check({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv.slice(0, 20) }).code).toBe(1);
    expect(check({ VAPID_PUBLIC: pub.slice(0, 40), VAPID_PRIVATE: prv }).code).toBe(1);
    expect(check({ VAPID_PUBLIC: "", VAPID_PRIVATE: "" }).code).toBe(1);
  });
});
