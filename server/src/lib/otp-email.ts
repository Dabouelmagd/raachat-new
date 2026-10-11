/**
 * قالب إيميل كود التحقق — بهوية رع شات (لوجو + اسم + ألوان فرعونية).
 * HTML الإيميل بيتكتب بجداول وستايل inline، لأن Gmail وOutlook بيشيلوا <style> و<link>
 * وما بيدعموش flex/grid. وفيه نسخة نصية كـ fallback.
 */
const C = {
  bg: "#14100F", // خلفية الصفحة
  card: "#1F1815", // سطح البطاقة
  line: "#5B2621", // حدود
  text: "#F5EFE6", // نص أساسي
  mute: "#B9ADA0", // نص ثانوي
  red: "#E1523E", // أحمر فرعوني
  gold: "#C9A227", // ذهبي
};

export interface OtpEmailOptions {
  code: string;
  /** رابط التطبيق، مثال: https://app.kenoz.org */
  appUrl: string;
  /** مدة صلاحية الكود بالدقايق */
  minutes: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function otpEmail({ code, appUrl, minutes }: OtpEmailOptions): { subject: string; html: string; text: string } {
  const base = appUrl.replace(/\/$/, "");
  const logo = `${base}/icon.png`;
  const subject = `${code} — كود الدخول إلى رع شات`;

  const text = [
    "رع شات — Raa Chat",
    "",
    `كود الدخول: ${code}`,
    `الكود صالح لمدة ${minutes} دقائق، ولمرة واحدة فقط.`,
    "",
    "لو مش إنت اللي طلبت الكود، تجاهل الرسالة دي ومتديهوش لحد.",
    "فريق رع شات لن يطلب منك الكود أبدًا.",
    "",
    `${base}/legal/privacy.html · ${base}/legal/terms.html`,
  ].join("\n");

  // صف الكود: letter-spacing بيتحط على الـ td عشان Outlook، وmargin بالجداول مش بالـ CSS
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;font-size:1px;color:${C.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">كود الدخول ${esc(code)} — صالح ${minutes} دقائق</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">

  <!-- الهوية -->
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="${esc(logo)}" width="64" height="64" alt="رع شات" style="display:block;width:64px;height:64px;border-radius:16px;border:0;outline:none;text-decoration:none;">
  </td></tr>
  <tr><td align="center" style="padding-bottom:28px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
    <div style="font-size:22px;font-weight:800;color:${C.text};letter-spacing:.5px;">رع شات</div>
    <div style="font-size:12px;color:${C.gold};letter-spacing:2px;padding-top:4px;">RAA CHAT</div>
  </td></tr>

  <!-- البطاقة -->
  <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:32px 28px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="font-size:19px;font-weight:700;color:${C.text};padding-bottom:8px;">كود الدخول بتاعك</td></tr>
      <tr><td align="center" style="font-size:13px;line-height:22px;color:${C.mute};padding-bottom:24px;">اكتب الكود ده في التطبيق عشان تكمّل تسجيل الدخول.</td></tr>

      <tr><td align="center" style="padding-bottom:20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
          <tr><td align="center" dir="ltr" bgcolor="${C.bg}" style="background:${C.bg};border:1px solid ${C.gold};border-radius:14px;padding:18px 30px;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;text-indent:10px;color:${C.gold};">${esc(code)}</td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="font-size:13px;color:${C.mute};padding-bottom:24px;">صالح لمدة <strong style="color:${C.text};">${minutes} دقائق</strong> ولمرة واحدة بس.</td></tr>

      <tr><td style="border-top:1px solid ${C.line};padding-top:20px;font-size:12px;line-height:21px;color:${C.mute};">
        لو مش إنت اللي طلبت الكود، تجاهل الرسالة دي ومتديهوش لحد.
        <strong style="color:${C.red};">فريق رع شات عمره ما هيطلب منك الكود.</strong>
      </td></tr>
    </table>
  </td></tr>

  <!-- التذييل -->
  <tr><td align="center" style="padding-top:24px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:11px;line-height:20px;color:${C.mute};">
    <a href="${esc(base)}/legal/privacy.html" style="color:${C.mute};text-decoration:underline;">سياسة الخصوصية</a>
    &nbsp;·&nbsp;
    <a href="${esc(base)}/legal/terms.html" style="color:${C.mute};text-decoration:underline;">شروط الاستخدام</a>
    <div style="padding-top:8px;">رسالة آلية — من فضلك متردّش عليها.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
