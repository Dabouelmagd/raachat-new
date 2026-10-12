import { useEffect, useRef, useState } from "react";
import { LEGAL } from "../legal";
import { Mail, Phone, ArrowRight, Eye, EyeOff } from "lucide-react";
import { HorusMark } from "../components/Header";
import { LangSwitch } from "../components/LangSwitch";
import { useDir, useT, num } from "../i18n";
import { ArrowLeft } from "lucide-react";
import { API_ON, loginWithPassword, registerWithPassword, requestOtp, resetPassword, verifyOtp } from "../api/client";

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
  const [showPass, setShowPass] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const t = useT();
  const Back = useDir() === "rtl" ? ArrowRight : ArrowLeft;
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== "code" || seconds <= 0) return;
    const h = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(h);
  }, [step, seconds]);

  const codeChannel: Method = mode === "otp" ? method : "email";
  const target = codeChannel === "phone" ? value.replace(/\s/g, "") : value.trim().toLowerCase();
  const targetOk = codeChannel === "phone" ? /^01[0-9]{9}$/.test(target) : /^\S+@\S+\.\S+$/.test(target);
  const passOk = pass.length >= MIN_PASS;
  const formOk =
    mode === "login" ? targetOk && pass.length > 0
    : mode === "signup" ? targetOk && passOk && name.trim().length >= 2
    : targetOk; // forgot · otp

  const go = (m: Mode) => { setMode(m); setStep("form"); setError(""); setPass(""); setDigits(Array(6).fill("")); };
  const fail = (e: unknown) => { setError((e as Error).message || t("حصلت مشكلة، حاول تاني", "Something went wrong, try again")); setBusy(false); };

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
    setTimeout(() => refs.current[0]?.focus(), 50);
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
      else setError(t("الكود غير صحيح، حاول مرة تانية", "Incorrect code, please try again"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") await registerWithPassword(target, full, name.trim(), pass);
      else if (mode === "forgot") await resetPassword(target, full, pass);
      else await verifyOtp(codeChannel, target, full);
      onDone();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg || t("الكود غير صحيح، حاول مرة تانية", "Incorrect code, please try again"));
      setBusy(false);
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
    }
  };

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError("");
    if (d && i < 5) refs.current[i + 1]?.focus();
    // «نسيت كلمة السر» محتاج كلمة السر الجديدة كمان، فالتأكيد بزرار مش تلقائي
    if (next.every(Boolean) && mode !== "forgot") void useCode(next.join(""));
  };

  const title =
    mode === "signup" ? t("حساب جديد", "New account")
    : mode === "forgot" ? t("نسيت كلمة السر", "Forgot password")
    : mode === "otp" ? t("دخول بكود لمرة واحدة", "One-time code sign-in")
    : t("تسجيل الدخول", "Sign in");

  const sub =
    step === "code" ? t("اكتب كود التحقق اللي وصلك", "Enter the verification code we sent you")
    : mode === "signup" ? t("اسمك وإيميلك وكلمة سر — وكود تأكيد مرة واحدة بس", "Your name, email and a password — plus a one-time confirmation code")
    : mode === "forgot" ? t("هنبعتلك كود على إيميلك تعمل بيه كلمة سر جديدة", "We'll email you a code to set a new password")
    : mode === "otp" ? t("للحسابات القديمة أو الدخول بالرقم", "For older accounts or signing in with a phone number")
    : t("بإيميلك وكلمة السر", "With your email and password");

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
                  onClick={() => { setMethod(m); setValue(""); setError(""); }}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold ${method === m ? "bg-rachat-red text-white" : "text-neutral-400"}`}
                >
                  {m === "phone" ? <Phone size={16} /> : <Mail size={16} />}
                  {m === "phone" ? t("التليفون", "Phone") : t("الإيميل", "Email")}
                </button>
              ))}
            </div>
          )}

          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("اسمك زي ما تحب يظهر", "Your name as you'd like it shown")}
              aria-label={t("الاسم", "Name")}
              className={field}
            />
          )}

          <input
            dir="ltr"
            inputMode={codeChannel === "phone" ? "tel" : "email"}
            autoComplete={codeChannel === "phone" ? "tel" : "email"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={codeChannel === "phone" ? "01xxxxxxxxx" : "name@example.com"}
            aria-label={codeChannel === "phone" ? t("رقم التليفون", "Phone number") : t("الإيميل", "Email")}
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
            {mode === "login" ? t("دخول", "Sign in") : mode === "signup" ? t("ابعتلي كود التأكيد", "Send me the confirmation code") : t("ابعتلي الكود", "Send me the code")}
          </button>

          {error && <p className="text-center text-sm text-rachat-coral" role="alert">{error}</p>}

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-1">
            {mode !== "login" && <button onClick={() => go("login")} className={link}>{t("عندي حساب — دخول", "I have an account — sign in")}</button>}
            {mode !== "signup" && <button onClick={() => go("signup")} className={link}>{t("حساب جديد", "New account")}</button>}
            {mode === "login" && <button onClick={() => go("forgot")} className={link}>{t("نسيت كلمة السر؟", "Forgot password?")}</button>}
            {mode !== "otp" && <button onClick={() => go("otp")} className="text-sm text-neutral-400 underline">{t("دخول بكود لمرة واحدة", "Sign in with a one-time code")}</button>}
          </div>

          {!API_ON && (
            <div className="rounded-2xl border border-dashed border-rachat-gold/50 bg-rachat-card p-3.5">
              <div className="mb-1 text-xs font-bold text-rachat-gold">{t("حساب تجريبي للمعاينة", "Demo account for preview")}</div>
              <p className="mb-3 text-[11px] leading-5 text-neutral-500">
                {t("ادخل مباشرة بحساب «كريم الشناوي» ببياناته الوهمية. أو جرّب الدخول بكود", "Jump straight in with the demo account “Karim El-Shennawy” and its mock data. Or try the one-time code")} <span dir="ltr" className="font-bold text-rachat-papyrus">{MOCK_OTP}</span>.
              </p>
              <button onClick={onDone} className="w-full rounded-xl bg-rachat-gold py-3 text-sm font-extrabold text-rachat-ink">
                {t("ادخل بالحساب التجريبي", "Enter the demo account")}
              </button>
            </div>
          )}

          <p className="mt-auto pt-4 text-center text-[11px] leading-5 text-neutral-500">
            {t("بالمتابعة أنت توافق على ", "By continuing you agree to the ")}<a href={LEGAL.terms} target="_blank" rel="noreferrer" className="underline">{t("الشروط", "Terms")}</a>{t(" و", " and ")}<a href={LEGAL.privacy} target="_blank" rel="noreferrer" className="underline">{t("سياسة الخصوصية", "Privacy Policy")}</a>.
            {!API_ON && " " + t("نسخة تجريبية: مفيش رسالة بتتبعت فعلاً.", "Demo version: no message is actually sent.")}
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
                onKeyDown={(e) => e.key === "Backspace" && !d && i > 0 && refs.current[i - 1]?.focus()}
                className="h-12 w-10 rounded-lg bg-rachat-card text-center text-xl font-extrabold outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red"
              />
            ))}
          </div>

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
            >{t("اعمل كلمة السر الجديدة", "Set the new password")}</button>
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
