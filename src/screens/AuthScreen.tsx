import { useEffect, useRef, useState } from "react";
import { LEGAL } from "../legal";
import { Mail, Phone, ArrowRight } from "lucide-react";
import { HorusMark } from "../components/Header";
import { LangSwitch } from "../components/LangSwitch";
import { useDir, useT, num } from "../i18n";
import { ArrowLeft } from "lucide-react";
import { API_ON, requestOtp, verifyOtp } from "../api/client";

// كود التحقق التجريبي — يُستبدل بطلب حقيقي لخدمة SMS/Email عند ربط الباك إند
export const MOCK_OTP = "123456";

type Method = "phone" | "email";

export default function AuthScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"enter" | "otp">("enter");
  const [method, setMethod] = useState<Method>("phone");
  const [value, setValue] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(30);
  const t = useT();
  const Back = useDir() === "rtl" ? ArrowRight : ArrowLeft;
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== "otp" || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, seconds]);

  const valid =
    method === "phone" ? /^01[0-9]{9}$/.test(value.replace(/\s/g, "")) : /^\S+@\S+\.\S+$/.test(value);

  const [busy, setBusy] = useState(false);
  const target = method === "phone" ? value.replace(/\s/g, "") : value.trim();

  const sendCode = async () => {
    setError("");
    if (API_ON) {
      setBusy(true);
      try { await requestOtp(method, target); }
      catch (e) { setError((e as Error).message); setBusy(false); return; }
      setBusy(false);
    }
    setDigits(Array(6).fill(""));
    setSeconds(30);
    setStep("otp");
    setTimeout(() => refs.current[0]?.focus(), 50);
  };

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError("");
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) {
      if (API_ON) {
        setBusy(true);
        verifyOtp(method, target, next.join(""))
          .then(() => onDone())
          .catch(() => { setBusy(false); setError(t("الكود غير صحيح، حاول مرة تانية", "Incorrect code, please try again")); });
        return;
      }
      if (next.join("") === MOCK_OTP) setTimeout(onDone, 300);
      else setError(t("الكود غير صحيح، حاول مرة تانية", "Incorrect code, please try again"));
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,rgba(91,38,33,0.75),transparent_60%)] px-6 pb-8 pt-16">
      <div className="absolute end-4 top-4"><LangSwitch /></div>
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="rounded-2xl p-1 shadow-[0_0_40px_rgba(225,82,62,0.35)]"><HorusMark size={84} /></div>
        <h1 className="text-3xl font-extrabold">{t("رع شات", "Raa Chat")}</h1>
        <div className="flex gap-2 text-[11px] text-rachat-gold"><span>{t("رسائل", "Messages")}</span><span>·</span><span>{t("غرف صوتية", "Voice rooms")}</span><span>·</span><span>{t("محفظة", "Wallet")}</span></div>
        <p className="text-center text-sm text-neutral-400">
          {step === "enter" ? t("سجّل دخولك برقم التليفون أو الإيميل", "Sign in with your phone number or email") : t("اكتب كود التحقق اللي وصلك", "Enter the verification code we sent you")}
        </p>
      </div>

      {step === "enter" ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-rachat-card p-1">
            {(["phone", "email"] as Method[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); setValue(""); }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold ${
                  method === m ? "bg-rachat-red text-white" : "text-neutral-400"
                }`}
              >
                {m === "phone" ? <Phone size={16} /> : <Mail size={16} />}
                {m === "phone" ? t("التليفون", "Phone") : t("الإيميل", "Email")}
              </button>
            ))}
          </div>
          <input
            dir="ltr"
            inputMode={method === "phone" ? "tel" : "email"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={method === "phone" ? "01xxxxxxxxx" : "name@example.com"}
            className="rounded-xl bg-rachat-card px-4 py-3.5 text-left text-base outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red"
          />
          <button
            disabled={!valid || busy}
            onClick={sendCode}
            className="rounded-xl bg-rachat-red py-3.5 font-extrabold text-white disabled:opacity-40"
          >
            {t("ابعتلي الكود", "Send me the code")}
          </button>
          {error && <p className="text-center text-sm text-rachat-coral">{error}</p>}
          {!API_ON && <div className="rounded-2xl border border-dashed border-rachat-gold/50 bg-rachat-card p-3.5">
            <div className="mb-1 text-xs font-bold text-rachat-gold">{t("حساب تجريبي للمعاينة", "Demo account for preview")}</div>
            <p className="mb-3 text-[11px] leading-5 text-neutral-500">
              {t("ادخل مباشرة بحساب «كريم الشناوي» ببياناته الوهمية. أو سجّل برقم", "Jump straight in with the demo account “Karim El-Shennawy” and its mock data. Or sign in with")} <span dir="ltr" className="font-bold text-rachat-papyrus">01000000000</span> {t("وكود", "and code")} <span dir="ltr" className="font-bold text-rachat-papyrus">{MOCK_OTP}</span>.
            </p>
            <button onClick={onDone} className="w-full rounded-xl bg-rachat-gold py-3 text-sm font-extrabold text-rachat-ink">
              {t("ادخل بالحساب التجريبي", "Enter the demo account")}
            </button>
          </div>}
          <p className="mt-auto text-center text-[11px] leading-5 text-neutral-500">
            {t("بالمتابعة أنت توافق على ", "By continuing you agree to the ")}<a href={LEGAL.terms} target="_blank" rel="noreferrer" className="underline">{t("الشروط", "Terms")}</a>{t(" و", " and ")}<a href={LEGAL.privacy} target="_blank" rel="noreferrer" className="underline">{t("سياسة الخصوصية", "Privacy Policy")}</a>.
            {!API_ON && " " + t("نسخة تجريبية: مفيش رسالة بتتبعت فعلاً.", "Demo version: no message is actually sent.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          <button onClick={() => setStep("enter")} className="flex items-center gap-1 self-start text-sm text-neutral-400">
            <Back size={16} /> {method === "phone" ? t("تغيير الرقم", "Change number") : t("تغيير الإيميل", "Change email")}
          </button>
          <p className="text-center text-sm text-neutral-300" dir="ltr">{value}</p>
          <div className="flex justify-center gap-2" dir="ltr">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (refs.current[i] = el)}
                value={d}
                inputMode="numeric"
                maxLength={1}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => e.key === "Backspace" && !d && i > 0 && refs.current[i - 1]?.focus()}
                className="h-12 w-10 rounded-lg bg-rachat-card text-center text-xl font-extrabold outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red"
              />
            ))}
          </div>
          {error && <p className="text-center text-sm text-rachat-coral">{error}</p>}
          {!API_ON && <div className="rounded-xl bg-rachat-card p-3 text-center text-xs text-neutral-400">
            {t("كود التجربة:", "Demo code:")} <span className="font-extrabold text-rachat-gold" dir="ltr">{MOCK_OTP}</span>
          </div>}
          <button
            disabled={seconds > 0}
            onClick={sendCode}
            className="text-sm font-bold text-rachat-coral disabled:text-neutral-600"
          >
            {seconds > 0 ? t(`إعادة الإرسال بعد ${num(seconds)} ثانية`, `Resend in ${seconds}s`) : t("إعادة إرسال الكود", "Resend code")}
          </button>
        </div>
      )}
    </div>
  );
}
