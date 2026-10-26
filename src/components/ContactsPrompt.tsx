import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { useT } from "../i18n";
import { canReadContacts, consentAsked, setConsent } from "../contacts/device";

/** بعد أول تسجيل: عرض مرة واحدة لمزامنة جهات الاتصال (بموافقة صريحة). */
export function ContactsPrompt() {
  const t = useT();
  const nav = useNavigate();
  const [open, setOpen] = useState(() => !consentAsked());
  const canRead = canReadContacts();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-[380px] rounded-t-2xl bg-rachat-card p-5 text-center sm:rounded-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rachat-gold/20 text-rachat-gold"><Users size={22} /></div>
        <p className="font-extrabold text-rachat-papyrus">{t("اعرف مَن من أصدقائك على رع شات", "See who's on Raa Chat")}</p>
        <p className="mt-2 text-xs leading-6 text-neutral-400">{canRead
          ? t("نطابق الأرقام المحفوظة على هاتفك مع المسجّلين لنُظهر مَن لديه التطبيق، ويمكنك دعوة مَن ليس لديه. الأرقام لا تُخزَّن على الخادم، ويمكنك إيقاف ذلك في أي وقت.", "We match the numbers saved on your phone against registered users so you can see who has the app and invite the rest. Numbers are not stored on our servers, and you can turn this off any time.")
          : t("قراءة جهات الاتصال متاحة في تطبيق الهاتف. من المتصفح يمكنك دعوة أصدقائك برابط بدلًا من ذلك.", "Reading contacts is available in the mobile app. From a browser you can invite friends with a link instead.")}</p>
        <button onClick={() => { setConsent(true); setOpen(false); nav("/friends"); }} className="mt-4 w-full rounded-xl bg-rachat-red py-2.5 text-sm font-bold text-white">{canRead ? t("متابعة", "Continue") : t("فتح صفحة الأصدقاء", "Open Friends")}</button>
        <button onClick={() => { setConsent(false); setOpen(false); }} className="mt-2 w-full py-2 text-xs text-neutral-500">{t("ليس الآن", "Not now")}</button>
      </div>
    </div>
  );
}
