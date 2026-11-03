import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { API_ON, api, linkMyPhone, requestOtp, unlinkMyPhone } from "../api/client";
import { useT } from "../i18n";
import { useCloseOnEscape } from "./useCloseOnEscape";

/**
 * ربط رقم موبايل بالحساب — **اسم بديل للدخول وبس**.
 *
 * ليه موجودة: من ٣ نوفمبر ٢٠٢٦ الدخول بالرقم بقى بيوصّل الكود على **إيميل
 * الحساب** (الـSMS موقوف)، فالرقم لازم يكون مربوط بحساب الأول وإلا الدخول بيه
 * مابيوصّلش حاجة. ودي الشاشة اللي بتربطه.
 *
 * 🔴 **والرقم هنا مش هوية متحقَّقة.** مفيش طريق نتحقق بيه من غير SMS، فهو
 * **مابيدخلش مطابقة جهات الاتصال** — وده مكتوب للمستخدم صريح تحت، عشان ما
 * يفتكرش إن إضافته هتخلّي أصحابه يلاقوه. لو دخل المطابقة، أي حد يدّعي رقم حد
 * تاني ويظهر مكانه عند كل اللي عندهم الرقم ده.
 */
export function PhoneSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  useCloseOnEscape(onClose);
  const [me, setMe] = useState<{ phone: string | null; email: string | null } | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<"linked" | "removed" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!API_ON) { setMe({ phone: null, email: "demo@example.com" }); return; }
    api<{ profile?: { phone: string | null; email: string | null } }>("/me")
      .then((r) => setMe({ phone: r.profile?.phone ?? null, email: r.profile?.email ?? null }))
      .catch(() => setMe({ phone: null, email: null }));
  }, []);

  const phoneOk = /^01[0-9]{9}$/.test(phone.replace(/\s/g, ""));

  const sendCode = async () => {
    setErr("");
    if (!API_ON) { setStep("code"); return; }
    if (!me?.email) { setErr(t("حسابك مالوش بريد إلكتروني، والكود بيوصل على البريد.", "Your account has no email, and the code is sent by email.")); return; }
    setBusy(true);
    try {
      await requestOtp("email", me.email);
      setStep("code");
    } catch (e) {
      setErr((e as Error).message || t("حدث خطأ، حاول مرة أخرى", "Something went wrong, try again"));
    }
    setBusy(false);
  };

  const save = async () => {
    setErr("");
    if (!API_ON) { setDone("linked"); return; }
    setBusy(true);
    try {
      await linkMyPhone(phone.replace(/\s/g, ""), code.trim());
      setDone("linked");
    } catch (e) {
      setErr((e as Error).message || t("حدث خطأ، حاول مرة أخرى", "Something went wrong, try again"));
    }
    setBusy(false);
  };

  const remove = async () => {
    setErr("");
    if (!API_ON) { setDone("removed"); return; }
    setBusy(true);
    try {
      await unlinkMyPhone();
      setDone("removed");
    } catch (e) {
      setErr((e as Error).message || t("حدث خطأ، حاول مرة أخرى", "Something went wrong, try again"));
    }
    setBusy(false);
  };

  const field = "w-full rounded-xl bg-rachat-black px-3.5 py-3 text-sm outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-rachat-card p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-3 flex items-center justify-between bg-rachat-card px-5 pb-3 pt-5">
          <h3 className="text-base font-extrabold text-rachat-papyrus">
            {me?.phone ? t("رقم الموبايل", "Phone number") : t("أضف رقم موبايل", "Add a phone number")}
          </h3>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="text-neutral-400"><X size={18} /></button>
        </div>

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-rachat-papyrus">
              {done === "linked"
                ? t("اترَبط. تقدر تدخل بالرقم ده، والكود بيوصل على بريدك الإلكتروني.",
                     "Linked. You can sign in with this number, and the code goes to your email.")
                : t("اتشال. الدخول بالرقم ده بقى مش متاح.", "Removed. Signing in with that number is no longer available.")}
            </p>
            <button onClick={onClose} className="rounded-xl bg-rachat-red py-3 text-sm font-extrabold text-white">{t("تمام", "Done")}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {me === null && <p className="text-xs text-neutral-500">{t("جاري التحميل…", "Loading…")}</p>}

            {me?.phone && step === "phone" && (
              <>
                <p className="text-sm text-rachat-papyrus">{me.phone}</p>
                <p className="text-xs leading-5 text-neutral-400">
                  {t("تقدر تدخل بالرقم ده أو ببريدك — والكود بيوصل على البريد في الحالتين.",
                     "You can sign in with this number or your email — the code goes to your email either way.")}
                </p>
                <button disabled={busy} onClick={() => void remove()} className="rounded-xl bg-rachat-card py-3 text-sm font-extrabold text-rachat-coral ring-1 ring-rachat-coral/50 disabled:opacity-40">
                  {t("شيل الرقم", "Remove number")}
                </button>
              </>
            )}

            {step === "phone" && (
              <>
                {/* 🔴 القاعدة تتقال **قبل** الإضافة مش بعدها */}
                <p className="rounded-xl bg-rachat-black px-3 py-2 text-[11.5px] leading-5 text-rachat-gold" role="status">
                  {t("الرقم للدخول بس — مش بيخلّي جهات اتصالك تلاقيك، لأننا مش بنقدر نتأكد إنه رقمك من غير رسالة نصية.",
                     "The number is for signing in only — it won't make your contacts find you, because we can't verify it's yours without an SMS.")}
                </p>
                <input
                  value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel"
                  placeholder="01xxxxxxxxx" aria-label={t("رقم الموبايل", "Phone number")} className={field} dir="ltr"
                />
                {err && <p className="text-sm text-rachat-coral" role="alert">{err}</p>}
                <button disabled={!phoneOk || busy} onClick={() => void sendCode()} className="rounded-xl bg-rachat-red py-3 text-sm font-extrabold text-white disabled:opacity-40">
                  {t("ابعت كود التأكيد على بريدي", "Send the confirmation code to my email")}
                </button>
              </>
            )}

            {step === "code" && (
              <>
                <p className="text-xs leading-5 text-neutral-400">
                  {t("اكتب الكود اللي وصل على بريدك الإلكتروني.", "Enter the code sent to your email.")}
                </p>
                <input
                  value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
                  placeholder="------" aria-label={t("كود التأكيد", "Confirmation code")} className={`${field} text-center tracking-[0.5em]`} dir="ltr"
                />
                {err && <p className="text-sm text-rachat-coral" role="alert">{err}</p>}
                <button disabled={code.trim().length < 4 || busy} onClick={() => void save()} className="rounded-xl bg-rachat-red py-3 text-sm font-extrabold text-white disabled:opacity-40">
                  {t("اربط الرقم", "Link the number")}
                </button>
              </>
            )}

            {!API_ON && <p className="text-[11px] text-neutral-500">{t("نسخة تجريبية: لا يوجد حفظ فعلي.", "Demo version: nothing is actually saved.")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
