/**
 * تسجيل الرسائل الصوتية.
 * بيستخدم الميكروفون الحقيقي (MediaRecorder) لو المتصفح سمح. لو لأ (زي المعاينة المدمجة اللي بتمنع الميكروفون)
 * بيشتغل بوضع تجريبي: عدّاد وموجة صوتية من غير صوت فعلي، وبيتعلّم simulated=true.
 */
export interface Recorded {
  url: string; // blob صوتي، أو "" في الوضع التجريبي
  duration: number; // ثواني
  waveform: number[]; // 0..1
  mime: string;
  simulated: boolean;
}

export interface Recorder {
  simulated: boolean;
  stop: () => Promise<Recorded>;
  cancel: () => void;
  onLevel: (cb: (levels: number[], seconds: number) => void) => void;
}

const BARS = 36;
const compress = (levels: number[]): number[] => {
  if (!levels.length) return Array(BARS).fill(0.2);
  return Array.from({ length: BARS }, (_, i) => {
    const a = Math.floor((i * levels.length) / BARS);
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / BARS));
    const seg = levels.slice(a, b);
    return Math.max(0.12, Math.min(1, Math.max(...seg)));
  });
};

export async function startRecording(): Promise<Recorder> {
  const t0 = Date.now();
  const levels: number[] = [];
  let cb: ((l: number[], s: number) => void) | null = null;
  const emit = () => cb?.(levels.slice(-BARS), (Date.now() - t0) / 1000);

  let stream: MediaStream | null = null;
  try {
    if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined") {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  } catch {
    stream = null;
  }

  if (!stream) {
    const timer = setInterval(() => { levels.push(0.2 + Math.random() * 0.8); emit(); }, 120);
    return {
      simulated: true,
      onLevel: (f) => (cb = f),
      cancel: () => clearInterval(timer),
      stop: async () => {
        clearInterval(timer);
        return { url: "", duration: Math.max(1, Math.round((Date.now() - t0) / 1000)), waveform: compress(levels), mime: "audio/simulated", simulated: true };
      },
    };
  }

  const rec = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();

  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new AC();
  const an = ac.createAnalyser();
  an.fftSize = 256;
  ac.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.frequencyBinCount);
  const timer = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    levels.push(Math.min(1, peak / 64));
    emit();
  }, 100);

  const cleanup = () => {
    clearInterval(timer);
    stream!.getTracks().forEach((tr) => tr.stop());
    void ac.close();
  };
  return {
    simulated: false,
    onLevel: (f) => (cb = f),
    cancel: () => { cleanup(); try { rec.stop(); } catch { /* تجاهل */ } },
    stop: () =>
      new Promise<Recorded>((resolve) => {
        rec.onstop = () => {
          cleanup();
          const mime = rec.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type: mime });
          resolve({ url: URL.createObjectURL(blob), duration: Math.max(1, Math.round((Date.now() - t0) / 1000)), waveform: compress(levels), mime, simulated: false });
        };
        rec.stop();
      }),
  };
}
