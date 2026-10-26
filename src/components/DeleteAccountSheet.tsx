import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { API_ON, api, ApiError, setSession } from "../api/client";
import { useLogout } from "../auth";
import { useT } from "../i18n";

const DEMO_CODE = "123456";

/** حذف الحساب نهائيًا: تحذير → كود تأكيد على رقم/إيميل الحساب → حذف. متاح في أي وقت من شاشة الحساب. */
export function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const logout = useLogout();
  const [step, setStep] = useState<"warn" | "code">("warn");
  const [hint, setHint] = useState("");
  const [balance, setBalance] = useState(0);
  const [code, setCode] = useState("");
  const [forfeit, setForfeit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sendCode = async () => {
    setBusy(true); setErr("");
    try {
      if (API_ON) {
        const r = await api<{ hint: string; balance: number }>("/me/delete/otp", { method: "POST" });
        setHint(r.hint); setBalance(r.balance);
      } else { setHint("01••••••00"); setBalance(0); }
      setStep("code");
    } catch (e) { setErr((e as Error).message || t("تعذّر إرسال الكود", "Couldn't send the code")); }
    setBusy(false);
  };
  const del = async () => {
    setBusy(true); setErr("");
    try {
      if (API_ON) {
        await api("/me", { method: "DELETE", body: { code: code.trim(), forfeitBalance: forfeit } });
        setSession(null); // الجلسة اتلغت على السيرفر → شاشة الدخول
      } else if (code.trim() !== DEMO_CODE) throw new Error(t("الكود غير صحيح", "Incorrect code"));
      else logout();
    } catch (e) {
      const ae = e instanceof ApiError ? e : null;
      setErr(ae?.code === "wallet_balance" ? ae.message : (e as Error).message || t("تعذّر حذف الحساب", "Couldn't delete the account"));
      if (ae?.code === "wallet_balance") setBalance(Math.max(balance, 1));
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t("حذف الحساب", "Delete account")} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] rounded-t-3xl bg-rachat-card p-5 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-rachat-red"><Trash2 size={18} /> {t("حذف الحساب نهائيًا", "Delete account permanently")}</h2>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="p-1 text-neutral-400"><X size={18} /></button>
        </div>
        {step === "warn" ? (
          <>
            <ul className="mb-4 list-disc space-y-1.5 ps-5 text-[12.5px] leading-relaxed text-rachat-papyrus">
              <li>{t("يُمحى اسمك وصورتك ورقمك وبريدك، ولا يمكن استرجاعها.", "Your name, photo and phone/email are erased and can't be restored.")}</li>
              <li>{t("تُحذف رسائلك من كل المحادثات، وتُمحى قصصك وسجلّ مكالماتك.", "Your messages are removed from all chats; your stories and call history are erased.")}</li>
              <li>{t("تخرج من كل المجموعات، والغرف التي تستضيفها تُغلق.", "You leave all groups, and rooms you host are closed.")}</li>
              <li>{t("يُفقَد رصيد المحفظة إن وُجد، فاصرفه قبل الحذف.", "Any wallet balance is lost. Spend it before deleting.")}</li>
              <li>{t("تُحفظ سجلّات المدفوعات دون أي بيانات تعرّف بك، للالتزامات المحاسبية.", "Payment records are kept without any identifying data, for accounting obligations.")}</li>
            </ul>
            {err && <p role="alert" className="mb-2 text-xs text-rachat-red">{err}</p>}
            <button disabled={busy} onClick={sendCode} className="w-full rounded-xl bg-rachat-red py-3 text-sm font-bold text-white disabled:opacity-50">
              {busy ? t("جاري الإرسال…", "Sending…") : t("أرسِل لي كود التأكيد", "Send me a confirmation code")}
            </button>
            <button onClick={onClose} className="mt-2 w-full rounded-xl py-2.5 text-sm text-neutral-300">{t("لا، أبقِني", "No, keep my account")}</button>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-rachat-papyrus">{t("أرسلنا كود تأكيد إلى", "We sent a confirmation code to")} <b dir="ltr">{hint}</b>{!API_ON && <span className="text-rachat-gold"> ({t("كود التجربة", "demo code")}: {DEMO_CODE})</span>}</p>
            <input value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={10} placeholder="______"
              aria-label={t("كود التأكيد", "Confirmation code")} className="mb-3 w-full rounded-xl bg-rachat-black px-3 py-3 text-center text-lg tracking-[0.4em] text-rachat-papyrus outline-none ring-1 ring-rachat-maroon focus:ring-rachat-red" />
            {balance > 0 && (
              <label className="mb-3 flex items-start gap-2 rounded-xl bg-rachat-black/60 p-3 text-xs text-rachat-papyrus">
                <input type="checkbox" checked={forfeit} onChange={(e) => setForfeit(e.target.checked)} className="mt-0.5" />
                <span>{t(`أدرك أنّ رصيد محفظتي (${balance} ج.م) سيضيع مع حذف الحساب`, `I understand my wallet balance (${balance} EGP) will be lost`)}</span>
              </label>
            )}
            {err && <p role="alert" className="mb-2 text-xs text-rachat-red">{err}</p>}
            <button disabled={busy || code.trim().length < 4 || (balance > 0 && !forfeit)} onClick={del} className="w-full rounded-xl bg-rachat-red py-3 text-sm font-bold text-white disabled:opacity-40">
              {busy ? t("جاري الحذف…", "Deleting…") : t("احذف حسابي نهائيًا", "Delete my account permanently")}
            </button>
            <button onClick={onClose} className="mt-2 w-full rounded-xl py-2.5 text-sm text-neutral-300">{t("إلغاء", "Cancel")}</button>
          </>
        )}
      </div>
    </div>
  );
}
