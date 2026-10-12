import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { API_ON, api, setMyPassword } from "../api/client";
import { useT, num } from "../i18n";
import { useCloseOnEscape } from "./useCloseOnEscape";

const MIN = 8;

/**
 * تعيين أو تغيير كلمة السر من جوه الحساب.
 *
 * ليه موجودة: الحسابات اللي اتعملت قبل كلمة السر (وكل حساب بيدخل برقم تليفون)
 * مالهاش كلمة سر، فهي محتاجة تدخل بكود **كل مرة**. من هنا بتعمل كلمة سر مرة
 * واحدة وتخلص. وتغيير كلمة السر بيطلّع **كل الجلسات التانية** — لو حد كان داخل
 * بجلسة مسروقة، التغيير لازم يطلّعه.
 */
export function PasswordSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  useCloseOnEscape(onClose);
  const [has, setHas] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!API_ON) { setHas(false); return; }
    api<{ hasPassword?: boolean }>("/me")
      .then((me) => setHas(!!me.hasPassword))
      .catch(() => setHas(false));
  }, []);

  const ok = pass.length >= MIN && pass === again && (has === false || current.length > 0);
  const save = async () => {
    setErr("");
    if (!API_ON) { setDone(true); return; }
    setBusy(true);
    try {
      await setMyPassword(pass, has ? current : undefined);
      setDone(true);
    } catch (e) {
      setErr((e as Error).message || t("حصلت مشكلة، حاول تاني", "Something went wrong, try again"));
    }
    setBusy(false);
  };

  const field = "w-full rounded-xl bg-rachat-black px-3.5 py-3 text-sm outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-rachat-card p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {/* العنوان بزرار الإغلاق لازم يفضل ظاهر مهما اتسكرل */}
        <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-3 flex items-center justify-between bg-rachat-card px-5 pb-3 pt-5">
          <h3 className="text-base font-extrabold text-rachat-papyrus">
            {has ? t("تغيير كلمة السر", "Change password") : t("اعمل كلمة سر للحساب", "Set a password")}
          </h3>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="text-neutral-400"><X size={18} /></button>
        </div>

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-rachat-papyrus">
              {has
                ? t("اتغيّرت. أي جهاز تاني كان داخل بحسابك اتسجّل خروجه.", "Changed. Any other device signed into your account has been logged out.")
                : t("تمام — من المرة الجاية ادخل بإيميلك وكلمة السر، مش بكود.", "Done — next time sign in with your email and password, not a code.")}
            </p>
            <button onClick={onClose} className="rounded-xl bg-rachat-red py-3 text-sm font-extrabold text-white">{t("تمام", "Done")}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {has === null && <p className="text-xs text-neutral-500">{t("جاري التحميل…", "Loading…")}</p>}
            {has === false && (
              <p className="text-xs leading-5 text-neutral-400">
                {t("حسابك دلوقتي بيدخل بكود لمرة واحدة كل مرة. اعمل كلمة سر وادخل بيها بعد كده.",
                   "Your account currently signs in with a one-time code every time. Set a password and use it from now on.")}
              </p>
            )}
            {has && (
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
                placeholder={t("كلمة السر الحالية", "Current password")} aria-label={t("كلمة السر الحالية", "Current password")} className={field} />
            )}
            <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)}
              placeholder={t(`كلمة السر الجديدة (${num(MIN)} حروف على الأقل)`, `New password (at least ${MIN} characters)`)}
              aria-label={t("كلمة السر الجديدة", "New password")} className={field} />
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)}
              placeholder={t("اكتبها تاني", "Repeat it")} aria-label={t("تأكيد كلمة السر", "Confirm password")} className={field} />
            {again.length > 0 && pass !== again && <p className="text-[11px] text-rachat-coral">{t("الكلمتين مش زي بعض", "The two don't match")}</p>}
            {err && <p className="text-sm text-rachat-coral" role="alert">{err}</p>}
            <button disabled={!ok || busy} onClick={() => void save()} className="rounded-xl bg-rachat-red py-3 text-sm font-extrabold text-white disabled:opacity-40">
              {has ? t("غيّر كلمة السر", "Change password") : t("اعمل كلمة السر", "Set password")}
            </button>
            {!API_ON && <p className="text-[11px] text-neutral-500">{t("نسخة تجريبية: مفيش حفظ فعلي.", "Demo version: nothing is actually saved.")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
