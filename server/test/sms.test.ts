/**
 * مجمّع SMS عام (`SMS_HTTP`).
 *
 * العطل اللي الاختبار ده موجود عشانه: **المجمّعات المصرية بترجّع HTTP 200 مع كود
 * خطأ في الجسم** (الرصيد خلص · اسم المرسل مش معتمد · الرقم غلط). فالحكم بـ `r.ok`
 * — زي ما Twilio كان متكتب — معناه إن السيرفر بيقول «الكود اتبعت» على رسالة عمرها
 * ما خرجت، والمستخدم يقعد يستنى. فالنجاح لازم يكون **2xx + علامة المزوّد في الرد**،
 * والمواصفة اللي مافيهاش علامة بتترفض من الأساس.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { providerSender } from "../src/lib/senders.js";
import { buildSmsRequest, normalizeEgPhone, parseSmsSpec, redactSmsSecrets, smsCountSent, smsOtpText, smsResetDay, smsSentToday, smsSucceeded, smsUnderDailyCap } from "../src/lib/sms.js";

const base = { DATABASE_URL: "postgresql://x/y", JWT_SECRET: "test-secret-test-secret" } as NodeJS.ProcessEnv;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

/** مواصفة على شكل SMS Misr (POST form، وعلامة نجاح 1901 في الجسم) */
const misr = {
  url: "https://smsmisr.com/api/",
  method: "POST",
  format: "form",
  params: { username: "myuser", password: "p@ss#1", sender: "RaaChat", Mobile: "{to20}", Message: "{text}", Language: "1" },
  ok: "1901",
};

