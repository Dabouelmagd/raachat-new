/**
 * مُرسِل SMS **عام** — بيشتغل مع أي مجمّع مصري بمفتاح واحد، بلا تعديل كود ولا نشر.
 *
 * ليه عام: Twilio مسدود لمصر (محتاج تسجيل Alphanumeric Sender ID)، والمجمّعات
 * المصرية (SMS Misr · OSSN · Digital Planets · E3melBusiness · Infobip…) كلها
 * نداء HTTP بسيط بمفاتيح مختلفة الأسماء. فبدل ما نكتب كلاس لكل واحد ونستنى
 * قرار المزوّد، المواصفة نفسها بقت **بيانات** في متغير واحد.
 *
 * المتغير: `SMS_HTTP` = **base64 لـ JSON** بالشكل ده:
 *   {
 *     "url":    "https://smsmisr.com/api/",
 *     "method": "POST",              // POST | GET
 *     "format": "form",              // form (urlencoded) | json | query (في الرابط)
 *     "params": { "username":"…", "password":"…", "sender":"RaaChat",
 *                 "Mobile":"{to}", "Message":"{text}", "Language":"1" },
 *     "ok":     "1901"               // **لازم** يظهر في رد المزوّد عشان نعتبرها نجحت
 *   }
 *
 * ليه base64 مش JSON صريح: القيمة بتمرّ من `.env.production` لـ compose للكونتينر،
 * وكلمة سر فيها `$` أو `#` أو مسافة بتتكسر في الطريق (compose بيفسّر `${…}`،
 * وبعض قارئات `.env` بتقطع عند `#`). base64 مافيهوش ولا رمز من دول.
 *
 * **حكم النجاح على نصّ الرد مش على 200** — وده أهم سطر في الملف: أغلب المجمّعات
 * المصرية بترجّع **HTTP 200 وكود خطأ في الجسم** (رصيد خلص · اسم مرسل مرفوض ·
 * رقم غلط). الحكم بـ `r.ok` لوحده معناه ✅ على رسالة عمرها ما خرجت — وده بالظبط
 * اللي قاعدة الفحوص عندنا بتمنعه. فـ `ok` إلزامي ومابنقبلش مواصفة من غيره.
 *
 * القوالب في `params`: `{to}` = 01xxxxxxxxx · `{to20}` = 201xxxxxxxxx ·
 * `{to+}` = +201xxxxxxxxx · `{text}` = نصّ الرسالة · `{code}` = الكود لوحده
 * (لمزوّد عنده قالب OTP جاهز مستنّي الكود بس).
 */

export interface SmsSpec {
  url: string;
  method: "GET" | "POST";
  format: "form" | "json" | "query";
  params: Record<string, string>;
  /** نصّ لازم يظهر في رد المزوّد (مع 2xx) عشان نعتبر الرسالة اتبعتت فعلًا. */
  ok: string;
}

/** أرقام مصر: بنقبل 01xxxxxxxxx أو 201xxxxxxxxx أو +201xxxxxxxxx ونطبّعها. */
export function normalizeEgPhone(raw: string): string {
  const d = raw.replace(/[^\d]/g, "");
  if (/^01\d{9}$/.test(d)) return d;
  if (/^201\d{9}$/.test(d)) return `0${d.slice(2)}`; // 20 + 1xxxxxxxxx → 01xxxxxxxxx
  if (/^1\d{9}$/.test(d)) return `0${d}`;
  throw new Error("bad_phone");
}

/** يفكّ `SMS_HTTP` ويتحقق منه. بيرمي برسالة واضحة — ومابيحطّش أي قيمة سر في الرسالة. */
export function parseSmsSpec(b64: string | undefined): SmsSpec | undefined {
  if (!b64 || !b64.trim()) return undefined;
  let raw: string;
  try {
    raw = Buffer.from(b64.trim(), "base64").toString("utf8");
  } catch {
    throw new Error("SMS_HTTP مش base64 سليم");
  }
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error("SMS_HTTP جوّاه JSON مش سليم");
  }
  const s = o as Partial<SmsSpec>;
  if (!s || typeof s !== "object") throw new Error("SMS_HTTP لازم يكون JSON object");
  if (typeof s.url !== "string" || !/^https:\/\//.test(s.url)) throw new Error("SMS_HTTP: url لازم يبدأ بـ https://");
  const method = (s.method ?? "POST").toUpperCase();
  if (method !== "GET" && method !== "POST") throw new Error("SMS_HTTP: method لازم GET أو POST");
  const format = s.format ?? (method === "GET" ? "query" : "form");
  if (format !== "form" && format !== "json" && format !== "query") throw new Error("SMS_HTTP: format لازم form أو json أو query");
  if (!s.params || typeof s.params !== "object" || Array.isArray(s.params) || Object.keys(s.params).length === 0) {
    throw new Error("SMS_HTTP: params لازم object مش فاضي");
  }
  for (const [k, v] of Object.entries(s.params)) {
    if (typeof v !== "string") throw new Error(`SMS_HTTP: قيمة params.${k} لازم نص`);
  }
  // الشرط اللي يمنع ✅ على رسالة ما خرجت
  if (typeof s.ok !== "string" || !s.ok.trim()) {
    throw new Error("SMS_HTTP: ok مطلوب — نصّ لازم يظهر في رد المزوّد عند النجاح (المجمّعات بترجّع 200 مع كود خطأ)");
  }
  const params = s.params as Record<string, string>;
  const joined = Object.values(params).join(" ");
  if (!/\{(to|to20|to\+)\}/.test(joined)) throw new Error("SMS_HTTP: مفيش قالب للرقم في params ({to} أو {to20} أو {to+})");
  if (!/\{(text|code)\}/.test(joined)) throw new Error("SMS_HTTP: مفيش قالب للنص في params ({text} أو {code})");
  return { url: s.url, method, format, params, ok: s.ok };
}

