import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed } from "lucide-react";
import { Header } from "../components/Header";
import { ThreadAvatar } from "../components/ThreadAvatar";
import { useAppState } from "../store/AppContext";
import { useCalls } from "../store/calls";
import { useT, num, loc } from "../i18n";

/** سجل المكالمات — مع الباك إند: GET /calls */
export default function CallsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const { threads } = useAppState();
  const calls = useCalls();
  const [tab, setTab] = useState<"all" | "missed">("all");
  const list = calls.filter((c) => tab === "all" || c.dir === "missed");

  const when = (at: number) => {
    const d = new Date(at);
    const days = Math.floor((Date.now() - at) / 86400000);
    const time = new Intl.DateTimeFormat(loc(), { hour: "numeric", minute: "2-digit" }).format(d);
    if (days < 1 && d.getDate() === new Date().getDate()) return `${t("اليوم", "Today")} ${time}`;
    if (days < 2) return `${t("أمس", "Yesterday")} ${time}`;
    return new Intl.DateTimeFormat(loc(), { day: "numeric", month: "short" }).format(d) + " " + time;
  };
  const dur = (s: number) => (s <= 0 ? "" : ` · ${num(Math.floor(s / 60))}:${num(String(s % 60).padStart(2, "0"))}`);

  return (
    <div className="flex h-full flex-col">
      <Header title={t("المكالمات", "Calls")} showBack />
      <div role="tablist" className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-xl bg-rachat-card p-1">
        {(["all", "missed"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-lg py-2 text-xs font-bold ${tab === k ? "bg-rachat-red text-white" : "text-neutral-400"}`}>
            {k === "all" ? t("الكل", "All") : t("الفائتة", "Missed")}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {list.length === 0 && <p className="py-10 text-center text-xs text-neutral-500">{t("لا توجد مكالمات", "No calls")}</p>}
        {list.map((c) => {
          const th = threads.find((x) => x.id === c.threadId);
          if (!th) return null;
          const Dir = c.dir === "in" ? PhoneIncoming : c.dir === "out" ? PhoneOutgoing : PhoneMissed;
          const label = c.dir === "in" ? t("واردة", "Incoming") : c.dir === "out" ? t("صادرة", "Outgoing") : t("فائتة", "Missed");
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-rachat-card p-3">
              <ThreadAvatar thread={th} />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-bold ${c.dir === "missed" ? "text-rachat-coral" : ""}`}>{th.name}</div>
                <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                  <Dir size={12} className={c.dir === "missed" ? "text-rachat-coral" : ""} /> {label} · {when(c.at)}{dur(c.dur)}
                </div>
              </div>
              <button aria-label={t("مكالمة صوتية", "Voice call")} onClick={() => navigate(`/call/${th.id}?mode=voice`)} className="flex h-9 w-9 items-center justify-center rounded-full bg-rachat-black text-rachat-coral"><Phone size={16} /></button>
              <button aria-label={t("مكالمة فيديو", "Video call")} onClick={() => navigate(`/call/${th.id}?mode=video`)} className="flex h-9 w-9 items-center justify-center rounded-full bg-rachat-black text-rachat-coral"><Video size={16} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
