import { useState } from "react";
import {
  Copy, CornerUpLeft, CornerUpRight, Flag, Info, Mic, Pencil, Share2, Star, Trash2, X,
} from "lucide-react";
import { API_ON, api } from "../api/client";
import { fullStamp } from "../timefmt";
import { fmtSize } from "../media/files";
import { useDir, useT, num } from "../i18n";
import { Message } from "../types";
import { useCloseOnEscape } from "./useCloseOnEscape";
import { msgPreview } from "./msgPreview";

const QUICK = ["👍", "😂", "❤️", "😮", "😢", "🙏"];

export interface ActionsProps {
  message: Message;
  isMe: boolean;
  onClose: () => void;
  onReply: () => void;
  /** رد بالصوت: بيضبط الرد ويبدأ التسجيل على طول */
  onVoiceReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onReact: (emoji: string) => void;
  onMoreEmoji: () => void;
  onStarChanged: (starred: boolean) => void;
}

/**
 * قايمة خيارات الرسالة — نافذة واحدة فيها كل حاجة، بدل صفّ أيقونات صغيّر من غير
 * أسماء. (بطلب داليا ١٢ أكتوبر، على شكل قايمة الرسائل في الآيفون.)
 * القفل بتلات طرق: الزرار · اللمس برّه · Escape.
 */
