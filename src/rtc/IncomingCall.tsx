import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../api/socket";
import { refreshCalls } from "../store/calls";
import { startRingtone, stopRingtone } from "../sound/sounds";
import { useT } from "../i18n";

interface Incoming { callId: string; threadId: string; mode: "voice" | "video"; fromName: string }

/** مكالمة واردة (وضع الباك إند): نافذة رنين فوق أي شاشة */
export function IncomingCall() {
  const t = useT();
  const sock = useSocket();
  const nav = useNavigate();
  const [inc, setInc] = useState<Incoming | null>(null);

  useEffect(() => {
    if (!sock) return;
    const onIn = (c: Incoming) => setInc(c);
    const onEnd = (e: { callId: string }) => { setInc((cur) => (cur && cur.callId === e.callId ? null : cur)); setTimeout(() => void refreshCalls(), 600); };
    // فتحنا التطبيق من إشعار Push والمكالمة لسه بترن؟ اسألي السيرفر (وعند كل إعادة اتصال)
    const pending = () => sock.emit("call:pending", {}, (r: { call: Incoming | null }) => { if (r?.call) setInc(r.call); });
    pending();
    sock.on("connect", pending);
    sock.on("call:incoming", onIn);
    sock.on("call:ended", onEnd);
    return () => { sock.off("connect", pending); sock.off("call:incoming", onIn); sock.off("call:ended", onEnd); };
  }, [sock]);

  useEffect(() => {
    if (!inc) return;
    startRingtone();
    return () => stopRingtone();
  }, [inc]);

  if (!inc) return null;
  const reject = () => { sock?.emit("call:answer", { callId: inc.callId, accept: false }); setInc(null); };
  const accept = () => { const c = inc; setInc(null); nav(`/call/${c.threadId}?mode=${c.mode}&callId=${c.callId}`); };
  return (
    <div role="alertdialog" aria-label={t("مكالمة واردة", "Incoming call")} className="fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-[420px] items-center gap-3 rounded-b-3xl bg-rachat-card px-4 pb-4 pt-5 shadow-2xl ring-1 ring-rachat-maroon">
      <span className="flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-full bg-rachat-red/25 text-rachat-red">
        {inc.mode === "video" ? <Video size={22} /> : <Phone size={22} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-extrabold">{inc.fromName || t("مكالمة", "Call")}</div>
        <div className="text-xs text-neutral-400">{inc.mode === "video" ? t("مكالمة فيديو واردة", "Incoming video call") : t("مكالمة صوتية واردة", "Incoming voice call")}</div>
      </div>
      <button onClick={reject} aria-label={t("رفض", "Decline")} className="flex h-11 w-11 items-center justify-center rounded-full bg-rachat-red text-white"><PhoneOff size={20} /></button>
      <button onClick={accept} aria-label={t("رد", "Answer")} className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white"><Phone size={20} /></button>
    </div>
  );
}
