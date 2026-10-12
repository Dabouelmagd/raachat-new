import { useState } from "react";
import { Search, Send, X } from "lucide-react";
import { useAppActions, useAppState } from "../store/AppContext";
import { ThreadAvatar } from "./ThreadAvatar";
import { useT } from "../i18n";
import { Message } from "../types";
import { useCloseOnEscape } from "./useCloseOnEscape";
import { msgPreview } from "./msgPreview";

/**
 * إعادة توجيه رسالة لمحادثة تانية.
 * بيبعت **نسخة جديدة** (نص + نفس المرفق) — مش بيلمس الرسالة الأصلية، والطرف
 * التاني بيشوفها رسالة عادية منك. والمرفق بيتبعت برابطه المرفوع، فمفيش رفع تاني.
 */
export function ForwardSheet({ message, onClose }: { message: Message; onClose: () => void }) {
  const t = useT();
  useCloseOnEscape(onClose);
  const { threads } = useAppState();
  const { sendMessage } = useAppActions();
  const [q, setQ] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const list = threads.filter((th) => th.name.toLowerCase().includes(q.trim().toLowerCase()));

  const forward = async (threadId: string) => {
    setErr("");
    setBusy(threadId);
    try {
      await sendMessage(threadId, message.text, undefined, message.attachment);
      setSent((s) => [...s, threadId]);
    } catch (e) {
      setErr((e as Error).message || t("ما اتبعتتش، حاول تاني", "Not sent, try again"));
    }
    setBusy("");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label={t("إعادة توجيه", "Forward")} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-rachat-card sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-rachat-maroon/40 px-4 py-3">
          <h3 className="text-sm font-extrabold text-rachat-papyrus">{t("إعادة توجيه إلى…", "Forward to…")}</h3>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="text-neutral-400"><X size={18} /></button>
        </div>
        <p className="line-clamp-2 break-words border-b border-rachat-maroon/30 px-4 py-2 text-[11px] text-neutral-500" dir="auto">
          {msgPreview(message, t)}
        </p>
        <div className="flex items-center gap-2 px-4 py-2">
          <Search size={15} className="text-neutral-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("دوّر على محادثة", "Search chats")}
            aria-label={t("دوّر على محادثة", "Search chats")}
            className="w-full bg-transparent text-sm text-rachat-papyrus outline-none placeholder:text-neutral-500"
          />
        </div>
        {err && <p className="px-4 pb-1 text-xs text-rachat-coral" role="alert">{err}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {list.map((th) => (
            <button
              key={th.id}
              disabled={!!busy || sent.includes(th.id)}
              onClick={() => void forward(th.id)}
              className="mb-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-white/5 disabled:opacity-60"
            >
              <ThreadAvatar thread={th} className="h-10 w-10 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-rachat-papyrus" dir="auto">{th.name}</span>
              <span className="shrink-0 text-[11px] font-bold text-rachat-coral">
                {sent.includes(th.id) ? t("اتبعتت ✓", "Sent ✓") : busy === th.id ? t("…", "…") : <Send size={15} />}
              </span>
            </button>
          ))}
          {list.length === 0 && <p className="px-3 py-6 text-center text-xs text-neutral-500">{t("مفيش محادثة بالاسم ده", "No chat with that name")}</p>}
        </div>
      </div>
    </div>
  );
}
