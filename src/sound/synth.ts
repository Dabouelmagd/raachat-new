/**
 * أصوات رع شات — تتولّد بالكامل بـ WebAudio (من غير ملفات صوت) على مقام الحجاز (ري)،
 * بآلة وترية (عود/قانون) وطبلة (دُم/تَك) وجلاجل (سيستروم).
 * نفس الكود بيشتغل لايف داخل التطبيق وأوفلاين لتصدير ملفات WAV/MP3.
 */
export type RingId = "hijaz" | "nile" | "temple" | "sistrum" | "bell";
export type SoundName = `ring_${RingId}` | "message" | "notify" | "send" | "end";

/** خيارات رنة المكالمة اللي العميل يختار منها */
export const RINGTONES: Array<{ id: RingId; label: string; desc: string; labelEn: string; descEn: string; period: number }> = [
  { id: "hijaz", label: "حجاز رع", desc: "عود وطبلة على إيقاع المقسوم", labelEn: "Hijaz Ra", descEn: "Oud and drum on the maqsoum rhythm", period: 2.4 },
  { id: "nile", label: "نسمة النيل", desc: "أرپيجيو هادي على مقام البياتي", labelEn: "Nile Breeze", descEn: "Calm arpeggio in maqam Bayati", period: 3.0 },
  { id: "temple", label: "طبول المعبد", desc: "طبول قوية وجلاجل", labelEn: "Temple Drums", descEn: "Powerful drums and jingles", period: 2.4 },
  { id: "sistrum", label: "سيستروم", desc: "جلاجل لامعة وأجراس عالية", labelEn: "Sistrum", descEn: "Bright jingles and high bells", period: 1.8 },
  { id: "bell", label: "جرس الكهنة", desc: "أجراس بطيئة وهادية", labelEn: "Priests' Bell", descEn: "Slow, soothing bells", period: 3.0 },
];

type Ctx = BaseAudioContext;

// مقام الحجاز على الري: ري، مي♭، فا♯، صول، لا، سي♭، دو
const N = {
  D4: 293.66, Eb4: 311.13, Fs4: 369.99, G4: 392.0, A4: 440.0, Bb4: 466.16,
  C5: 523.25, D5: 587.33, Eb5: 622.25, Fs5: 739.99, A5: 880.0,
  D6: 1174.66, Fs6: 1479.98, A6: 1760.0,
} as const;

function noiseBuffer(ctx: Ctx): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // ضوضاء ثابتة (seeded) عشان الصوت يطلع نفسه كل مرة
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 0xffffffff) * 2 - 1;
  }
  return buf;
}

/** نقرة وترية قصيرة (عود): منشار + فلتر بينزل بسرعة */
function pluck(ctx: Ctx, out: AudioNode, t: number, freq: number, dur = 0.45, vol = 0.28) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(Math.min(freq * 7, 9000), t);
  f.frequency.exponentialRampToValueAtTime(freq * 1.4, t + dur * 0.7);
  f.connect(g);
  g.connect(out);
  for (const detune of [-5, 5]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** جرس / سيستروم: جزيئات غير متناسقة بتتلاشى */
function bell(ctx: Ctx, out: AudioNode, t: number, freq: number, dur = 0.9, vol = 0.16) {
  [[1, 1], [2.76, 0.45], [5.4, 0.2]].forEach(([ratio, amp]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / ratio);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
}

/** دُم: ضربة طبلة غليظة */
function dum(ctx: Ctx, out: AudioNode, t: number, vol = 0.5) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.14);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.3);
}

/** تَك: ضربة حادة على حافة الطبلة */
function tek(ctx: Ctx, out: AudioNode, t: number, vol = 0.22, hz = 3200) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = hz;
  f.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.1);
}

/** رعشة جلاجل سيستروم */
function shake(ctx: Ctx, out: AudioNode, t: number, count = 4, step = 0.045, vol = 0.1) {
  for (let i = 0; i < count; i++) tek(ctx, out, t + i * step, vol, 7000);
}

// ضربات المقسوم على شبكة ٠٫١٥ ث: دُم تك . تك دُم . تك .
const MAQSUM: Array<"D" | "T" | "."> = ["D", ".", "T", "T", "D", ".", "T", ".", "D", ".", "T", "T", "D", ".", "T", "."];

const ringDur = (id: RingId) => (RINGTONES.find((r) => r.id === id)?.period ?? 2.4) + 0.6; // دورة + ذيل
export const DURATIONS: Record<SoundName, number> = {
  ring_hijaz: ringDur("hijaz"),
  ring_nile: ringDur("nile"),
  ring_temple: ringDur("temple"),
  ring_sistrum: ringDur("sistrum"),
  ring_bell: ringDur("bell"),
  message: 0.8,
  notify: 1.3,
  send: 0.35,
  end: 0.9,
};

/** مستوى كل صوت (معادلة الجهارة بين الرنة والنغمات الأهدأ) */
const LEVEL: Record<SoundName, number> = { ring_hijaz: 0.9, ring_nile: 1.15, ring_temple: 0.9, ring_sistrum: 1.1, ring_bell: 1.5, message: 1.5, notify: 2.4, send: 1.8, end: 1.1 };

