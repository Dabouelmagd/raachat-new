import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, RotateCcw, Video, X } from "lucide-react";
import { useT } from "../i18n";
import { CAM_FILTERS, drawFilter } from "../media/camFilters";
import { fmtDur } from "../media/files";

const MAX_SECS = 60;
const W = 480, H = 640;

function pickMime(): string {
  const c = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return c.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

/** كاميرا بفلاتر: صورة أو فيديو لحد دقيقة، والفلتر بيتسجّل جوّه الملف. */
export function CameraSheet({ onClose, onDone }: { onClose: () => void; onDone: (f: File) => void }) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const filterRef = useRef(CAM_FILTERS[1]);
  const mirrorRef = useRef(true);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number>(0);
  const [mode, setMode] = useState<"photo" | "video">("video");
  const [fid, setFid] = useState(CAM_FILTERS[1].id);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [err, setErr] = useState("");
  const [secs, setSecs] = useState(0);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => { filterRef.current = CAM_FILTERS.find((f) => f.id === fid)!; }, [fid]);
  useEffect(() => { mirrorRef.current = facing === "user"; }, [facing]);

  // تشغيل الكاميرا
  useEffect(() => {
    let dead = false;
    streamRef.current?.getTracks().forEach((x) => x.stop());
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 1280 } }, audio: true });
        if (dead) { s.getTracks().forEach((x) => x.stop()); return; }
        streamRef.current = s;
        const v = videoRef.current!;
        v.srcObject = s; v.muted = true; await v.play();
        setErr("");
      } catch {
        setErr(t("مقدرناش نفتح الكاميرا أو الميكروفون. اسمحي بالإذن من إعدادات الجهاز وجرّبي تاني.", "Couldn't open the camera or microphone. Allow access in your device settings and try again."));
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // حلقة الرسم
  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      const v = videoRef.current, c = canvasRef.current;
      if (v && c && v.readyState >= 2) drawFilter(c.getContext("2d")!, v, filterRef.current, W, H, mirrorRef.current, ts);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => {
    window.clearInterval(timer.current);
    if (recRef.current && recRef.current.state !== "inactive") { recRef.current.onstop = null; recRef.current.stop(); }
    streamRef.current?.getTracks().forEach((x) => x.stop());
  }, []);

  const photo = () => {
    canvasRef.current?.toBlob((b) => {
      if (!b) return;
      const f = new File([b], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setResult({ file: f, url: URL.createObjectURL(f) });
    }, "image/jpeg", 0.88);
  };

  const stop = useCallback(() => { window.clearInterval(timer.current); if (recRef.current?.state === "recording") recRef.current.stop(); setRecording(false); }, []);

  const start = () => {
    const c = canvasRef.current, s = streamRef.current;
    if (!c || !s || typeof MediaRecorder === "undefined") { setErr(t("التسجيل مش مدعوم على المتصفح ده.", "Recording isn't supported in this browser.")); return; }
    const out = (c as HTMLCanvasElement).captureStream(30);
    s.getAudioTracks().forEach((a) => out.addTrack(a));
    const mime = pickMime();
    const rec = new MediaRecorder(out, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mime || "video/webm";
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const f = new File(chunks.current, `video-${Date.now()}.${ext}`, { type: type.split(";")[0] });
      setResult({ file: f, url: URL.createObjectURL(f) });
    };
    rec.start(250);
    recRef.current = rec; setSecs(0); setRecording(true);
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      setSecs(sec);
      if (sec >= MAX_SECS) stop();
    }, 250);
  };

  const shutter = () => (mode === "photo" ? photo() : recording ? stop() : start());
  const tooBig = result && result.file.size > 10 * 1024 * 1024;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("كاميرا بالفلاتر", "Camera with filters")} className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} aria-label={t("إغلاق", "Close")}><X size={22} /></button>
        {recording && <span dir="ltr" className="rounded-full bg-rachat-red px-3 py-0.5 text-xs font-bold tabular-nums">● {fmtDur(secs)} / 1:00</span>}
        {!result && <button onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} disabled={recording} aria-label={t("قلب الكاميرا", "Flip camera")} className="disabled:opacity-40"><RefreshCw size={20} /></button>}
      </div>

      <div className="relative mx-auto flex min-h-0 w-full max-w-[420px] flex-1 items-center justify-center">
        <video ref={videoRef} playsInline muted className="hidden" />
        {result ? (
          result.file.type.startsWith("video") ? <video src={result.url} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-xl" /> : <img src={result.url} alt="" className="max-h-full max-w-full rounded-xl" />
        ) : (
          <canvas ref={canvasRef} width={W} height={H} className="max-h-full max-w-full rounded-xl bg-neutral-900" />
        )}
        {err && <p role="alert" className="absolute inset-x-6 top-1/3 rounded-xl bg-black/80 p-4 text-center text-sm text-white">{err}</p>}
      </div>

      {result ? (
        <div className="flex flex-col items-center gap-2 px-4 py-4">
          {tooBig && <p role="alert" className="text-xs text-rachat-coral">{t("الفيديو أكبر من ١٠ ميجا، سجّلي مدة أقصر.", "Video is over 10 MB, record a shorter clip.")}</p>}
          <div className="flex gap-3">
            <button onClick={() => { URL.revokeObjectURL(result.url); setResult(null); }} className="flex items-center gap-1.5 rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold text-white"><RotateCcw size={16} />{t("إعادة", "Retake")}</button>
            <button disabled={!!tooBig} onClick={() => onDone(result.file)} className="flex items-center gap-1.5 rounded-full bg-rachat-gold px-6 py-2.5 text-sm font-extrabold text-rachat-ink disabled:opacity-40"><Check size={16} />{t("استخدام", "Use")}</button>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-4">
          <div role="listbox" aria-label={t("الفلاتر", "Filters")} className="mb-3 flex gap-2.5 overflow-x-auto py-1">
            {CAM_FILTERS.map((f) => (
              <button key={f.id} role="option" aria-selected={fid === f.id} onClick={() => setFid(f.id)} className="flex shrink-0 flex-col items-center gap-1">
                <span className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${fid === f.id ? "bg-rachat-gold ring-2 ring-white" : "bg-white/15"}`}>{f.emoji}</span>
                <span className={`text-[10.5px] font-bold ${fid === f.id ? "text-rachat-gold" : "text-white/70"}`}>{t(f.ar, f.en)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-6">
            <div className="flex rounded-full bg-white/15 p-0.5 text-xs font-bold">
              <button disabled={recording} onClick={() => setMode("photo")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${mode === "photo" ? "bg-white text-black" : "text-white"}`}><Camera size={13} />{t("صورة", "Photo")}</button>
              <button disabled={recording} onClick={() => setMode("video")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${mode === "video" ? "bg-white text-black" : "text-white"}`}><Video size={13} />{t("فيديو", "Video")}</button>
            </div>
            <button onClick={shutter} disabled={!!err} aria-label={mode === "photo" ? t("التقاط", "Capture") : recording ? t("إيقاف", "Stop") : t("بدء التسجيل", "Start recording")} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white disabled:opacity-40">
              <span className={`block bg-rachat-red transition-all ${mode === "video" && recording ? "h-6 w-6 rounded-md" : "h-12 w-12 rounded-full"}`} />
            </button>
            <span className="w-[98px] text-center text-[10px] text-white/60">{mode === "video" ? t("حتى دقيقة", "Up to 1 min") : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