describe("مواصفة SMS_HTTP", () => {
  it("بتترفض من غير علامة نجاح — عشان مانقولش ✅ على رسالة ما خرجت", () => {
    const { ok: _drop, ...noOk } = misr;
    expect(() => parseSmsSpec(b64(noOk))).toThrow(/ok مطلوب/);
    expect(() => parseSmsSpec(b64({ ...misr, ok: "  " }))).toThrow(/ok مطلوب/);
  });

  it("بتترفض لو مفيش قالب للرقم أو للنص، أو العنوان مش https، أو base64/JSON معطوب", () => {
    expect(() => parseSmsSpec(b64({ ...misr, params: { u: "x", Message: "{text}" } }))).toThrow(/قالب للرقم/);
    expect(() => parseSmsSpec(b64({ ...misr, params: { u: "x", Mobile: "{to}" } }))).toThrow(/قالب للنص/);
    expect(() => parseSmsSpec(b64({ ...misr, url: "http://smsmisr.com/api/" }))).toThrow(/https/);
    expect(() => parseSmsSpec(b64({ ...misr, params: {} }))).toThrow(/params/);
    expect(() => parseSmsSpec(b64({ ...misr, method: "PUT" }))).toThrow(/method/);
    expect(() => parseSmsSpec(Buffer.from("مش json").toString("base64"))).toThrow(/JSON/);
    expect(parseSmsSpec(undefined)).toBeUndefined();
    expect(parseSmsSpec("   ")).toBeUndefined();
  });

  it("القوالب بتتملا بصيغ الرقم التلاتة والنص والكود", () => {
    const spec = parseSmsSpec(b64({ ...misr, params: { a: "{to}", b: "{to20}", c: "{to+}", d: "{text}", e: "{code}" } }))!;
    const { init } = buildSmsRequest(spec, "01222139111", "123456");
    const p = new URLSearchParams(String((init as { body: string }).body));
    expect(p.get("a")).toBe("01222139111");
    expect(p.get("b")).toBe("201222139111");
    expect(p.get("c")).toBe("+201222139111");
    expect(p.get("d")).toBe(smsOtpText("123456"));
    expect(p.get("e")).toBe("123456");
  });

  it("الأرقام بتتطبّع: 01… و201… و+201… كلهم نفس الرقم، والغلط بيترفض", () => {
    for (const v of ["01222139111", "201222139111", "+20 122 213 9111", "00201222139111".slice(2)]) {
      expect(normalizeEgPhone(v)).toBe("01222139111");
    }
    expect(() => normalizeEgPhone("0122213911")).toThrow("bad_phone"); // ناقص رقم
    expect(() => normalizeEgPhone("dalia@example.com")).toThrow("bad_phone");
  });

  it("التلات صيغ: form في الجسم · json في الجسم · query في الرابط", () => {
    const f = buildSmsRequest(parseSmsSpec(b64(misr))!, "01222139111", "111111");
    expect(f.url).toBe("https://smsmisr.com/api/");
    expect((f.init as { headers: Record<string, string> }).headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const j = buildSmsRequest(parseSmsSpec(b64({ ...misr, format: "json" }))!, "01222139111", "111111");
    expect(JSON.parse(String((j.init as { body: string }).body)).Mobile).toBe("201222139111");

    const q = buildSmsRequest(parseSmsSpec(b64({ ...misr, method: "GET", format: "query" }))!, "01222139111", "111111");
    expect(q.url.startsWith("https://smsmisr.com/api/?")).toBe(true);
    expect(new URL(q.url).searchParams.get("Mobile")).toBe("201222139111");
    expect((q.init as { body?: string }).body).toBeUndefined();
  });
});

describe("حكم النجاح", () => {
  const spec = parseSmsSpec(b64(misr))!;

  it("٢٠٠ مع كود خطأ = فشل (ده بيت القصيد)", () => {
    expect(smsSucceeded(spec, 200, '{"code":"4904","message":"Insufficient balance"}')).toBe(false);
    expect(smsSucceeded(spec, 200, '{"code":"1903"}')).toBe(false); // اسم مرسل مرفوض
    expect(smsSucceeded(spec, 200, "")).toBe(false);
  });

  it("٢٠٠ مع العلامة = نجاح، وأي حالة غير 2xx = فشل حتى لو العلامة موجودة", () => {
    expect(smsSucceeded(spec, 200, '{"code":"1901","SMSID":"7788"}')).toBe(true);
    expect(smsSucceeded(spec, 500, '{"code":"1901"}')).toBe(false);
    expect(smsSucceeded(spec, 401, "1901")).toBe(false);
  });
});

describe("المرسِل", () => {
  const cfg = (extra: NodeJS.ProcessEnv) => loadConfig({ ...base, ...extra });

  it("بيبعت للمزوّد بالحقول الصح، وبيرمي sms_failed على ٢٠٠ + كود خطأ", async () => {
    const config = cfg({ SMS_HTTP: b64(misr) });
    let seen: { url: string; body: string } | null = null;
    const okFetch = (async (url: unknown, init: { body: string }) => {
      seen = { url: String(url), body: init.body };
      return new Response('{"code":"1901","SMSID":"1"}', { status: 200 });
    }) as unknown as typeof fetch;

    await providerSender(config, okFetch).send("phone", "01222139111", "445566");
    const p = new URLSearchParams(seen!.body);
    expect(seen!.url).toBe("https://smsmisr.com/api/");
    expect(p.get("Mobile")).toBe("201222139111");
    expect(p.get("Message")).toContain("445566");
    expect(p.get("sender")).toBe("RaaChat");

    const badFetch = (async () => new Response('{"code":"4904"}', { status: 200 })) as unknown as typeof fetch;
    await expect(providerSender(config, badFetch).send("phone", "01222139111", "445566")).rejects.toThrow("sms_failed");
  });

  it("SMS_HTTP بيفتح قناة الرقم من غير Twilio، وله الأولوية عليه", async () => {
    expect(providerSender(cfg({ SMS_HTTP: b64(misr) })).ready!("phone")).toBe(true);
    expect(providerSender(cfg({})).ready!("phone")).toBe(false);
    expect(providerSender(cfg({ TWILIO_SID: "s", TWILIO_TOKEN: "t", TWILIO_FROM: "f" })).ready!("phone")).toBe(true);

    // الاتنين موجودين → المجمّع العام هو اللي بيتنادى (Twilio مسدود لمصر)
    const config = cfg({ SMS_HTTP: b64(misr), TWILIO_SID: "s", TWILIO_TOKEN: "t", TWILIO_FROM: "f" });
    let host = "";
    const f = (async (url: unknown) => { host = new URL(String(url)).host; return new Response("1901", { status: 200 }); }) as unknown as typeof fetch;
    await providerSender(config, f).send("phone", "01222139111", "1");
    expect(host).toBe("smsmisr.com");
  });

  it("مواصفة معطوبة = القناة مقفولة، والـ API مابينهارش", () => {
    const s = providerSender(cfg({ SMS_HTTP: "مش-base64-ولا-json" }));
    expect(s.ready!("phone")).toBe(false);
    expect(s.ready!("email")).toBe(false); // مفيش Resend في الإعداد ده
  });

  it("رد المزوّد اللي بيرجّع كلمة السر مابيتطبعش فيها", () => {
    const spec = parseSmsSpec(b64(misr))!;
    const echo = 'ERROR for username=myuser&password=p@ss#1&sender=RaaChat';
    const safe = redactSmsSecrets(spec, echo);
    expect(safe).not.toContain("p@ss#1");
    expect(safe).not.toContain("myuser");
    expect(safe).toContain("«محجوب»");
  });
});

describe("السقف اليومي (سقف الفاتورة)", () => {
  it("بيعدّ لحد السقف وبعدين يقف، والناجحة بس هي اللي بتتحاسب", () => {
    smsResetDay();
    const day = "2026-10-13";
    expect(smsUnderDailyCap(3, day)).toBe(true);
    smsCountSent(day); smsCountSent(day);
    expect(smsSentToday(day)).toBe(2);
    expect(smsUnderDailyCap(3, day)).toBe(true);
    smsCountSent(day);
    expect(smsUnderDailyCap(3, day)).toBe(false); // خلص
    // الفحص نفسه مابيزوّدش العدّاد (لو بيزوّد، فحص واحد كان بياكل من السقف)
    expect(smsSentToday(day)).toBe(3);
  });

  it("بيصفّر مع يوم القاهرة الجديد مش يوم UTC", () => {
    smsResetDay();
    smsCountSent("2026-10-13");
    expect(smsUnderDailyCap(1, "2026-10-13")).toBe(false);
    expect(smsUnderDailyCap(1, "2026-10-14")).toBe(true); // يوم جديد = سقف جديد
    expect(smsSentToday("2026-10-13")).toBe(0);
  });

  it("صفر = بلا سقف", () => {
    smsResetDay();
    for (let i = 0; i < 50; i++) smsCountSent("2026-10-13");
    expect(smsUnderDailyCap(0, "2026-10-13")).toBe(true);
  });
});

describe("سكربت الضبط", () => {
  const sh = fs.readFileSync(path.join(import.meta.dirname, "../../scripts/set-sms-keys.sh"), "utf8");

  it("بيبعت رسالة حقيقية ويستنى تأكيد الوصول **قبل** أي كتابة", () => {
    const send = sh.indexOf("smssend.mjs");
    const confirm = sh.indexOf("وصلتك الرسالة");
    const write = sh.indexOf('put SMS_HTTP "$SPEC"');
    expect(send).toBeGreaterThan(0);
    expect(confirm).toBeGreaterThan(send);   // الإرسال قبل السؤال
    expect(write).toBeGreaterThan(confirm);  // والكتابة بعد التأكيد
  });

  it("مابيقبلش مواصفة من غير علامة نجاح، وبيفحص وصول المفتاح للكونتينر", () => {
    expect(sh).toMatch(/لازم علامة نجاح/);
    expect(sh).toMatch(/exec -T api node/);
  });

  it("بيتأكد إن compose بيمرّر المفتاح **قبل** أي إرسالة مدفوعة", () => {
    const preflight = sh.indexOf('config 2>/dev/null | grep -q "SMS_HTTP"');
    expect(preflight).toBeGreaterThan(0);
    expect(sh.indexOf("smssend.mjs")).toBeGreaterThan(preflight);
  });
});
