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
import { execFileSync } from "node:child_process";
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

  it("الفاحص بيرفض المفتاح المقصوص والمفقود", () => {
    const { pub, prv } = generate();
    expect(check({ VAPID_PUBLIC: pub, VAPID_PRIVATE: prv.slice(0, 20) }).code).toBe(1);
    expect(check({ VAPID_PUBLIC: pub.slice(0, 40), VAPID_PRIVATE: prv }).code).toBe(1);
    expect(check({ VAPID_PUBLIC: "", VAPID_PRIVATE: "" }).code).toBe(1);
  });
});
