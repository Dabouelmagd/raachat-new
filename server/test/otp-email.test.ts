import { describe, expect, it, vi } from "vitest";
import { otpEmail } from "../src/lib/otp-email.js";
import { providerSender, redactEmailBody } from "../src/lib/senders.js";
import { loadConfig } from "../src/config.js";

const base = { DATABASE_URL: "postgresql://x/y", JWT_SECRET: "test-secret-test-secret" } as NodeJS.ProcessEnv;

describe("إيميل كود التحقق", () => {
  it("فيه الكود واللوجو والاسم وروابط قانونية، ونسخة نصية", () => {
    const m = otpEmail({ code: "483920", appUrl: "https://app.kenoz.org/", minutes: 5 });
    expect(m.subject).toContain("483920");
    expect(m.html).toContain("483920");
    expect(m.html).toContain("https://app.kenoz.org/icon.png"); // اللوجو (من غير سلاش مزدوج)
    expect(m.html).not.toContain("org//");
    expect(m.html).toContain("رع شات");
    expect(m.html).toContain("https://app.kenoz.org/legal/privacy.html");
    expect(m.html).toContain('dir="rtl"');
    expect(m.text).toContain("483920");
    expect(m.text).toContain("5 دقائق");
    // HTML الإيميل: مفيش <style> ولا كلاسات — الستايل inline عشان Gmail/Outlook
    expect(m.html).not.toMatch(/<style|class=|<script/);
  });

  it("بيهرب أي HTML جاي من بره", () => {
    const m = otpEmail({ code: "1<b>2", appUrl: 'https://x.test/"onerror="alert(1)', minutes: 5 });
    expect(m.html).not.toContain("<b>");
    expect(m.html).toContain("1&lt;b&gt;2");
    expect(m.html).not.toContain('"onerror="');
  });

  /**
   * 🔴 **الفخّ اللي الـ APK فتحه.** تطبيق Capacitor أصله `https://localhost`
   * فلازم يتضاف لـ `CORS_ORIGIN`. و`APP_URL` الفاضي بياخد أصلًا من القايمة —
   * فلو حد ضافه في **أول** القايمة، كل إيميل تحقق يبقى رابطه `https://localhost`
   * **لكل المستخدمين**، واللوجو مايظهرش والروابط ميتة. والعطل صامت: الإيميل
   * بيوصل عادي. فالاختيار بقى «أول أصل غير محلّي».
   */
  it("أصل الـ APK المحلي في أول CORS_ORIGIN مابيكسرش رابط الإيميل", async () => {
    const config = loadConfig({ ...base, RESEND_KEY: "re_k", EMAIL_FROM: "a@b.c", CORS_ORIGIN: "https://localhost,https://app.kenoz.org" });
    let sent: { body: Record<string, string> } | null = null;
    const fake = (async (_u: unknown, init: { body: string }) => {
      sent = { body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await providerSender(config, fake).send("email", "dalia@example.com", "445566");
    expect(sent!.body.html, "الرابط مابيروحش لـ localhost").not.toContain("localhost");
    expect(sent!.body.html).toContain("https://app.kenoz.org/icon.png");
  });

  it("المرسِل بيبعت html + text + subject لـ Resend، والرابط بيرجع لـ CORS_ORIGIN", async () => {
    const config = loadConfig({ ...base, RESEND_KEY: "re_k", EMAIL_FROM: "Raa Chat <no-reply@kenoz.org>", CORS_ORIGIN: "https://app.kenoz.org,https://admin.kenoz.org" });
    let sent: { url: string; body: Record<string, string> } | null = null;
    const fake = (async (url: unknown, init: { body: string }) => {
      sent = { url: String(url), body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await providerSender(config, fake).send("email", "dalia@example.com", "112233");
    expect(sent!.url).toBe("https://api.resend.com/emails");
    expect(sent!.body.to).toBe("dalia@example.com");
    expect(sent!.body.from).toBe("Raa Chat <no-reply@kenoz.org>");
    expect(sent!.body.subject).toContain("112233");
    expect(sent!.body.html).toContain("https://app.kenoz.org/icon.png");
    expect(sent!.body.text).toContain("112233");
  });

  it("APP_URL بيغلب CORS_ORIGIN", async () => {
    const config = loadConfig({ ...base, RESEND_KEY: "re_k", EMAIL_FROM: "a@b.c", CORS_ORIGIN: "https://wrong.test", APP_URL: "https://app.kenoz.org" });
    let html = "";
    const fake = (async (_u: unknown, init: { body: string }) => {
      html = JSON.parse(init.body).html;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await providerSender(config, fake).send("email", "x@y.z", "999000");
    expect(html).toContain("https://app.kenoz.org/icon.png");
    expect(html).not.toContain("wrong.test");
  });

  /**
   * 🔴 **فشل الإرسال لازم يقول سببه.** قبل ٢٢ أكتوبر ٢٠٢٦ الفرع كان
   * `if (!r.ok) throw new Error("email_failed")` وخلاص — فاللوج يطلّع
   * `OTP send failed: email_failed` **ونفس السطر بالحرف** في كل الحالات:
   * مفتاح ملغي (401) · دومين مش متحقَّق (403) · سقف خلص (429) · عنوان محجوب.
   * فلما مستخدم بلّغ إن الكود ماوصلوش، مكانش في إيدينا حاجة نفرّق بيها.
   */
  it("🔴 فشل Resend بيتسجّل بالـ status وجسم الرد", async () => {
    const config = loadConfig({ ...base, RESEND_KEY: "re_live_abcdefghij", EMAIL_FROM: "a@b.c", CORS_ORIGIN: "https://app.kenoz.org" });
    const fake = (async () =>
      new Response(JSON.stringify({ statusCode: 403, message: "The kenoz.org domain is not verified" }), { status: 403 })
    ) as unknown as typeof fetch;

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(providerSender(config, fake).send("email", "someone@example.com", "123456")).rejects.toThrow("email_failed");
      const line = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(line, "الـ status هو اللي بيفرّق بين الأسباب").toContain("status=403");
      expect(line, "ورسالة المزوّد نفسها").toContain("not verified");
    } finally {
      log.mockRestore();
    }
  });

  it("🔴 واللوج مافيهوش المفتاح ولا إيميل المستخدم", async () => {
    const KEY = "re_live_secret_key_value";
    const config = loadConfig({ ...base, RESEND_KEY: KEY, EMAIL_FROM: "a@b.c", CORS_ORIGIN: "https://app.kenoz.org" });
    // Resend بيردّد العنوان في رفض كتير، والمفتاح وارد يترجّع في رسالة مصادقة
    const fake = (async () =>
      new Response(JSON.stringify({ message: `invalid key ${KEY} for recipient someone@example.com` }), { status: 401 })
    ) as unknown as typeof fetch;

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(providerSender(config, fake).send("email", "someone@example.com", "123456")).rejects.toThrow("email_failed");
      const line = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(line, "المفتاح ممنوع يدخل لوج على سيرفر مشترك").not.toContain(KEY);
      expect(line, "وبيانات المستخدم ممنوعة في اللوج").not.toContain("someone@example.com");
      expect(line).toContain("status=401");
    } finally {
      log.mockRestore();
    }
  });

  it("redactEmailBody: بيشيل المفتاح والعناوين، والمفتاح الفاضي مابيمسحش كل حاجة", () => {
    expect(redactEmailBody("key=re_abcdefghij to=a.b+x@mail.co.uk", "re_abcdefghij")).toBe("key=*** to=***@***");
    // مفتاح فاضي أو قصير جدًا: لو استخدمناه في الاستبدال كان هيحوّل النص كله نجوم
    expect(redactEmailBody("plain body", "")).toBe("plain body");
    expect(redactEmailBody("plain body", undefined)).toBe("plain body");
    expect(redactEmailBody("no secrets here")).toBe("no secrets here");
  });
});
