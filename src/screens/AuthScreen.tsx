import { useEffect, useRef, useState } from "react";
import { LEGAL } from "../legal";
import { Mail, Phone, ArrowRight, Eye, EyeOff } from "lucide-react";
import { HorusMark } from "../components/Header";
import { LangSwitch } from "../components/LangSwitch";
import { useDir, useT, num } from "../i18n";
import { ArrowLeft } from "lucide-react";
import { API_ON, api, loginWithPassword, registerWithPassword, requestOtp, resetPassword, verifyOtp } from "../api/client";

// كود التحقق في وضع الديمو (مفيش سيرفر، فمفيش رسالة بتتبعت)
export const MOCK_OTP = "123456";

/**
 * - `login`: إيميل + كلمة سر. **ده الافتراضي** — الحساب المسجّل مايدخلش بكود كل مرة.
 * - `signup`: اسم + إيميل + كلمة سر، والكود بيتأكد **مرة واحدة** بس عند التسجيل.
 *   (قبل كده مكانش فيه تسجيل بالاسم خالص: أول كود ناجح كان بيعمل حساب باسم
 *   مولّد زي «مستخدم ٩١١١».)
 * - `forgot`: كود على الإيميل + كلمة سر جديدة.
 * - `otp`: دخول بكود لمرة واحدة — فاضل للحسابات القديمة وللدخول بالرقم.
 */
type Mode = "login" | "signup" | "forgot" | "otp";
type Method = "phone" | "email";

const MIN_PASS = 8;

