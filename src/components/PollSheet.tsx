import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAppActions } from "../store/AppContext";
import { useT, num as n } from "../i18n";
import { useCloseOnEscape } from "./useCloseOnEscape";

/** الحد الأقصى للاختيارات — نفس حد السيرفر (`options` في `/threads/:id/polls`) */
export const MAX_OPTIONS = 12;

/**
 * إنشاء استطلاع: سؤال + اختيارين على الأقل، ولك اختيار «أكتر من إجابة».
 * الاستطلاع بيتبعت **رسالة** في المحادثة، فبياخد نفس قواعد الرسايل (فلتر
 * الكلمات، الجروب المتقيّد، الحظر) — والرفض بيظهر هنا بنصّه من السيرفر.
 */
export function PollSheet({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const t = useT();
  useCloseOnEscape(onClose);
  const { createPoll } = useAppActions();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= 2 && new Set(filled).size === filled.length;

  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));

  const send = async () => {
    if (!ready || busy) return;
    setErr("");
    setBusy(true);
    try {
      await createPoll(threadId, question.trim(), filled, multi);
      onClose();
    } catch (e) {
      setErr((e as Error).message || t("الاستطلاع ما اتبعتش، حاول تاني", "Poll not sent, try again"));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label={t("استطلاع جديد", "New poll")} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-rachat-card sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-rachat-maroon/40 px-4 py-3">
          <h3 className="text-sm font-extrabold text-rachat-papyrus">{t("استطلاع جديد", "New poll")}</h3>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="text-neutral-400"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-neutral-400">{t("السؤال", "Question")}</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              dir="auto"
              placeholder={t("اسأل سؤالك", "Ask a question")}
              aria-label={t("السؤال", "Question")}
              className="w-full rounded-xl bg-rachat-black px-3 py-2.5 text-rachat-papyrus outline-none placeholder:text-neutral-600"
            />
          </label>

          <div>
            <span className="mb-1 block text-[11px] font-bold text-neutral-400">{t("الاختيارات", "Options")}</span>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={o}
                    onChange={(e) => setOpt(i, e.target.value)}
                    maxLength={100}
                    dir="auto"
                    placeholder={t(`اختيار ${n(i + 1)}`, `Option ${i + 1}`)}
                    aria-label={t(`اختيار ${n(i + 1)}`, `Option ${i + 1}`)}
                    className="min-w-0 flex-1 rounded-xl bg-rachat-black px-3 py-2.5 text-rachat-papyrus outline-none placeholder:text-neutral-600"
                  />
                  {options.length > 2 && (
                    <button onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} aria-label={t("شيل الاختيار", "Remove option")} className="shrink-0 text-neutral-500"><X size={16} /></button>
                  )}
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <button onClick={() => setOptions((o) => [...o, ""])} className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rachat-gold">
                <Plus size={14} /> {t("اختيار كمان", "Add option")}
              </button>
            )}
          </div>

          <button
            onClick={() => setMulti((m) => !m)}
            role="switch"
            aria-checked={multi}
            className="flex w-full items-center justify-between rounded-xl bg-rachat-black px-3 py-2.5 text-start text-xs font-bold text-rachat-papyrus"
          >
            {t("يسمح بأكتر من إجابة", "Allow multiple answers")}
            <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 ${multi ? "justify-end bg-rachat-red" : "justify-start bg-neutral-700"}`}>
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
          </button>

          {err && <p role="alert" className="break-words text-xs text-rachat-coral">{err}</p>}
        </div>

        <div className="border-t border-rachat-maroon/40 px-4 py-3">
          <button
            onClick={() => void send()}
            disabled={!ready || busy}
            className="w-full rounded-xl bg-rachat-red py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
          >
            {busy ? t("بيتبعت…", "Sending…") : t("ابعت الاستطلاع", "Send poll")}
          </button>
        </div>
      </div>
    </div>
  );
}