/** يجدول صوت على سياق معيّن بدءًا من الزمن t0 */
export function schedule(ctx: Ctx, name: SoundName, t0: number, dest?: AudioNode) {
  const master = ctx.createGain();
  master.gain.value = LEVEL[name];
  master.connect(dest ?? ctx.destination);
  const o = master;

  switch (name) {
    case "ring_hijaz": {
      const mel: Array<[number, number, number]> = [
        [0.0, N.D4, 0.2], [0.15, N.Eb4, 0.2], [0.3, N.Fs4, 0.2], [0.45, N.G4, 0.2],
        [0.6, N.A4, 0.34], [0.9, N.D5, 0.34], [1.2, N.C5, 0.2], [1.35, N.Bb4, 0.2],
        [1.5, N.A4, 0.2], [1.65, N.G4, 0.2], [1.8, N.Fs4, 0.34], [2.1, N.D4, 0.5],
      ];
      mel.forEach(([dt, f, d]) => pluck(ctx, o, t0 + dt, f, d + 0.25, 0.26));
      bell(ctx, o, t0 + 0.9, N.D6, 1.0, 0.1);
      MAQSUM.forEach((b, i) => {
        if (b === "D") dum(ctx, o, t0 + i * 0.15, 0.42);
        if (b === "T") tek(ctx, o, t0 + i * 0.15, 0.16);
      });
      break;
    }
    case "ring_nile": {
      const E = 320.0; // مي نصف بيمول (بياتي)
      const mel: Array<[number, number, number]> = [
        [0.0, N.D4, 0.5], [0.22, E, 0.5], [0.44, 349.23, 0.5], [0.66, N.A4, 0.5], [0.88, N.D5, 0.9],
        [1.5, N.A4, 0.5], [1.8, 349.23, 0.5], [2.1, E, 0.5], [2.4, N.D4, 0.8],
      ];
      mel.forEach(([dt, f, d]) => pluck(ctx, o, t0 + dt, f, d, 0.2));
      bell(ctx, o, t0 + 0.88, N.D6, 1.4, 0.07);
      bell(ctx, o, t0 + 2.4, N.A5, 1.2, 0.06);
      break;
    }
    case "ring_temple": {
      const pat = "D.T.D.TTD.T.DTT.";
      [...pat].forEach((b, i) => {
        if (b === "D") dum(ctx, o, t0 + i * 0.15, i % 8 === 0 ? 0.65 : 0.5);
        if (b === "T") tek(ctx, o, t0 + i * 0.15, 0.2, i % 2 ? 2600 : 3600);
      });
      shake(ctx, o, t0 + 0.6, 5, 0.04, 0.09);
      shake(ctx, o, t0 + 1.8, 5, 0.04, 0.09);
      pluck(ctx, o, t0, N.D4, 0.6, 0.24);
      pluck(ctx, o, t0 + 1.2, N.A4, 0.6, 0.22);
      pluck(ctx, o, t0 + 1.5, N.Bb4, 0.5, 0.2);
      break;
    }
    case "ring_sistrum": {
      [0, 0.9].forEach((b) => {
        shake(ctx, o, t0 + b, 6, 0.03, 0.11);
        dum(ctx, o, t0 + b, 0.3);
      });
      [[0.18, N.D6], [0.36, N.Fs6], [0.54, N.A6], [0.72, N.Fs6], [1.08, N.A6], [1.26, N.Fs6], [1.44, N.D6]].forEach(([dt, f]) =>
        bell(ctx, o, t0 + dt, f, 0.7, 0.13)
      );
      break;
    }
    case "ring_bell": {
      dum(ctx, o, t0, 0.25);
      [[0.0, N.D5, 1.8], [0.75, N.A5, 1.6], [1.5, N.Fs5, 1.6], [2.2, N.A4 * 2, 1.4]].forEach(([dt, f, d]) =>
        bell(ctx, o, t0 + dt, f, d, 0.2)
      );
      break;
    }
    case "message": {
      pluck(ctx, o, t0, N.A5, 0.3, 0.2);
      pluck(ctx, o, t0 + 0.11, N.D6, 0.45, 0.2);
      bell(ctx, o, t0 + 0.11, N.D6 * 2, 0.5, 0.05);
      break;
    }
    case "notify": {
      shake(ctx, o, t0, 4, 0.04, 0.09);
      bell(ctx, o, t0 + 0.06, N.D6, 1.1, 0.16);
      bell(ctx, o, t0 + 0.22, N.Fs6, 1.0, 0.14);
      bell(ctx, o, t0 + 0.38, N.A6, 0.9, 0.12);
      break;
    }
    case "send": {
      tek(ctx, o, t0, 0.14, 4200);
      pluck(ctx, o, t0 + 0.02, N.A5, 0.22, 0.15);
      break;
    }
    case "end": {
      pluck(ctx, o, t0, N.D5, 0.3, 0.22);
      pluck(ctx, o, t0 + 0.18, N.A4, 0.3, 0.22);
      pluck(ctx, o, t0 + 0.36, N.D4, 0.5, 0.24);
      dum(ctx, o, t0 + 0.36, 0.35);
      break;
    }
  }
}

/** يرسم الصوت أوفلاين ويرجّع بايتات WAV (16-bit mono) */
export async function renderWav(name: SoundName, sampleRate = 44100): Promise<Uint8Array> {
  const secs = DURATIONS[name];
  const ctx = new OfflineAudioContext(1, Math.ceil(secs * sampleRate), sampleRate);
  schedule(ctx, name, 0);
  const buf = await ctx.startRendering();
  const data = buf.getChannelData(0);
  const out = new Uint8Array(44 + data.length * 2);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}
