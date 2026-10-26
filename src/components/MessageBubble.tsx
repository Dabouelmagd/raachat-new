import { PharaohEmoji, phaKind } from "./PharaohEmoji";
import { OccasionSticker, occKind } from "./OccasionSticker";
import { fullStamp } from "../timefmt";
import { TranslatedLine } from "./Translate";
import { useTranslate } from "../store/translate";
import { useState } from "react";
import { Check, CheckCheck, Pencil, Star } from "lucide-react";
import { bubbleStyle, useBubble } from "../theme/bubbles";

import { FileViewer, InlinePreview } from "./FilePreview";
import { PollCard } from "./PollCard";
import { msgPreview } from "./msgPreview";
import { EMOJIS } from "./emojis";
import { Message } from "../types";
import { MessageActions } from "./MessageActions";
import { ForwardSheet } from "./ForwardSheet";
import { useAppActions } from "../store/AppContext";
import { useT, useDir, num } from "../i18n";

const QUICK_REACTIONS = ["👍", "😂", "❤️", "😮"];

interface Props {
  message: Message;
  replyTo?: Message;
  onReply: (m: Message) => void;
  /** رد بالصوت على الرسالة دي */
  onVoiceReply: (m: Message) => void;
  /** القناة اللي للقراءة بس: مفيش رد ولا رد بالصوت (التفاعل بس) */
  canReply?: boolean;
}

export function MessageBubble({ message, replyTo, onReply, onVoiceReply, canReply = true }: Props) {
  const t = useT();
  const rtl = useDir() === "rtl";
  const { editMessage, deleteMessage, toggleReaction } = useAppActions();
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moreEmoji, setMoreEmoji] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [starred, setStarred] = useState(!!message.starred);
  const tset = useTranslate();
  const bubble = useBubble();
  const [draft, setDraft] = useState(message.text);
  const isMe = message.authorId === "me";

  const saveEdit = () => {
    if (draft.trim()) editMessage(message.id, draft.trim());
    setEditing(false);
  };

  const reactionEntries = Object.entries(message.reactions).filter(([, ids]) => ids.length > 0);

  return (
    <div className={`flex flex-col ${isMe === rtl ? "items-start" : "items-end"}`}>
      <div
        // `break-words` مش رفاهية: رابط طويل أو كلمة بلا مسافات مابتتكسرش، فالنص
        // بيخرج برّه الفقاعة **ويتقص** (مش بيعمل سكرول عشان فيه أب بيقص) — فالمستخدم
        // يشوف نص الرسالة ناقص من الأول أو الآخر. اتبلّغ من الإنتاج ١٢ أكتوبر.
        className={`group relative min-w-0 overflow-hidden break-words rounded-2xl px-3.5 py-2 text-sm ${message.poll ? "w-[82%] max-w-[82%]" : "max-w-[78%]"} ${isMe ? "rounded-bl-md" : "rounded-br-md"}`}
        style={bubbleStyle(bubble, isMe)}
        onClick={() => setShowActions((v) => !v)}
      >
        {replyTo && (
          <div
            className={`mb-1.5 rounded-lg border-s-2 px-2 py-1 text-[11px] opacity-80 ${
              isMe ? "border-white/60 bg-white/10" : "border-rachat-red bg-black/5"
            }`}
          >
            <div className="font-bold">{replyTo.authorName}</div>
            <div className="truncate" dir="auto">{msgPreview(replyTo, t)}</div>
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
            {/* الضغط جوه الاستطلاع = تصويت. من غير stopPropagation الضغط بيوصل
                للفقاعة وبيفتح «خيارات الرسالة» فوق الاستطلاع. */}
            {message.poll && (
              <div onClick={(e) => e.stopPropagation()}>
                <PollCard message={message} isMe={isMe} />
              </div>
            )}
            {message.attachment && <InlinePreview a={message.attachment} isMe={isMe} onOpen={() => setViewing(true)} />}
            {message.text && occKind(message.text) ? <OccasionSticker kind={occKind(message.text)!} size={150} /> : message.text && phaKind(message.text) ? <PharaohEmoji kind={phaKind(message.text)!} size={96} /> : message.text && <div dir="auto" className={message.attachment ? "mt-1.5" : ""}>{message.text}</div>}
            {tset.on && message.text && !phaKind(message.text) && !occKind(message.text) && <TranslatedLine text={message.text} to={isMe ? tset.peer : tset.mine} mine={isMe} />}
          </>
        )}

        {!message.deleted && !editing && (
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
            {isMe && !message.poll && !message.attachment?.voice && !phaKind(message.text) && !occKind(message.text) && <button onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(message.text); }} className="me-1 flex items-center gap-0.5 underline-offset-2 hover:underline"><Pencil size={10} />{t("تعديل", "Edit")}</button>}
            {starred && <Star size={11} className="fill-rachat-gold text-rachat-gold" aria-label={t("مميّزة بنجمة", "Starred")} />}
            {message.edited && <span>{t("(معدّلة)", "(edited)")}</span>}
            <time dateTime={message.at ? new Date(message.at).toISOString() : undefined} title={message.at ? fullStamp(message.at) : undefined}>{message.time}</time>
            {isMe && (
              message.read
                ? <CheckCheck size={13} className="text-sky-400" aria-label={t("قُرئت", "Read")} />
                : message.delivered
                  ? <CheckCheck size={13} aria-label={t("وصلت", "Delivered")} />
                  : <Check size={13} aria-label={t("أُرسِلت", "Sent")} />
            )}
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

      {showActions && (
        <MessageActions
          message={{ ...message, starred }}
          isMe={isMe}
          onClose={() => setShowActions(false)}
          canReply={canReply}
          onReply={() => onReply(message)}
          onVoiceReply={() => onVoiceReply(message)}
          onEdit={() => { setDraft(message.text); setEditing(true); }}
          onDelete={() => deleteMessage(message.id)}
          onForward={() => setForwarding(true)}
          onReact={(e) => toggleReaction(message.id, e)}
          onMoreEmoji={() => setMoreEmoji(true)}
          onStarChanged={setStarred}
        />
      )}
      {forwarding && <ForwardSheet message={message} onClose={() => setForwarding(false)} />}

      {moreEmoji && !message.deleted && (
        <div
          role="group"
          aria-label={t("اختر إيموجي", "Pick an emoji")}
          className={`mt-1 grid max-h-40 w-[260px] max-w-full grid-cols-8 gap-0.5 overflow-y-auto rounded-2xl bg-rachat-card p-1.5 shadow-lg shadow-black/30 ${isMe === rtl ? "self-start" : "self-end"}`}
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => { toggleReaction(message.id, e); setMoreEmoji(false); }}
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