export default function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<"form" | "code">("form");
  const [method, setMethod] = useState<Method>("email"); // في وضع الكود بس
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [pass, setPass] = useState("");
  /**
   * تاريخ الميلاد — **رع شات ١٨+**. مطلوب لإنشاء أي حساب جديد: في «حساب جديد»
   * بيبان في الفورم، وفي «دخول بكود» بيبان **بس** لو السيرفر قال `birth_date_required`
   * (يعني الكود ده هيعمل حساب جديد). والسيرفر **مابيستهلكش الكود** في الحالة دي،
   * فنفس الكود بيشتغل بعد ما المستخدم يكتب تاريخه.
   */
  const [birth, setBirth] = useState("");
  const [needBirth, setNeedBirth] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const t = useT();
  const Back = useDir() === "rtl" ? ArrowRight : ArrowLeft;
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  /**
   * **تركيز خانة الكود الأولى بعد الرسم، مش بمؤقّت.**
   *
   * كان في `sendCode`: `setTimeout(() => refs.current[0]?.focus(), 50)` — لأن
   * الخانة لسه ما اترسمتش وقت النداء. والمؤقّت ده كان **بيسرق التركيز
   * متأخرًا**: تحت أي بطء (جهاز مشغول · تحميل) بيولع بعد ما المستخدم يكون بدأ
   * يكتب، فالرقم اللي بيكتبه ينزل في **الخانة الأولى** ويمسح اللي فيها — ومفيش
   * أي رسالة خطأ. اتعاد إنتاجه: ١ من ١٢٠ تشغيلة تحت حمل، والصورة طلعت «خانة ١
   * فيها رقم خانة ٢» وخانة ٢ فاضية. ودي كانت سبب تذبذب اختبارين من غير ما حد
   * يعرف السبب.
   *
   * الـ effect بيشتغل **بعد** الـ commit فالـ ref موجود، ومفيش تأخير يلحق
   * المستخدم. والقاعدة: مفيش `setTimeout` لتركيز عنصر — الـ effect هو المكان.
   */
  useEffect(() => {
    if (step === "code") refs.current[0]?.focus();
  }, [step]);
  /**
   * قنوات التحقق المتاحة من السيرفر. SMS **مش شغّال في الإنتاج**، فخيار «التليفون»
   * كان طريق مسدود: المستخدم يكتب رقمه ويستنى كود عمره ما هييجي. دلوقتي الخيار
   * بيتقفل بقرار السيرفر — ولما SMS يتفعّل بيرجع لوحده من غير نشر واجهة.
   * في وضع الديمو (مفيش API) الاتنين متاحين.
   */
  const [channels, setChannels] = useState<{ phone: boolean; email: boolean }>({ phone: true, email: true });
  useEffect(() => {
    if (!API_ON) return;
    let alive = true;
    void api<{ phone: boolean; email: boolean }>("/auth/channels", { auth: false })
      .then((c) => { if (alive) { setChannels(c); if (!c.phone) setMethod("email"); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (step !== "code" || seconds <= 0) return;
    const h = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(h);
  }, [step, seconds]);

  const codeChannel: Method = mode === "otp" ? method : "email";
  const target = codeChannel === "phone" ? value.replace(/\s/g, "") : value.trim().toLowerCase();
  const targetOk = codeChannel === "phone" ? /^01[0-9]{9}$/.test(target) : /^\S+@\S+\.\S+$/.test(target);
  const passOk = pass.length >= MIN_PASS;
  /** السن بالسنين الكاملة من `yyyy-mm-dd` (تقويم المتصفح — السيرفر هو الحكم النهائي بتوقيت القاهرة) */
  const ageOf = (v: string) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return -1;
    const now = new Date();
    let a = now.getFullYear() - d.getUTCFullYear();
    const m = now.getMonth() - d.getUTCMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getUTCDate())) a--;
    return a;
  };
  const birthOk = ageOf(birth) >= 18 && ageOf(birth) <= 120;
  const formOk =
    mode === "login" ? targetOk && pass.length > 0
    : mode === "signup" ? targetOk && passOk && name.trim().length >= 2 && birthOk
    : targetOk; // forgot · otp

  const go = (m: Mode) => { setMode(m); setStep("form"); setError(""); setPass(""); setBirth(""); setNeedBirth(false); setDigits(Array(6).fill("")); };
  const fail = (e: unknown) => { setError((e as Error).message || t("حدث خطأ، حاول مرة أخرى", "Something went wrong, try again")); setBusy(false); };

  /** يطلب كود ويروح لخطوة الكود (التسجيل · النسيان · الدخول بكود) */
  const sendCode = async () => {
    setError("");
    if (API_ON) {
      setBusy(true);
      try { await requestOtp(codeChannel, target); } catch (e) { return fail(e); }
      setBusy(false);
    }
    setDigits(Array(6).fill(""));
    setSeconds(30);
    setStep("code");
    // لو إحنا أصلًا في خطوة الكود (إعادة إرسال) الخانة مرسومة فالتركيز فوري.
    // وأول دخول للخطوة بيتولّى عليه الـ effect تحت — **مفيش مؤقّت**.
    refs.current[0]?.focus();
  };

  const submitForm = async () => {
    setError("");
    if (mode === "login") {
      if (!API_ON) return onDone(); // ديمو: مفيش سيرفر يتحقق
      setBusy(true);
      try { await loginWithPassword(target, pass); onDone(); } catch (e) { fail(e); }
      return;
    }
    await sendCode(); // signup · forgot · otp
  };

  /** الكود كامل: السلوك بيختلف حسب المود */
  const useCode = async (full: string) => {
    if (!API_ON) {
      if (full === MOCK_OTP) setTimeout(onDone, 300);
      else setError(t("الكود غير صحيح، حاول مرة أخرى", "Incorrect code, please try again"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") await registerWithPassword(target, full, name.trim(), pass, birth);
      else if (mode === "forgot") await resetPassword(target, full, pass);
      else await verifyOtp(codeChannel, target, full, needBirth ? birth : undefined);
      onDone();
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = (e as Error).message;
      // حساب جديد بكود: السيرفر عايز تاريخ الميلاد و**الكود لسه صالح** — فبنطلبه
      // ومابنفضّيش الخانات، والمستخدم يضغط «تأكيد» بنفس الكود.
      if (code === "birth_date_required") {
        setNeedBirth(true);
        setError(msg);
        setBusy(false);
        return;
      }
      setError(msg || t("الكود غير صحيح، حاول مرة أخرى", "Incorrect code, please try again"));
      setBusy(false);
      if (code !== "under_age" && code !== "invalid_birth_date") {
        setDigits(Array(6).fill(""));
        refs.current[0]?.focus();
      }
    }
  };

  /**
   * بيحطّ أرقام في الخانات من موضع `from` ويكمّل اللي بعدها.
   * **اللصق لازم يملا الخانات كلها**: المستخدم بينسخ الكود من الإيميل ويلزقه في
   * أول خانة — وقبل كده كان بيتحط رقم واحد بس والباقي يضيع، فيضطر يكتبه بإيده.
   * وده كمان بيمسك الكيبورد اللي بيكتب الكود كله في خانة واحدة (autofill).
   */
  const fillFrom = (from: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    const next = [...digits];
    for (let k = 0; k < typed.length && from + k < 6; k++) next[from + k] = typed[k]!;
    setDigits(next);
    setError("");
    const last = Math.min(from + typed.length, 6) - 1;
    refs.current[Math.min(last + 1, 5)]?.focus();
    // «نسيت كلمة السر» محتاج كلمة السر الجديدة كمان، فالتأكيد بزرار مش تلقائي
    if (next.every(Boolean) && mode !== "forgot") void useCode(next.join(""));
  };

  const setDigit = (i: number, v: string) => {
    // الخانة فيها رقم واحد، فلو جه أكتر (لصق أو autofill) بنوزّعه على اللي بعدها
    const typed = v.replace(/\D/g, "");
    if (typed.length > 1) { fillFrom(i, typed); return; }
    const d = typed.slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError("");
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean) && mode !== "forgot") void useCode(next.join(""));
  };

  const title =
    mode === "signup" ? t("حساب جديد", "New account")
    : mode === "forgot" ? t("نسيت كلمة السر", "Forgot password")
    : mode === "otp" ? t("دخول بكود لمرة واحدة", "One-time code sign-in")
    : t("تسجيل الدخول", "Sign in");

  const sub =
    step === "code" ? t("اكتب كود التحقّق الذي وصلك", "Enter the verification code we sent you")
    : mode === "signup" ? t("اسمك وبريدك وكلمة سرّ — وكود تأكيد مرة واحدة فقط", "Your name, email and a password — plus a one-time confirmation code")
    : mode === "forgot" ? t("سنرسل كودًا إلى بريدك تُنشئ به كلمة سرّ جديدة", "We'll email you a code to set a new password")
    : mode === "otp" ? t("للحسابات القديمة أو الدخول بالرقم", "For older accounts or signing in with a phone number")
    : t("ببريدك وكلمة السرّ", "With your email and password");

  const field = "rounded-xl bg-rachat-card px-4 py-3.5 text-base outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red";
  const link = "text-sm font-bold text-rachat-coral";

  return (
    <div className="relative flex h-full flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,rgba(91,38,33,0.75),transparent_60%)] px-6 pb-8 pt-16">
      <div className="absolute end-4 top-4"><LangSwitch /></div>
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="rounded-2xl p-1 shadow-[0_0_40px_rgba(225,82,62,0.35)]"><HorusMark size={84} /></div>
        <h1 className="text-3xl font-extrabold">{t("رع شات", "Raa Chat")}</h1>
        <div className="flex gap-2 text-[11px] text-rachat-gold"><span>{t("رسائل", "Messages")}</span><span>·</span><span>{t("غرف صوتية", "Voice rooms")}</span><span>·</span><span>{t("محفظة", "Wallet")}</span></div>
        <h2 className="text-lg font-extrabold text-rachat-papyrus">{title}</h2>
        <p className="text-center text-sm text-neutral-400">{sub}</p>
      </div>

      {step === "form" ? (
        <div className="flex flex-1 flex-col gap-3.5">
          {mode === "otp" && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-rachat-card p-1">
              {(["phone", "email"] as Method[]).map((m) => (
                <button
                  key={m}
                  disabled={!channels[m]}
                  aria-disabled={!channels[m]}
                  onClick={() => { setMethod(m); setValue(""); setError(""); }}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold ${method === m ? "bg-rachat-red text-white" : "text-neutral-400"} ${!channels[m] ? "opacity-40" : ""}`}
                >
                  {m === "phone" ? <Phone size={16} /> : <Mail size={16} />}
                  {m === "phone" ? t("الهاتف", "Phone") : t("البريد الإلكتروني", "Email")}
                </button>
              ))}
            </div>
          )}
          {mode === "otp" && !channels.phone && (
            <p role="status" className="rounded-xl bg-rachat-card px-3 py-2 text-[11.5px] leading-5 text-rachat-gold">
              {t("الدخول بالرقم موقوف مؤقتًا — استخدم البريد الإلكتروني.", "Signing in with a phone number is temporarily unavailable — please use email.")}
            </p>
          )}

          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("اسمك كما تحبّ أن يظهر", "Your name as you'd like it shown")}
              aria-label={t("الاسم", "Name")}
              className={field}
            />
          )}

          {/* رع شات ١٨+: تاريخ الميلاد مطلوب لأي حساب جديد */}
          {mode === "signup" && (
            <div>
              <input
                type="date"
                dir="ltr"
                value={birth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBirth(e.target.value)}
                aria-label={t("تاريخ الميلاد", "Date of birth")}
                className={`${field} text-left`}
              />
              <p className="px-1 pt-1 text-[11px] leading-4 text-rachat-sand/70">
                {birth && !birthOk
                  ? t("رع شات للبالغين — ١٨ سنة أو أكثر.", "Raa Chat is for adults — 18 or older.")
                  : t("تاريخ الميلاد مطلوب: رع شات للبالغين (١٨ سنة أو أكثر).", "Date of birth required: Raa Chat is for adults (18+).")}
              </p>
            </div>
          )}

          <input
            dir="ltr"
            inputMode={codeChannel === "phone" ? "tel" : "email"}
            autoComplete={codeChannel === "phone" ? "tel" : "email"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={codeChannel === "phone" ? "01xxxxxxxxx" : "name@example.com"}
            aria-label={codeChannel === "phone" ? t("رقم الهاتف", "Phone number") : t("البريد الإلكتروني", "Email")}
            className={`${field} text-left`}
          />

          {(mode === "login" || mode === "signup") && (
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={mode === "signup" ? t(`كلمة السر (${num(MIN_PASS)} حروف على الأقل)`, `Password (at least ${MIN_PASS} characters)`) : t("كلمة السر", "Password")}
                aria-label={t("كلمة السر", "Password")}
                onKeyDown={(e) => e.key === "Enter" && formOk && !busy && void submitForm()}
                className={`${field} w-full pe-11`}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? t("إخفاء كلمة السر", "Hide password") : t("إظهار كلمة السر", "Show password")}
                className="absolute inset-y-0 end-3 flex items-center text-neutral-500"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}

          <button disabled={!formOk || busy} onClick={() => void submitForm()} className="rounded-xl bg-rachat-red py-3.5 font-extrabold text-white disabled:opacity-40">
            {mode === "login" ? t("دخول", "Sign in") : mode === "signup" ? t("أرسِل لي كود التأكيد", "Send me the confirmation code") : t("أرسِل لي الكود", "Send me the code")}
          </button>

          {error && <p className="text-center text-sm text-rachat-coral" role="alert">{error}</p>}

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-1">
            {mode !== "login" && <button onClick={() => go("login")} className={link}>{t("لديّ حساب — دخول", "I have an account — sign in")}</button>}
            {mode !== "signup" && <button onClick={() => go("signup")} className={link}>{t("حساب جديد", "New account")}</button>}
            {mode === "login" && <button onClick={() => go("forgot")} className={link}>{t("نسيت كلمة السر؟", "Forgot password?")}</button>}
            {mode !== "otp" && <button onClick={() => go("otp")} className="text-sm text-neutral-400 underline">{t("دخول بكود لمرة واحدة", "Sign in with a one-time code")}</button>}
          </div>

          {!API_ON && (
            <div className="rounded-2xl border border-dashed border-rachat-gold/50 bg-rachat-card p-3.5">
              <div className="mb-1 text-xs font-bold text-rachat-gold">{t("حساب تجريبي للمعاينة", "Demo account for preview")}</div>
              <p className="mb-3 text-[11px] leading-5 text-neutral-500">
                {t("ادخل مباشرة بحساب «كريم الشناوي» ببياناته التجريبية، أو جرِّب الدخول بكود", "Jump straight in with the demo account “Karim El-Shennawy” and its mock data. Or try the one-time code")} <span dir="ltr" className="font-bold text-rachat-papyrus">{MOCK_OTP}</span>.
              </p>
              <button onClick={onDone} className="w-full rounded-xl bg-rachat-gold py-3 text-sm font-extrabold text-rachat-ink">
                {t("ادخل بالحساب التجريبي", "Enter the demo account")}
              </button>
            </div>
          )}

          <p className="mt-auto pt-4 text-center text-[11px] leading-5 text-neutral-500">
            {t("بالمتابعة أنت توافق على ", "By continuing you agree to the ")}<a href={LEGAL.terms} target="_blank" rel="noreferrer" className="underline">{t("الشروط", "Terms")}</a>{t(" و", " and ")}<a href={LEGAL.privacy} target="_blank" rel="noreferrer" className="underline">{t("سياسة الخصوصية", "Privacy Policy")}</a>.
            {!API_ON && " " + t("نسخة تجريبية: لا تُرسَل رسالة فعلًا.", "Demo version: no message is actually sent.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          <button onClick={() => { setStep("form"); setError(""); }} className="flex items-center gap-1 self-start text-sm text-neutral-400">
            <Back size={16} /> {t("رجوع", "Back")}
          </button>
          <p className="text-center text-sm text-neutral-300" dir="ltr">{value}</p>
          <div className="flex justify-center gap-2" dir="ltr">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (refs.current[i] = el)}
                value={d}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                aria-label={t(`خانة ${num(i + 1)}`, `Digit ${i + 1}`)}
                onChange={(e) => setDigit(i, e.target.value)}
                onPaste={(e) => {
                  // لازم نمنع السلوك الافتراضي: المتصفح بياخد أول حرف بس بسبب maxLength
                  const text = e.clipboardData.getData("text");
                  if (/\d/.test(text)) { e.preventDefault(); fillFrom(i, text); }
                }}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => e.key === "Backspace" && !d && i > 0 && refs.current[i - 1]?.focus()}
                className="h-12 w-10 rounded-lg bg-rachat-card text-center text-xl font-extrabold outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red"
              />
            ))}
          </div>

          {/* حساب جديد بكود: السيرفر طلب تاريخ الميلاد، و**الكود لسه صالح** */}
          {needBirth && (
            <div>
              <input
                type="date"
                dir="ltr"
                value={birth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBirth(e.target.value)}
                aria-label={t("تاريخ الميلاد", "Date of birth")}
                className={`${field} text-left`}
              />
              <p className="px-1 pt-1 text-[11px] leading-4 text-rachat-sand/70">
                {t("هذا أول دخول لك، ورع شات للبالغين (١٨ سنة أو أكثر). وكودك ما زال صالحًا.",
                   "This is your first sign-in, and Raa Chat is for adults (18+). Your code is still valid.")}
              </p>
              <button
                disabled={busy || !birthOk}
                onClick={() => void useCode(digits.join(""))}
                className="mt-2 w-full rounded-xl bg-rachat-red px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
              >
                {t("تأكيد", "Confirm")}
              </button>
            </div>
          )}

          {mode === "forgot" && (
            <input
              type="password"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder={t(`كلمة السر الجديدة (${num(MIN_PASS)} حروف على الأقل)`, `New password (at least ${MIN_PASS} characters)`)}
              aria-label={t("كلمة السر الجديدة", "New password")}
              className={field}
            />
          )}
          {mode === "forgot" && (
            <button
              disabled={!passOk || !digits.every(Boolean) || busy}
              onClick={() => void useCode(digits.join(""))}
              className="rounded-xl bg-rachat-red py-3.5 font-extrabold text-white disabled:opacity-40"
            >{t("أنشئ كلمة السرّ الجديدة", "Set the new password")}</button>
          )}

          {error && <p className="text-center text-sm text-rachat-coral" role="alert">{error}</p>}
          {!API_ON && (
            <div className="rounded-xl bg-rachat-card p-3 text-center text-xs text-neutral-400">
              {t("كود التجربة:", "Demo code:")} <span className="font-extrabold text-rachat-gold" dir="ltr">{MOCK_OTP}</span>
            </div>
          )}
          <button disabled={seconds > 0 || busy} onClick={() => void sendCode()} className="text-sm font-bold text-rachat-coral disabled:text-neutral-600">
            {seconds > 0 ? t(`إعادة الإرسال بعد ${num(seconds)} ثانية`, `Resend in ${seconds}s`) : t("إعادة إرسال الكود", "Resend code")}
          </button>
        </div>
      )}
    </div>
  );
}
