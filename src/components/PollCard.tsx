import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { useAppActions, useAppState } from "../store/AppContext";
import { useT, num as n } from "../i18n";
import type { Message } from "../types";

/**
 * الاستطلاع جوه فقاعة الرسالة: السؤال، والاختيارات كأشرطة بالنسبة المئوية،
 * وصوتي عليه علامة ✓.
 *
 * **الأصوات مش مجهولة** — اللي في المحادثة يقدر يفتح «مين صوّت» ويشوف الأسماء
 * (زي واتساب)، والقرار ده بيبان للمستخدم من الزرار نفسه مش مخفي.
 *
 * التصويت بيتفاءل في الواجهة وبيستنى رد السيرفر: لو رفض (الاستطلاع اتقفل ·
 * الجروب متقيّد · مفيش نت) بيظهر سبب الرفض ومابنسيبش الشكل يكدب على المستخدم.
 */
export function PollCard({ message, isMe }: { message: Message; isMe: boolean }) {
  const t = useT();
  const { contacts } = useAppState();
  const { votePoll, closePoll } = useAppActions();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const poll = message.poll!;

  const mine = poll.options.filter((o) => o.voterIds.includes("me")).map((o) => o.id);
  // عدد **الناس** اللي صوّتوا، مش عدد الأصوات (في المتعدد الواحد بيصوّت أكتر من مرة)
  const voters = new Set(poll.options.flatMap((o) => o.voterIds));
  const maxVotes = Math.max(1, ...poll.options.map((o) => o.voterIds.length));
  const nameOf = (id: string) => (id === "me" ? t("أنت", "You") : contacts.find((c) => c.id === id)?.name ?? t("مستخدم", "User"));

  const pick = async (optionId: string) => {
    if (poll.closed || busy) return;
    const next = poll.multi
      ? (mine.includes(optionId) ? mine.filter((x) => x !== optionId) : [...mine, optionId])
      : (mine.includes(optionId) ? [] : [optionId]);
    setErr("");
    setBusy(true);
    try {
      await votePoll(message.id, next);
    } catch (e) {
      setErr((e as Error).message || t("الصوت ما اتسجّلش، حاول تاني", "Vote not saved, try again"));
    }
    setBusy(false);
  };

  const close = async () => {
    setErr("");
    try {
      await closePoll(message.id);
    } catch (e) {
      setErr((e as Error).message || t("القفل ما نجحش", "Could not close"));
    }
  };

  return (
    <div className="w-full min-w-0 space-y-2">
      <p className="break-words text-sm font-extrabold" dir="auto">{poll.question}</p>
      <p className="text-[10px] font-bold opacity-70">
        {poll.multi ? t("أكتر من إجابة مسموحة", "Multiple answers") : t("إجابة واحدة", "One answer")}
        {poll.closed && <span className="ms-1">· {t("اتقفل", "Closed")}</span>}
      </p>

      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const count = o.voterIds.length;
          const pct = voters.size ? Math.round((count / voters.size) * 100) : 0;
          const picked = mine.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => void pick(o.id)}
              disabled={poll.closed}
              aria-pressed={picked}
              aria-label={o.text}
              className={`relative w-full overflow-hidden rounded-xl border px-2.5 py-2 text-start ${picked ? "border-rachat-gold" : "border-white/15"} ${poll.closed ? "opacity-80" : ""}`}
            >
              {/* الشريط بالنسبة لأكبر اختيار عشان الفرق يبان */}
              <span aria-hidden className="absolute inset-y-0 start-0 bg-white/10" style={{ width: `${(count / maxVotes) * 100}%` }} />
              <span className="relative flex items-center gap-2">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${picked ? "border-rachat-gold bg-rachat-gold text-rachat-ink" : "border-white/40"}`}>
                  {picked && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 break-words text-xs font-bold" dir="auto">{o.text}</span>
                <span className="shrink-0 text-[11px] font-extrabold tabular-nums">{n(pct)}%</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold opacity-70">
        <span>{voters.size === 0 ? t("محدش صوّت لسه", "No votes yet") : t(`${n(voters.size)} صوّتوا`, `${voters.size} voted`)}</span>
        {voters.size > 0 && (
          <button onClick={() => setShowVoters((v) => !v)} aria-expanded={showVoters} className="underline">
            {showVoters ? t("إخفاء الأصوات", "Hide votes") : t("مين صوّت", "See votes")}
          </button>
        )}
        {isMe && !poll.closed && (
          <button onClick={() => void close()} className="flex items-center gap-1 underline">
            <Lock size={10} /> {t("اقفل الاستطلاع", "Close poll")}
          </button>
        )}
      </div>

      {showVoters && (
        <ul className="space-y-1 border-t border-white/15 pt-1.5 text-[11px]">
          {poll.options.filter((o) => o.voterIds.length > 0).map((o) => (
            <li key={o.id} className="break-words" dir="auto">
              <span className="font-extrabold">{o.text}:</span> {o.voterIds.map(nameOf).join("، ")}
            </li>
          ))}
        </ul>
      )}

      {err && <p role="alert" className="break-words text-[11px] text-rachat-coral">{err}</p>}
    </div>
  );
}
