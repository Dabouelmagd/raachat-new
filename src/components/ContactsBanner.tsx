import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, X } from "lucide-react";
import { useT } from "../i18n";
import { shouldRemind, hideBanner } from "../contacts/device";

/** تذكير لمن أجّل مزامنة جهات الاتصال — اختياري وبيتقفل نهائيًا بالضغط على X */
export function ContactsBanner() {
  const t = useT();
  const nav = useNavigate();
  const [show, setShow] = useState(shouldRemind);
  if (!show) return null;
  return (
    <div className="mx-3.5 mb-2 flex items-center gap-2.5 rounded-xl bg-rachat-card px-3 py-2.5">
      <UserPlus size={16} className="shrink-0 text-rachat-gold" />
      <p className="min-w-0 flex-1 text-[11.5px] leading-5 text-neutral-300">{t("اعرف مين من أصحابك على رع شات", "See which of your contacts are on Raa Chat")}</p>
      <button onClick={() => nav("/friends")} className="shrink-0 rounded-lg bg-rachat-red px-2.5 py-1 text-[11px] font-bold text-white">{t("تفعيل", "Turn on")}</button>
      <button onClick={() => { hideBanner(); setShow(false); }} aria-label={t("إخفاء التذكير", "Dismiss reminder")} className="shrink-0 p-1 text-neutral-500"><X size={14} /></button>
    </div>
  );
}
