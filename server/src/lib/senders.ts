import type { Config } from "../config.js";
import { otpEmail } from "./otp-email.js";

/** مُرسِل رمز التحقق — بدّليه بأي مزود SMS/Email */
export interface OtpSender {
  send(channel: "phone" | "email", target: string, code: string): Promise<void>;
}

export const consoleSender: OtpSender = {
  async send(channel, target, code) {
    console.log(`[OTP dev] ${channel} ${target} → ${code}`);
  },
};

/** Twilio (SMS) + Resend (Email) عبر REST. لم تُجرَّب على الشبكة الحقيقية — راجعيها بمفاتيحك. */
export function providerSender(c: Config, f: typeof fetch = fetch): OtpSender {
  return {
    async send(channel, target, code) {
      if (channel === "phone") {
        if (!c.TWILIO_SID || !c.TWILIO_TOKEN || !c.TWILIO_FROM) throw new Error("sms_not_configured");
        const to = target.startsWith("+") ? target : `+2${target}`; // أرقام مصر 01xxxxxxxxx
        const r = await f(`https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_SID}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${c.TWILIO_SID}:${c.TWILIO_TOKEN}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: c.TWILIO_FROM, Body: `رع شات: كود التحقق ${code}` }),
        });
        if (!r.ok) throw new Error("sms_failed");
      } else {
        if (!c.RESEND_KEY || !c.EMAIL_FROM) throw new Error("email_not_configured");
        const appUrl = (c.APP_URL || c.CORS_ORIGIN.split(",")[0] || "").trim();
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
