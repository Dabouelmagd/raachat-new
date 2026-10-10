import { PharaohEmoji, phaKind } from "./PharaohEmoji";
import { OccasionSticker, occKind } from "./OccasionSticker";
import { fullStamp } from "../timefmt";
import { TranslatedLine } from "./Translate";
import { useTranslate } from "../store/translate";
import { useState } from "react";
import { Check, CheckCheck, CornerUpLeft, Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { API_ON, api } from "../api/client";
import { FileViewer, InlinePreview } from "./FilePreview";
import { EMOJIS } from "./emojis";
import { Message } from "../types";
import { CornerUpRight } from "lucide-react";
import { useAppActions } from "../store/AppContext";
import { useT, useDir, num } from "../i18n";

const QUICK_REACTIONS = ["👍", "😂", "❤️", "😮"];

interface Props {
  message: Message;
  replyTo?: Message;
  onReply: (m: Message) => void;
}

export function MessageBubble({ message, replyTo, onReply }: Props) {
  const t = useT();
  const rtl = useDir() === "rtl";
  const { editMessage, deleteMessage, toggleReaction } = useAppActions();
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moreEmoji, setMoreEmoji] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState<"" | "ok" | "err">("");
  const tset = useTranslate();
  const [draft, setDraft] = useState(message.text);
  const isMe = message.authorId === "me";

  const saveEdit = () => {
    if (draft.trim()) editMessage(message.id, draft.trim());
    setEditing(false);
  };

  const REPORT_REASONS: [string, string, string][] = [["abuse", "إساءة", "Abuse"], ["spam", "مزعجة", "Spam"], ["inappropriate", "غير لائق", "Inappropriate"], ["scam", "احتيال", "Scam"]];
  const blockAuthor = async () => {
    try {
      if (API_ON) await api("/blocks", { method: "POST", body: { userId: message.authorId } });
      setReported("ok");
    } catch { setReported("err"); }
    setReporting(false);
  };
  const sendReport = async (reason: string) => {
    try {
      if (API_ON) await api("/reports", { method: "POST", body: { kind: "message", targetId: message.id, reason } });
      setReported("ok");
    } catch { setReported("err"); }
    setReporting(false);
  };

  const reactionEntries = Object.entries(message.reactions).filter(([, ids]) => ids.length > 0);

  return (
    <div className={`flex flex-col ${isMe === rtl ? "items-start" : "items-end"}`}>
      <div
        className={`group relative max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
          isMe
            ? "rounded-bl-md bg-gradient-to-br from-rachat-red to-rachat-coral text-white"
            : "rounded-br-md bg-[#EAE0CF] text-rachat-ink"
        }`}
        onClick={() => setShowActions((v) => !v)}
      >
        {replyTo && (
          <div
            className={`mb-1.5 rounded-lg border-s-2 px-2 py-1 text-[11px] opacity-80 ${
              isMe ? "border-white/60 bg-white/10" : "border-rachat-red bg-black/5"
            }`}
          >
            <div className="font-bold">{replyTo.authorName}</div>
            <div className="truncate">{replyTo.deleted ? t("تم حذف الرسالة", "Message deleted") : replyTo.text}</div>
          </div>
        )}

        {message.deleted ? (
          <div className="italic opacity-70">{t("تم حذف هذه الرسالة", "This message was deleted")}</div>
        ) : editing ? (
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              className="rounded-lg bg-black/20 px-2 py-1 text-sm text-inherit outline-none"
            />
            <div className="flex gap-2 text-[11px]">
              <button onClick={saveEdit} className="font-bold">{t("حفظ", "Save")}</button>
              <button onClick={() => setEditing(false)} className="opacity-70">{t("إلغاء", "Cancel")}</button>
            </div>
          </div>
        ) : (
          <>
            {message.attachment && <InlinePreview a={message.attachment} isMe={isMe} onOpen={() => setViewing(true)} />}
            {message.text && occKind(message.text) ? <OccasionSticker kind={occKind(message.text)!} size={150} /> : message.text && phaKind(message.text) ? <PharaohEmoji kind={phaKind(message.text)!} size={96} /> : message.text && <div className={message.attachment ? "mt-1.5" : ""}>{message.text}</div>}
            {tset.on && message.text && !phaKind(message.text) && !occKind(message.text) && <TranslatedLine text={message.text} to={isMe ? tset.peer : tset.mine} mine={isMe} />}
          </>
        )}

        {!message.deleted && !editing && (
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
            {isMe && !message.attachment?.voice && !phaKind(message.text) && !occKind(message.text) && <button onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(message.text); }} className="me-1 flex items-center gap-0.5 underline-offset-2 hover:underline"><Pencil size={10} />{t("تعديل", "Edit")}</button>}
            {message.edited && <span>{t("(معدّلة)", "(edited)")}</span>}
            <time dateTime={message.at ? new Date(message.at).toISOString() : undefined} title={message.at ? fullStamp(message.at) : undefined}>{message.time}</time>
            {isMe && (message.read ? <CheckCheck size={13} className="text-rachat-coral" /> : <Check size={13} />)}
          </div>
        )}
      </div>

      {reactionEntries.length > 0 && (
        <div className="mt-1 flex gap-1">
          {reactionEntries.map(([emoji, ids]) => (
            <button
              key={emoji}
              onClick={() => toggleReaction(message.id, emoji)}
              className="rounded-full bg-rachat-card px-2 py-0.5 text-[11px]"
            >
              {emoji} {ids.length > 1 ? num(ids.length) : ""}
            </button>
          ))}
        </div>
      )}

      {showActions && !message.deleted && message.at && (
        <div className="mt-1 text-[10px] text-neutral-500" dir="auto">{t("أُرسلت", "Sent")} {fullStamp(message.at)}</div>
      )}
      {showActions && !message.deleted && (
        <div
          className={`mt-1 flex items-center gap-1 rounded-full bg-rachat-card px-2 py-1 ${
            isMe === rtl ? "self-start" : "self-end"
          }`}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => toggleReaction(message.id, emoji)}
              className="px-1 text-sm"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={() => setMoreEmoji((v) => !v)}
            aria-label={t("المزيد من الإيموجي", "More emoji")}
            aria-expanded={moreEmoji}
            className={`flex h-6 w-6 items-center justify-center rounded-full ${moreEmoji ? "bg-rachat-red text-white" : "bg-rachat-maroon/50 text-neutral-300"}`}
          >
            <Plus size={14} />
          </button>
          <span className="mx-0.5 h-4 w-px bg-rachat-maroon" />
          <button onClick={() => onReply(message)} aria-label={t("رد", "Reply")} className="p-1 text-neutral-400">
            {rtl ? <CornerUpLeft size={14} /> : <CornerUpRight size={14} />}
          </button>
          {!isMe && (
            <button onClick={() => { setReporting((v) => !v); setReported(""); }} aria-label={t("إبلاغ", "Report")} aria-expanded={reporting} className="p-1 text-neutral-400">
              <Flag size={13} />
            </button>
          )}
          {isMe && (
            <>
              <button onClick={() => setEditing(true)} aria-label={t("تعديل", "Edit")} className="p-1 text-neutral-400">
                <Pencil size={13} />
              </button>
              <button onClick={() => deleteMessage(message.id)} aria-label={t("حذف", "Delete")} className="p-1 text-rachat-red">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      )}

      {showActions && !isMe && !message.deleted && (reporting || reported) && (
        <div role="group" aria-label={t("سبب الإبلاغ", "Report reason")} className={`mt-1 flex flex-wrap items-center gap-1 rounded-2xl bg-rachat-card p-1.5 text-[12px] shadow-lg shadow-black/30 ${isMe === rtl ? "self-start" : "self-end"}`}>
          {reported === "ok" && <span className="px-1 text-emerald-400">{t("تم الإبلاغ، شكرًا لك", "Reported, thank you")}</span>}
          {reported === "err" && <span className="px-1 text-rachat-red">{t("تعذّر الإبلاغ، حاولي لاحقًا", "Couldn't report, try later")}</span>}
          {reporting && <>
            <span className="px-1 text-neutral-400">{t("إبلاغ عن:", "Report:")}</span>
            {REPORT_REASONS.map(([k, ar, en]) => (
              <button key={k} onClick={() => sendReport(k)} className="rounded-full bg-rachat-maroon/60 px-2 py-0.5 text-neutral-200 hover:bg-rachat-red">{t(ar, en)}</button>
            ))}
            <button onClick={blockAuthor} className="rounded-full border border-rachat-red/70 px-2 py-0.5 text-rachat-red">{t("حظر المرسل", "Block sender")}</button>
          </>}
        </div>
      )}

      {showActions && moreEmoji && !message.deleted && (
        <div
          role="group"
          aria-label={t("اختاري إيموجي", "Pick an emoji")}
          className={`mt-1 grid max-h-40 w-[260px] max-w-full grid-cols-8 gap-0.5 overflow-y-auto rounded-2xl bg-rachat-card p-1.5 shadow-lg shadow-black/30 ${isMe === rtl ? "self-start" : "self-end"}`}
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => { toggleReaction(message.id, e); setMoreEmoji(false); setShowActions(false); }}
              className="rounded-lg py-0.5 text-[19px] leading-8 hover:bg-white/5"
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {viewing && message.attachment && <FileViewer a={message.attachment} onClose={() => setViewing(false)} />}
    </div>
  );
}