export function MessageActions(p: ActionsProps) {
  const t = useT();
  const rtl = useDir() === "rtl";
  useCloseOnEscape(p.onClose);
  const [info, setInfo] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [done, setDone] = useState("");
  const [starred, setStarred] = useState(!!p.message.starred);
  const m = p.message;

  const copy = async () => {
    const text = m.text || m.attachment?.name || "";
    try {
      await navigator.clipboard.writeText(text);
      setDone(t("اتنسخت", "Copied"));
    } catch {
      setDone(t("المتصفح مارضيش ينسخ", "The browser refused to copy"));
    }
  };

  const toggleStar = async () => {
    const next = !starred;
    setStarred(next); // تفاؤلي: النجمة بتبان فورًا
    try {
      if (API_ON) await api(`/messages/${m.id}/star`, { method: next ? "PUT" : "DELETE" });
      p.onStarChanged(next);
    } catch {
      setStarred(!next); // رجّعها زي ما كانت لو السيرفر رفض
      setDone(t("ما اتحفظتش، حاول تاني", "Not saved, try again"));
    }
  };

  const report = async (reason: string) => {
    try {
      if (API_ON) await api("/reports", { method: "POST", body: { kind: "message", targetId: m.id, reason } });
      setDone(t("تم الإبلاغ، شكرًا لك", "Reported, thank you"));
    } catch { setDone(t("تعذّر الإبلاغ، حاول لاحقًا", "Couldn't report, try later")); }
    setReporting(false);
  };
  const block = async () => {
    try {
      if (API_ON) await api("/blocks", { method: "POST", body: { userId: m.authorId } });
      setDone(t("تم حظر المرسل", "Sender blocked"));
    } catch { setDone(t("تعذّر الحظر، حاول لاحقًا", "Couldn't block, try later")); }
    setReporting(false);
  };

  const Row = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm hover:bg-white/5 ${danger ? "text-rachat-red" : "text-rachat-papyrus"}`}
    >
      <span className="w-5 shrink-0 text-center">{icon}</span>
      {label}
    </button>
  );

  const canEdit = isTextOnly(m);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label={t("خيارات الرسالة", "Message options")} onClick={p.onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-rachat-card p-2 pb-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {/* معاينة الرسالة + زرار الإغلاق، ثابتين فوق مهما اتسكرل */}
        <div className="sticky top-0 z-10 mb-1 flex items-start gap-2 bg-rachat-card px-2 pb-2 pt-2">
          <p className="line-clamp-2 flex-1 break-words text-xs text-neutral-400" dir="auto">
            {msgPreview(m, t)}
          </p>
          <button onClick={p.onClose} aria-label={t("إغلاق", "Close")} className="shrink-0 text-neutral-400"><X size={18} /></button>
        </div>

        {!m.deleted && (
          <div className="mb-1 flex items-center justify-between gap-1 rounded-2xl bg-rachat-black px-2 py-1.5">
            {QUICK.map((e) => (
              <button key={e} onClick={() => { p.onReact(e); p.onClose(); }} aria-label={e} className="px-1 text-xl">{e}</button>
            ))}
            <button onClick={() => { p.onMoreEmoji(); p.onClose(); }} aria-label={t("المزيد من الإيموجي", "More emoji")} className="px-1 text-sm text-neutral-400">+</button>
          </div>
        )}

        {done && <p className="px-3 py-1 text-xs text-rachat-gold" role="status">{done}</p>}

        {!m.deleted && (
          <>
            <Row icon={rtl ? <CornerUpLeft size={17} /> : <CornerUpRight size={17} />} label={t("رد", "Reply")} onClick={() => { p.onReply(); p.onClose(); }} />
            <Row icon={<Mic size={17} />} label={t("رد بالصوت", "Reply with voice")} onClick={() => { p.onVoiceReply(); p.onClose(); }} />
            <Row icon={<Share2 size={17} />} label={t("إعادة توجيه", "Forward")} onClick={() => { p.onForward(); p.onClose(); }} />
            <Row icon={<Copy size={17} />} label={t("نسخ", "Copy")} onClick={() => void copy()} />
            <Row icon={<Star size={17} className={starred ? "fill-rachat-gold text-rachat-gold" : ""} />} label={starred ? t("إلغاء التمييز", "Unstar") : t("تمييز بنجمة", "Star")} onClick={() => void toggleStar()} />
            <Row icon={<Info size={17} />} label={t("معلومات", "Info")} onClick={() => setInfo((v) => !v)} />
            {p.isMe && canEdit && <Row icon={<Pencil size={17} />} label={t("تعديل", "Edit")} onClick={() => { p.onEdit(); p.onClose(); }} />}
            {!p.isMe && <Row icon={<Flag size={17} />} label={t("إبلاغ", "Report")} onClick={() => setReporting((v) => !v)} />}
            {p.isMe && <Row icon={<Trash2 size={17} />} label={t("حذف", "Delete")} danger onClick={() => { p.onDelete(); p.onClose(); }} />}
          </>
        )}

        {info && (
          <dl className="mx-2 mt-1 rounded-xl bg-rachat-black p-3 text-xs text-neutral-300">
            <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("المُرسِل", "From")}</dt><dd dir="auto">{m.authorName}</dd></div>
            <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("وقت الإرسال", "Sent")}</dt><dd>{m.at ? fullStamp(m.at) : m.time}</dd></div>
            {p.isMe && <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("الحالة", "Status")}</dt><dd>{m.read ? t("اتقرت", "Read") : t("اتبعتت", "Sent")}</dd></div>}
            {m.edited && <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("التعديل", "Edited")}</dt><dd>{t("اتعدّلت بعد الإرسال", "Edited after sending")}</dd></div>}
            {m.text && <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("عدد الحروف", "Characters")}</dt><dd>{num(m.text.length)}</dd></div>}
            {m.attachment && (
              <>
                <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("المرفق", "Attachment")}</dt><dd className="truncate" dir="auto">{m.attachment.name}</dd></div>
                <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("الحجم", "Size")}</dt><dd>{fmtSize(m.attachment.size)}</dd></div>
              </>
            )}
            {Object.values(m.reactions).some((x) => x.length) && (
              <div className="flex justify-between gap-3 py-0.5"><dt className="text-neutral-500">{t("التفاعلات", "Reactions")}</dt><dd>{Object.entries(m.reactions).filter(([, v]) => v.length).map(([e, v]) => `${e}${v.length > 1 ? num(v.length) : ""}`).join(" ")}</dd></div>
            )}
          </dl>
        )}

        {reporting && (
          <div className="mx-2 mt-1 flex flex-wrap gap-1 rounded-xl bg-rachat-black p-2 text-xs">
            <span className="w-full pb-1 text-neutral-500">{t("سبب الإبلاغ:", "Report reason:")}</span>
            {([["abuse", "إساءة", "Abuse"], ["spam", "مزعجة", "Spam"], ["inappropriate", "غير لائق", "Inappropriate"], ["scam", "احتيال", "Scam"]] as const).map(([k, ar, en]) => (
              <button key={k} onClick={() => void report(k)} className="rounded-full bg-rachat-maroon/60 px-2.5 py-1 text-neutral-200 hover:bg-rachat-red">{t(ar, en)}</button>
            ))}
            <button onClick={() => void block()} className="rounded-full border border-rachat-red/70 px-2.5 py-1 text-rachat-red">{t("حظر المرسل", "Block sender")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** التعديل للنص بس — مش للصوت ولا الاستيكرز ولا المرفقات */
export function isTextOnly(m: Message) {
  return !!m.text && !m.attachment && !m.text.startsWith("[[");
}
