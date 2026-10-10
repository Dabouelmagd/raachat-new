import { useEffect, useRef, useState } from "react";
import { Download, FileText, Pause, Play, X, Mic } from "lucide-react";
import type { Attachment } from "../types";
import { fmtDur, fmtSize, kindOf, labelOf } from "../media/files";
import { useT } from "../i18n";

/** مشغّل الرسالة الصوتية: زرار تشغيل + موجة + المدة */
export function VoicePlayer({ a, isMe }: { a: Attachment; isMe: boolean }) {
  const t = useT();
  const v = a.voice!;
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { audio.current?.pause(); if (timer.current) clearInterval(timer.current); }, []);

  const stop = () => { setPlaying(false); if (timer.current) clearInterval(timer.current); timer.current = null; };
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) { audio.current?.pause(); stop(); return; }
    if (v.simulated || !a.url) {
      // وضع تجريبي: من غير صوت، الموجة بس بتتحرك
      const t0 = Date.now() - pos * 1000;
      setPlaying(true);
      timer.current = setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        if (s >= v.duration) { stop(); setPos(0); } else setPos(s);
      }, 100);
      return;
    }
    if (!audio.current) {
      audio.current = new Audio(a.url);
      audio.current.ontimeupdate = () => setPos(audio.current!.currentTime);
      audio.current.onended = () => { stop(); setPos(0); };
    }
    void audio.current.play().then(() => setPlaying(true)).catch(() => stop());
  };

  const done = Math.round((pos / v.duration) * v.waveform.length);
  return (
    <div className="flex min-w-[200px] items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={toggle}
        aria-label={playing ? t("إيقاف مؤقت", "Pause") : t("تشغيل الرسالة الصوتية", "Play voice message")}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isMe ? "bg-white/25 text-white" : "bg-rachat-red text-white"}`}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[2px]" dir="ltr" aria-hidden>
        {v.waveform.map((h, i) => (
          <span key={i} className={`w-[3px] rounded-full ${i < done ? (isMe ? "bg-white" : "bg-rachat-red") : isMe ? "bg-white/40" : "bg-black/25"}`} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </div>
      <span dir="ltr" className="shrink-0 text-[11px] tabular-nums opacity-80">{fmtDur(playing || pos > 0 ? pos : v.duration)}</span>
    </div>
  );
}

/** معاينة داخل الفقاعة. الضغط على الصورة/الملف يفتح العارض الكامل. */
export function InlinePreview({ a, isMe, onOpen }: { a: Attachment; isMe: boolean; onOpen: () => void }) {
  const k = kindOf(a);
  const card = isMe ? "bg-white/15" : "bg-black/10";
  if (a.voice) return <VoicePlayer a={a} isMe={isMe} />;
  if (k === "image")
    return (
      <button onClick={(e) => { e.stopPropagation(); onOpen(); }} className="block w-full">
        <img src={a.url} alt={a.name} className="max-h-60 w-full rounded-xl object-cover" />
      </button>
    );
  if (k === "video")
    return <video src={a.url} controls preload="metadata" onClick={(e) => e.stopPropagation()} className="max-h-60 w-full rounded-xl bg-black" />;
  if (k === "audio")
    return <audio src={a.url} controls preload="metadata" onClick={(e) => e.stopPropagation()} className="w-full max-w-[240px]" />;
  return (
    <button onClick={(e) => { e.stopPropagation(); onOpen(); }} className={`block w-full rounded-xl p-2.5 text-start ${card}`}>
      <span className="flex items-center gap-2.5">
        <FileText size={22} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold">{a.name}</span>
          <span dir="ltr" className="block text-start text-[10.5px] opacity-75">{labelOf(a)} · {fmtSize(a.size)}</span>
        </span>
      </span>
      {k === "text" && a.text && (
        <span dir="auto" className="mt-2 line-clamp-4 block whitespace-pre-wrap break-words rounded-lg bg-black/20 p-2 font-mono text-[11px] leading-4 opacity-90">{a.text.slice(0, 280)}</span>
      )}
    </button>
  );
}

/** عارض كامل الشاشة لأي ملف */
export function FileViewer({ a, onClose }: { a: Attachment; onClose: () => void }) {
  const t = useT();
  const k = kindOf(a);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={a.name} onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label={t("إغلاق", "Close")}><X size={22} /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{a.name}</div>
          <div dir="ltr" className="text-start text-[11px] text-white/60">{labelOf(a)} · {fmtSize(a.size)}</div>
        </div>
        <a href={a.url} download={a.name} aria-label={t("تنزيل", "Download")} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold">
          <Download size={15} /> {t("تنزيل", "Download")}
        </a>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        {k === "image" && <img src={a.url} alt={a.name} className="max-h-full max-w-full rounded-lg object-contain" />}
        {k === "video" && <video src={a.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />}
        {k === "audio" && <audio src={a.url} controls autoPlay className="w-full max-w-sm" />}
        {k === "pdf" && (
          <div className="flex h-full w-full max-w-3xl flex-col gap-2">
            <iframe title={a.name} src={a.url} className="min-h-0 w-full flex-1 rounded-lg bg-white" />
            <p className="text-center text-[11px] text-white/50">{t("لو المعاينة مش ظاهرة، نزّلي الملف وافتحيه من جهازك.", "If the preview doesn't show, download the file and open it on your device.")}</p>
          </div>
        )}
        {k === "text" && (
          <pre dir="auto" className="h-full w-full max-w-3xl overflow-auto whitespace-pre-wrap break-words rounded-lg bg-rachat-card p-4 font-mono text-xs leading-5 text-rachat-papyrus">{a.text ?? t("مفيش معاينة للنص", "No text preview")}</pre>
        )}
        {k === "other" && (
          <div className="flex flex-col items-center gap-3 text-center text-white">
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10"><FileText size={38} /></span>
            <div className="text-sm font-bold">{labelOf(a)}</div>
            <p className="max-w-xs text-xs text-white/60">{t("المتصفح مش بيعرض النوع ده. نزّلي الملف وافتحيه ببرنامجه.", "Browsers can't display this type. Download it and open it with its app.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** معاينة صغيرة قبل الإرسال */
export function PendingThumb({ a }: { a: Attachment }) {
  const k = kindOf(a);
  if (a.voice) return <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-rachat-maroon/50 text-rachat-red"><Mic size={22} /></span>;
  if (k === "image") return <img src={a.url} alt="" className="h-12 w-12 rounded-lg object-cover" />;
  if (k === "video") return <video src={a.url} muted preload="metadata" className="h-12 w-12 rounded-lg bg-black object-cover" />;
  return <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-rachat-maroon/50 text-rachat-red"><FileText size={22} /></span>;
}
