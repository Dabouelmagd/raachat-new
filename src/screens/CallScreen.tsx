import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { TranslateSheet } from "../components/Translate";
import { useTranslate } from "../store/translate";
import { CALL_SCRIPT, PHRASES } from "../translate/phrases";
import { phraseText, TLANG_NAMES, TLANG_SPEECH } from "../translate/engine";
import { logCall } from "../store/calls";
import { ThreadAvatar } from "../components/ThreadAvatar";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Mic, MicOff, Volume2, Video, VideoOff, PhoneOff, SwitchCamera } from "lucide-react";
import { useAppState } from "../store/AppContext";
import { useT, num } from "../i18n";
import { playSound, startRingtone, stopRingtone } from "../sound/sounds";
import { API_ON } from "../api/client";
import LiveCall from "./LiveCall";

/**
 * واجهة مكالمة تجريبية — لا يوجد صوت أو كاميرا حقيقية.
 * عند الربط الحقيقي: استبدل حالة "ringing → connected" باتصال WebRTC (LiveKit/Jitsi حسب الـ PRD).
 */
function DemoCall() {
  const t = useT();
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { threads } = useAppState();
  const thread = threads.find((t) => t.id === id);

  const isVideo = params.get("mode") === "video";
  const [phase, setPhase] = useState<"ringing" | "connected" | "ended">("ringing");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [camOn, setCamOn] = useState(isVideo);
  const tset = useTranslate();
  const [showTr, setShowTr] = useState(false);
  const [lines, setLines] = useState<{ who: "them" | "me"; orig: string; out: string }[]>([]);
  const startedAt = useRef(Date.now());
  const step = useRef(0);

  // ترجمة فورية تجريبية: الطرف التاني بيتكلم بلغته وبتظهر الترجمة (وبتتنطق لو مفعّل)
  useEffect(() => {
    if (phase !== "connected" || !tset.on) return;
    const timer = setInterval(() => {
      const [who, i] = CALL_SCRIPT[step.current % CALL_SCRIPT.length];
      step.current += 1;
      const p = PHRASES[i];
      const from = who === "them" ? tset.peer : tset.mine;
      const to = who === "them" ? tset.mine : tset.peer;
      const line = { who, orig: phraseText(p, from), out: phraseText(p, to) };
      setLines((l) => [...l.slice(-3), line]);
      if (tset.speak && who === "them") {
        try {
          const u = new SpeechSynthesisUtterance(line.out);
          u.lang = TLANG_SPEECH[tset.mine];
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        } catch { /* النطق غير متاح */ }
      }
    }, 3200);
    return () => { clearInterval(timer); try { window.speechSynthesis.cancel(); } catch { /* تجاهل */ } };
  }, [phase, tset.on, tset.peer, tset.mine, tset.speak]);

  useEffect(() => {
    if (phase !== "ringing") return;
    startRingtone();
    const t = setTimeout(() => setPhase("connected"), 2500);
    return () => {
      clearTimeout(t);
      stopRingtone();
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "connected") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "ended") return;
    playSound("end");
    logCall({ threadId: id, mode: isVideo ? "video" : "voice", dir: "out", at: startedAt.current, dur: secs });
    const t = setTimeout(() => navigate(-1), 1200);
    return () => clearTimeout(t);
  }, [phase, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const mm = num(String(Math.floor(secs / 60)).padStart(2, "0"));
  const ss = num(String(secs % 60).padStart(2, "0"));
  const status =
    phase === "ringing" ? t("جارٍ الاتصال...", "Calling...") : phase === "ended" ? `${t("انتهت المكالمة", "Call ended")} · ${mm}:${ss}` : `${mm}:${ss}`;

  const Btn = ({ on, onClick, children, label }: any) => (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 text-[11px] text-neutral-300">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${on ? "bg-rachat-cream text-rachat-ink" : "bg-white/10 text-white"}`}>
        {children}
      </span>
      {label}
    </button>
  );

  return (
    <div data-rc-theme="dark" className="text-rachat-papyrus relative flex h-full flex-col items-center bg-gradient-to-b from-[#2a1512] to-rachat-black px-6 pb-10 pt-16">
      {isVideo && camOn && phase === "connected" && (
        <div className="absolute inset-0 -z-0 bg-gradient-to-br from-rachat-maroon/60 via-rachat-black to-rachat-red/20" />
      )}
      <div className="relative z-10 flex flex-1 flex-col items-center gap-4">
        <ThreadAvatar thread={thread ?? { initial: "?", colorClass: "bg-rachat-red" }} className={`h-28 w-28 text-4xl !text-white ${phase === "ringing" ? "animate-pulse" : ""}`} />
        <h1 className="text-2xl font-extrabold">{thread?.name ?? t("مكالمة", "Call")}</h1>
        <p className="text-sm text-neutral-400" dir="ltr">{status}</p>
        <p className="text-[11px] text-neutral-600">{isVideo ? t("مكالمة فيديو", "Video call") : t("مكالمة صوتية", "Voice call")} · {t("نسخة تجريبية", "Demo version")}</p>
      </div>

      {tset.on && phase === "connected" && (
        <div className="relative z-10 mb-4 w-full max-w-sm space-y-2" aria-live="polite">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-rachat-gold">
            <Languages size={12} /> {t("ترجمة فورية", "Live translation")}: {TLANG_NAMES[tset.peer]} ⇄ {TLANG_NAMES[tset.mine]}
          </p>
          {lines.map((l, i) => (
            <div key={i} className={`rounded-xl px-3 py-2 ${l.who === "me" ? "bg-rachat-red/25 text-end" : "bg-white/10"} ${i < lines.length - 1 ? "opacity-60" : ""}`}>
              <p className="text-[11px] text-neutral-400">{l.who === "me" ? t("أنت", "You") : thread?.name}: {l.orig}</p>
              <p className="text-sm font-bold">{l.out}</p>
            </div>
          ))}
          {lines.length === 0 && <p className="text-center text-xs text-neutral-500">{t("في انتظار الكلام…", "Waiting for speech…")}</p>}
        </div>
      )}

      {showTr && <TranslateSheet call onClose={() => setShowTr(false)} />}

      {isVideo && phase === "connected" && (
        <div className="absolute top-4 end-4 z-10 flex h-32 w-24 items-center justify-center rounded-xl bg-rachat-card text-xs text-neutral-500 ring-1 ring-rachat-maroon">
          {camOn ? t("أنت", "You") : t("الكاميرا مقفولة", "Camera off")}
        </div>
      )}

      <div className="relative z-10 flex items-start justify-center gap-4">
        <Btn on={muted} onClick={() => setMuted(!muted)} label={muted ? t("كتم", "Muted") : t("مايك", "Mic")}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </Btn>
        <Btn on={speaker} onClick={() => setSpeaker(!speaker)} label={t("سماعة", "Speaker")}><Volume2 size={22} /></Btn>
        <Btn on={tset.on} onClick={() => setShowTr(true)} label={t("ترجمة", "Translate")}><Languages size={22} /></Btn>
        {isVideo && (
          <>
            <Btn on={!camOn} onClick={() => setCamOn(!camOn)} label={t("كاميرا", "Camera")}>
              {camOn ? <Video size={22} /> : <VideoOff size={22} />}
            </Btn>
            <Btn onClick={() => {}} label={t("قلب", "Flip")}><SwitchCamera size={22} /></Btn>
          </>
        )}
        <button onClick={() => setPhase("ended")} className="flex flex-col items-center gap-1.5 text-[11px] text-neutral-300">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rachat-red text-white"><PhoneOff size={22} /></span>
          {t("إنهاء", "End")}
        </button>
      </div>
    </div>
  );
}

/** مع الباك إند: مكالمة WebRTC حقيقية؛ من غيره: الديمو التمثيلي */
export default function CallScreen() {
  return API_ON ? <LiveCall /> : <DemoCall />;
}