const fill = (v: string, phone: string, text: string, code: string) =>
  v
    .replaceAll("{to20}", `20${phone.slice(1)}`)
    .replaceAll("{to+}", `+20${phone.slice(1)}`)
    .replaceAll("{to}", phone)
    .replaceAll("{text}", text)
    .replaceAll("{code}", code);

/** نصّ رسالة التحقق (مصدر واحد — السكربت بيبعت نفسه عشان الاختبار يبقى واقعي). */
export const smsOtpText = (code: string) => `رع شات: كود التحقق ${code}`;

export function buildSmsRequest(spec: SmsSpec, target: string, code: string, text = smsOtpText(code)) {
  const phone = normalizeEgPhone(target);
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec.params)) data[k] = fill(v, phone, text, code);

  if (spec.format === "json") {
    return { url: spec.url, init: { method: spec.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } };
  }
  const qs = new URLSearchParams(data);
  if (spec.format === "query") {
    const url = spec.url + (spec.url.includes("?") ? "&" : "?") + qs.toString();
    return { url, init: { method: spec.method } };
  }
  return { url: spec.url, init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs.toString() } };
}

/** النجاح = 2xx **و** علامة `ok` موجودة في الرد. أي حاجة تانية = فشل. */
export const smsSucceeded = (spec: SmsSpec, status: number, body: string) =>
  status >= 200 && status < 300 && body.includes(spec.ok);

/**
 * **سقف يومي للرسائل** — سقف للفاتورة مش للأمان.
 *
 * الـ SMS بيتحاسب بالرسالة، وحدّ `/auth/otp` هو ١٠ في الدقيقة **لكل IP** وخمسة
 * في الساعة **لكل رقم**. يعني مهاجم بيلفّ على أرقام مختلفة من IP واحد يقدر يطلع
 * ٦٠٠ رسالة في الساعة = فاتورة بلا سقف. فالعدّاد ده بيوقف الـ SMS لباقي اليوم
 * بعد `SMS_DAILY_MAX` رسالة.
 *
 * بالقاهرة مش UTC (درس `lib/cairo.ts`)، و**في الذاكرة** زي سقف الترجمة بالظبط —
 * يعني **بيصفّر مع كل نشر أو إعادة تشغيل**. فهو يوقف انفجار واحد، مش مهاجم
 * بيستنى النشر. الترقية لعدّاد في القاعدة لو احتاجنا سقفًا صارمًا.
 */
const smsDay = { day: "", count: 0 };

/** بيرجّع false لو السقف خلص (ومابيزوّدش العدّاد). صفر = بلا سقف. */
export function smsUnderDailyCap(max: number, today: string): boolean {
  if (smsDay.day !== today) { smsDay.day = today; smsDay.count = 0; }
  return max <= 0 || smsDay.count < max;
}
/** بيتنادى **بعد** نجاح الإرسال — الرسالة اللي ما خرجتش مش بتتحاسب. */
export function smsCountSent(today: string) {
  if (smsDay.day !== today) { smsDay.day = today; smsDay.count = 0; }
  smsDay.count += 1;
}
export const smsSentToday = (today: string) => (smsDay.day === today ? smsDay.count : 0);
/** للاختبارات بس. */
export const smsResetDay = () => { smsDay.day = ""; smsDay.count = 0; };

/** يشيل كل قيمة سر من نصّ قبل طباعته (الردود بترجّع الطلب كامل عند بعض المزوّدين). */
export function redactSmsSecrets(spec: SmsSpec, s: string) {
  let out = s;
  for (const v of Object.values(spec.params)) {
    const plain = v.trim();
    if (plain.length >= 4 && !plain.includes("{")) out = out.replaceAll(plain, "«محجوب»");
  }
  return out;
}
