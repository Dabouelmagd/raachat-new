import { describe, expect, it } from "vitest";
import { otpEmail } from "../src/lib/otp-email.js";
import { providerSender } from "../src/lib/senders.js";
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
});
