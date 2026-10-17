import type { Config } from "../config.js";
import { otpEmail } from "./otp-email.js";
import { buildSmsRequest, parseSmsSpec, redactSmsSecrets, smsOtpText, smsSucceeded, type SmsSpec } from "./sms.js";

/** مُرسِل رمز التحقق — بدّليه بأي مزود SMS/Email */
/** أول أصل في `CORS_ORIGIN` مش localhost/127.0.0.1 — شوفي سبب الاستثناء تحت */
export function firstPublicOrigin(list: string): string {
  const parts = list.split(",").map((x) => x.trim()).filter(Boolean);
  const isLocal = (u: string) => /^[a-z]+:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(u);
  return parts.find((u) => !isLocal(u)) ?? parts[0] ?? "";
}

export interface OtpSender {
  send(channel: "phone" | "email", target: string, code: string): Promise<void>;
  /**
   * هل القناة دي مضبوطة فعلًا؟ (مفاتيح موجودة). لو رجّعت `false` بنرفض الطلب
   * **قبل** ما نكتب كود في القاعدة ونستهلك حد الساعة — ونقول للمستخدم السبب
   * بدل «تعذّر إرسال الكود» المبهمة. مش موجودة = نفترض شغّالة (الاختبارات).
   */
  ready?(channel: "phone" | "email"): boolean;
}

export const consoleSender: OtpSender = {
  ready: () => true,
  async send(channel, target, code) {
    console.log(`[OTP dev] ${channel} ${target} → ${code}`);
  },
};

/**
 * SMS (مجمّع عام أو Twilio) + Resend (Email) عبر REST.
 *
 * ترتيب الـ SMS: `SMS_HTTP` (أي مجمّع مصري) له الأولوية، وTwilio بديل — لأن
 * Twilio مسدود لمصر (محتاج تسجيل Alphanumeric Sender ID). ولو `SMS_HTTP` موجود
 * ومعطوب، القناة تتعامل كأنها **مش متضبطة** (رسالة واضحة للمستخدم بدل انهيار
 * الـ API كله على غلطة في مفتاح).
 */
export function providerSender(c: Config, f: typeof fetch = fetch): OtpSender {
  let sms: SmsSpec | undefined;
  try {
    sms = parseSmsSpec(c.SMS_HTTP);
  } catch (e) {
    console.error("⚠️ SMS_HTTP معطوب فالـ SMS متوقف:", (e as Error).message);
  }
  return {
    ready: (channel) =>
      channel === "phone"
        ? !!sms || !!(c.TWILIO_SID && c.TWILIO_TOKEN && c.TWILIO_FROM)
        : !!(c.RESEND_KEY && c.EMAIL_FROM),
    async send(channel, target, code) {
      if (channel === "phone") {
        if (sms) {
          const { url, init } = buildSmsRequest(sms, target, code);
          const r = await f(url, init as RequestInit);
          const body = await r.text().catch(() => "");
          // النجاح = 2xx **و** علامة المزوّد في الجسم. أغلب المجمّعات بترجّع 200
          // مع كود خطأ (رصيد خلص · مرسل مرفوض)، فالحكم بـ r.ok لوحده = ✅ كدّابة.
          if (!smsSucceeded(sms, r.status, body)) {
            console.error(`sms_failed status=${r.status} body=${redactSmsSecrets(sms, body).slice(0, 200)}`);
            throw new Error("sms_failed");
          }
          return;
        }
        if (!c.TWILIO_SID || !c.TWILIO_TOKEN || !c.TWILIO_FROM) throw new Error("sms_not_configured");
        const to = target.startsWith("+") ? target : `+2${target}`; // أرقام مصر 01xxxxxxxxx
        const r = await f(`https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_SID}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${c.TWILIO_SID}:${c.TWILIO_TOKEN}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: c.TWILIO_FROM, Body: smsOtpText(code) }),
        });
        if (!r.ok) throw new Error("sms_failed");
      } else {
        if (!c.RESEND_KEY || !c.EMAIL_FROM) throw new Error("email_not_configured");
        // ⚠️ أول أصل **غير محلّي**: الـ APK بتاع Capacitor أصله `https://localhost`،
        // ولازم يتضاف لـ CORS_ORIGIN — فلو اتضاف في أول القايمة وأخدناه هنا، كل
        // إيميل تحقق يبقى رابطه `https://localhost` **لكل المستخدمين**. فبدل ما
        // نعتمد على ترتيب القايمة، بنعدّي المحلي.
        const appUrl = (c.APP_URL || firstPublicOrigin(c.CORS_ORIGIN) || "").trim();
        const mail = otpEmail({ code, appUrl, minutes: 5 });
        const r = await f("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${c.RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: c.EMAIL_FROM, to: target, subject: mail.subject, html: mail.html, text: mail.text }),
        });
        if (!r.ok) throw new Error("email_failed");
      }
    },
  };
}
