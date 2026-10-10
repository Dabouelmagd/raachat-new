import { api } from "../api/client";

let cache: { at: number; servers: RTCIceServer[] } | null = null;

/** STUN/TURN من السيرفر (TURN بكلمة سر مؤقتة ساعة) — بنجدّدها قبل ما تنتهي */
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.servers;
  try {
    const r = await api<{ iceServers: RTCIceServer[] }>("/rtc/config");
    cache = { at: Date.now(), servers: r.iceServers };
    return r.iceServers;
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}

export type MediaFail = "denied" | "none" | "other";
export async function getLocalMedia(video: boolean): Promise<{ stream: MediaStream; videoOk: boolean } | { error: MediaFail }> {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio, video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false }), videoOk: video };
  } catch (e) {
    const name = (e as DOMException).name;
    if (video && name !== "NotAllowedError") {
      // الكاميرا مش متاحة → نكمّل صوت بس
      try { return { stream: await navigator.mediaDevices.getUserMedia({ audio }), videoOk: false }; } catch { /* تحت */ }
    }
    return { error: name === "NotAllowedError" ? "denied" : name === "NotFoundError" ? "none" : "other" };
  }
}
