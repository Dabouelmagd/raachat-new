import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Languages, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { ThreadAvatar } from "../components/ThreadAvatar";
import { TranslateSheet } from "../components/Translate";
import { useTranslate } from "../store/translate";
import { useAppState } from "../store/AppContext";
import { refreshCalls } from "../store/calls";
import { getSocket, type SocketLike } from "../api/socket";
import { getIceServers, getLocalMedia } from "../rtc/ice";
import { playSound, startRingtone, stopRingtone } from "../sound/sounds";
import { num, useT } from "../i18n";

type Phase = "ringing" | "connecting" | "connected" | "ended";
type Sig = { type: "offer" | "answer"; sdp: string } | { candidate: RTCIceCandidateInit };

/**
 * مكالمة حقيقية 1:1 عبر WebRTC. السيرفر بيعمل signaling بس (call:invite/answer/signal/end)،
 * والصوت/الفيديو بيمشي P2P أو عبر TURN. المتصل هو اللي بيبعت الـ offer بعد ما الطرف التاني يقبل.
 */
export default function LiveCall() {
  const t = useT();
  const { id: threadId = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { threads } = useAppState();
  const thread = threads.find((x) => x.id === threadId);
  const mode = params.get("mode") === "video" ? "video" : "voice";
  const incomingId = params.get("callId"); // موجود = أنا المتلقي

  const [phase, setPhase] = useState<Phase>("ringing");
  const [note, setNote] = useState("");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(mode === "video");
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [showTr, setShowTr] = useState(false);
  const tset = useTranslate();
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const ctl = useRef<{ started: boolean; tear?: number; end?: (sendEnd: boolean, p: Phase, msg?: string) => void }>({ started: false });
  const local = useRef<MediaStream | null>(null);
  const phaseRef = useRef<Phase>("ringing");
  phaseRef.current = phase;

  useEffect(() => {
    const c = ctl.current;
    if (c.tear) { clearTimeout(c.tear); c.tear = undefined; } // إعادة mount من StrictMode: كمّل نفس المكالمة
    if (!c.started) { c.started = true; void start(); }
    return () => { c.tear = window.setTimeout(() => { c.end?.(true, "ended"); c.started = false; }, 0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    const sock = getSocket() as SocketLike | null;
    let pc: RTCPeerConnection | null = null;
    let callId = incomingId ?? "";
    let done = false;
    const queue: RTCIceCandidateInit[] = [];
    const finish = (sendEnd: boolean, p: Phase, msg?: string) => {
      if (done) return; done = true;
      if (sendEnd && callId) sock?.emit("call:end", { callId });
      sock?.off("call:signal", onSignal); sock?.off("call:accepted", onAccepted); sock?.off("call:ended", onEnded);
      pc?.close(); local.current?.getTracks().forEach((x) => x.stop()); local.current = null;
      stopRingtone();
      if (msg) setNote(msg);
      setPhase(p);
      if (p === "ended") { playSound("end"); void refreshCalls(); setTimeout(() => nav(-1), 1400); }
    };
    ctl.current.end = finish;

    const flush = async () => { for (const c of queue.splice(0)) await pc?.addIceCandidate(c).catch(() => {}); };
    async function onSignal(m: { callId: string; data: Sig }) {
      if (m.callId !== callId || !pc) return;
      try {
        if ("candidate" in m.data) { if (pc.remoteDescription) await pc.addIceCandidate(m.data.candidate).catch(() => {}); else queue.push(m.data.candidate); }
        else if (m.data.type === "offer") {
          await pc.setRemoteDescription(m.data); await flush();
          await pc.setLocalDescription(await pc.createAnswer());
          sock?.emit("call:signal", { callId, data: { type: "answer", sdp: pc.localDescription!.sdp } });
        } else { await pc.setRemoteDescription(m.data); await flush(); }
      } catch { /* إشارة تالفة */ }
    }
    async function onAccepted(m: { callId: string }) {
      if (m.callId !== callId || !pc) return;
      stopRingtone(); setPhase("connecting");
      await pc.setLocalDescription(await pc.createOffer());
      sock?.emit("call:signal", { callId, data: { type: "offer", sdp: pc.localDescription!.sdp } });
    }
    function onEnded(m: { callId: string; reason: string }) {
      if (m.callId !== callId) return;
      const msg = m.reason === "rejected" ? t("أُغلِقت المكالمة", "Call declined") : m.reason === "missed" ? t("لا يوجد ردّ", "No answer") : m.reason === "dropped" ? t("انقطع الاتصال", "Connection lost") : "";
      finish(false, "ended", msg);
    }

    if (!sock) return finish(false, "ended", t("لا يوجد اتصال بالخادم", "Not connected to the server"));
    const media = await getLocalMedia(mode === "video");
    if ("error" in media) return finish(false, "ended", media.error === "denied" ? t("نحتاج إذن الميكروفون", "Microphone permission is needed") : media.error === "none" ? t("لا يوجد ميكروفون على الجهاز", "No microphone found") : t("تعذّر تشغيل الميكروفون", "Couldn't start the microphone"));
    local.current = media.stream;
    if (!media.videoOk) setCamOn(false);
    if (localVideo.current) localVideo.current.srcObject = media.stream;

    pc = new RTCPeerConnection({ iceServers: await getIceServers() });
    media.stream.getTracks().forEach((tr) => pc!.addTrack(tr, media.stream));
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (remoteAudio.current) { remoteAudio.current.srcObject = stream; void remoteAudio.current.play().catch(() => {}); }
      if (e.track.kind === "video") { setHasRemoteVideo(true); if (remoteVideo.current) remoteVideo.current.srcObject = stream; }
    };
    pc.onicecandidate = (e) => { if (e.candidate && callId) sock.emit("call:signal", { callId, data: { candidate: e.candidate.toJSON() } }); };
    pc.onconnectionstatechange = () => {
      const s = pc!.connectionState;
      if (s === "connected") { setPhase("connected"); stopRingtone(); }
      if (s === "failed") finish(true, "ended", t("تعذّر الاتصال (الشبكة)", "Couldn't connect (network)"));
    };
    sock.on("call:signal", onSignal); sock.on("call:accepted", onAccepted); sock.on("call:ended", onEnded);

    if (incomingId) {
      setPhase("connecting");
      sock.emit("call:answer", { callId: incomingId, accept: true }, (r: { error?: string }) => { if (r?.error) finish(false, "ended", t("انتهت المكالمة", "The call has ended")); });
    } else {
      startRingtone();
      sock.emit("call:invite", { threadId, mode }, (r: { callId?: string; error?: string }) => {
        if (!r?.callId) {
          const e = r?.error;
          return finish(false, "ended", e === "offline" ? t("الطرف الآخر غير متصل الآن", "They're offline right now") : e === "busy" ? t("الخط مشغول", "Line is busy") : t("تعذّر بدء المكالمة", "Couldn't start the call"));
        }
        callId = r.callId;
      });
    }
  }

  useEffect(() => {
    if (phase !== "connected") return;
    const i = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [phase]);

  const toggleMic = () => { const m = !muted; setMuted(m); local.current?.getAudioTracks().forEach((x) => (x.enabled = !m)); };
  const toggleCam = () => { const on = !camOn; setCamOn(on); local.current?.getVideoTracks().forEach((x) => (x.enabled = on)); };

  const mm = num(String(Math.floor(secs / 60)).padStart(2, "0"));
  const ss = num(String(secs % 60).padStart(2, "0"));
  const status = phase === "ringing" ? t("جارٍ الاتصال...", "Calling...") : phase === "connecting" ? t("جارٍ التوصيل...", "Connecting...") : phase === "ended" ? `${note || t("انتهت المكالمة", "Call ended")}${secs ? ` · ${mm}:${ss}` : ""}` : `${mm}:${ss}`;
  const showRemote = mode === "video" && hasRemoteVideo && phase === "connected";

  return (
    <div data-rc-theme="dark" data-rtc-phase={phase} className="text-rachat-papyrus relative flex h-full flex-col items-center overflow-hidden bg-gradient-to-b from-[#2a1512] to-rachat-black px-6 pb-10 pt-16">
      <audio ref={remoteAudio} autoPlay />
      <video ref={remoteVideo} autoPlay playsInline data-testid="remote-video" className={`absolute inset-0 h-full w-full object-cover ${showRemote ? "" : "hidden"}`} />
      <div className="relative z-10 flex flex-1 flex-col items-center gap-4">
        {!showRemote && <ThreadAvatar thread={thread ?? { initial: "?", colorClass: "bg-rachat-red" }} className={`h-28 w-28 text-4xl !text-white ${phase === "ringing" ? "animate-pulse" : ""}`} />}
        <h1 className="rounded-lg bg-black/30 px-3 py-0.5 text-2xl font-extrabold">{thread?.name ?? t("مكالمة", "Call")}</h1>
        <p className="rounded bg-black/30 px-2 text-sm text-neutral-300" dir="ltr">{status}</p>
      </div>

      {tset.on && phase === "connected" && (
        <p className="relative z-10 mb-3 max-w-sm rounded-xl bg-black/50 px-3 py-2 text-center text-[11px] text-rachat-gold">
          <Languages size={12} className="me-1 inline" />
          {t("الترجمة الفورية للمكالمات الحقيقية تحتاج تحويل الكلام إلى نصّ (غير موصولة بعد) — والترجمة تعمل في المحادثات.", "Live translation on real calls needs speech-to-text (not connected yet) — translation works in chat.")}
        </p>
      )}
      {showTr && <TranslateSheet call onClose={() => setShowTr(false)} />}

      {mode === "video" && phase !== "ended" && (
        <video ref={localVideo} autoPlay playsInline muted data-testid="local-video" className={`absolute top-4 end-4 z-10 h-32 w-24 -scale-x-100 rounded-xl bg-rachat-card object-cover ring-1 ring-rachat-maroon ${camOn ? "" : "opacity-30"}`} />
      )}

      <div className="relative z-10 flex items-start justify-center gap-4">
        <button onClick={toggleMic} aria-label={t("ميكروفون", "Mic")} className="flex flex-col items-center gap-1.5 text-[11px] text-neutral-300">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${muted ? "bg-rachat-cream text-rachat-ink" : "bg-white/10 text-white"}`}>{muted ? <MicOff size={22} /> : <Mic size={22} />}</span>
          {muted ? t("كتم", "Muted") : t("ميكروفون", "Mic")}
        </button>
        <button onClick={() => setShowTr(true)} className="flex flex-col items-center gap-1.5 text-[11px] text-neutral-300">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${tset.on ? "bg-rachat-cream text-rachat-ink" : "bg-white/10 text-white"}`}><Languages size={22} /></span>
          {t("ترجمة", "Translate")}
        </button>
        {mode === "video" && (
          <button onClick={toggleCam} aria-label={t("كاميرا", "Camera")} className="flex flex-col items-center gap-1.5 text-[11px] text-neutral-300">
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${camOn ? "bg-white/10 text-white" : "bg-rachat-cream text-rachat-ink"}`}>{camOn ? <Video size={22} /> : <VideoOff size={22} />}</span>
            {t("كاميرا", "Camera")}
          </button>
        )}
        <button onClick={() => ctl.current.end?.(true, "ended")} aria-label={t("إنهاء", "End")} className="flex flex-col items-center gap-1.5 text-[11px] text-neutral-300">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rachat-red text-white"><PhoneOff size={22} /></span>
          {t("إنهاء", "End")}
        </button>
      </div>
    </div>
  );
}
