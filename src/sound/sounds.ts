import { useSyncExternalStore } from "react";
import { RINGTONES, schedule, type RingId, type SoundName } from "./synth";

export type { SoundName, RingId };
export { RINGTONES };

const KEY = "rachat-sound";
let enabled = true;
try {
  if (localStorage.getItem(KEY) === "off") enabled = false;
} catch {
  /* التخزين غير متاح */
}
const subs = new Set<() => void>();

let ring: RingId = "hijaz";
try {
  const v = localStorage.getItem("rachat-ring");
  if (RINGTONES.some((r) => r.id === v)) ring = v as RingId;
} catch {
  /* التخزين غير متاح */
}

export function setRingtone(id: RingId) {
  ring = id;
  try {
    localStorage.setItem("rachat-ring", id);
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}

export function useRingtone(): RingId {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => ring,
    () => ring
  );
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) stopRingtone();
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => enabled,
    () => enabled
  );
}

// ---- الاهتزاز ----
const VKEY = "rachat-vibrate";
let vibOn = true;
try {
  if (localStorage.getItem(VKEY) === "off") vibOn = false;
} catch {
  /* التخزين غير متاح */
}

/** أنماط الاهتزاز بالملّي ثانية (اهتزاز، سكون، اهتزاز…) */
const VIB: Record<string, number[]> = {
  message: [40, 60, 40],
  notify: [60, 80, 60, 80, 120],
  send: [20],
  end: [120],
  ring_hijaz: [400, 200, 400, 1400],
  ring_nile: [300, 150, 300, 150, 300, 1800],
  ring_temple: [120, 80, 120, 80, 400, 1600],
  ring_sistrum: [60, 60, 60, 60, 60, 60, 60, 1400],
  ring_bell: [700, 2300],
};

export const vibrationSupported = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

function buzz(name: string) {
  try {
    if (vibrationSupported()) navigator.vibrate(VIB[name] ?? [40]);
  } catch {
    /* تجاهل */
  }
}

export function setVibrationEnabled(on: boolean) {
  vibOn = on;
  if (!on) {
    try { if (vibrationSupported()) navigator.vibrate(0); } catch { /* تجاهل */ }
  } else buzz("message");
  try {
    localStorage.setItem(VKEY, on ? "on" : "off");
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}

export function useVibrationEnabled(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => vibOn,
    () => vibOn
  );
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null; // المتصفح مفيهوش WebAudio أو منع الصوت
  }
}

/** يشغّل صوت لمرة واحدة. force=true للمعاينة حتى لو الأصوات مقفولة. */
export function playSound(name: SoundName, force = false) {
  if (vibOn) buzz(name);
  if (!enabled && !force) return;
  const c = getCtx();
  if (!c) return;
  schedule(c, name, c.currentTime + 0.02);
}

let ringTimer: ReturnType<typeof setInterval> | null = null;

/** رنة المكالمة: تتكرر كل دورة لحد ما تتوقف */
export function startRingtone(force = false, id: RingId = ring) {
  stopRingtone();
  const name = `ring_${id}` as SoundName;
  const period = RINGTONES.find((r) => r.id === id)?.period ?? 2.4;
  const ringBuzz = () => { if (vibOn) buzz(name); };
  // الاهتزاز مستقل عن الصوت: لو الأصوات مقفولة المكالمة تفضل تهتز
  if (!enabled && !force) {
    ringBuzz();
    ringTimer = setInterval(ringBuzz, period * 1000);
    return;
  }
  const c = getCtx();
  if (!c) { ringBuzz(); ringTimer = setInterval(ringBuzz, period * 1000); return; }
  schedule(c, name, c.currentTime + 0.02);
  ringBuzz();
  ringTimer = setInterval(() => { schedule(c, name, c.currentTime + 0.02); ringBuzz(); }, period * 1000);
}

export function stopRingtone() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  try { if (vibrationSupported()) navigator.vibrate(0); } catch { /* تجاهل */ }
}
