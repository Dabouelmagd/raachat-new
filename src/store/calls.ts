import { useSyncExternalStore } from "react";
import { API_ON, api } from "../api/client";

/** سجل المكالمات (محلي في الديمو — مع الباك إند: GET /calls) */
export interface CallRecord {
  id: string;
  threadId: string;
  mode: "voice" | "video";
  dir: "in" | "out" | "missed";
  at: number; // وقت البدء (ms)
  dur: number; // المدة بالثواني
}

const KEY = "rachat-calls";
const H = 3600_000;
const seed = (): CallRecord[] => {
  const n = Date.now();
  return [
    { id: "c1", threadId: "t1", mode: "video", dir: "in", at: n - 2 * H, dur: 312 },
    { id: "c2", threadId: "t3", mode: "voice", dir: "missed", at: n - 5 * H, dur: 0 },
    { id: "c3", threadId: "t1", mode: "voice", dir: "out", at: n - 26 * H, dur: 95 },
    { id: "c4", threadId: "t3", mode: "video", dir: "out", at: n - 50 * H, dur: 1260 },
  ];
};
let list: CallRecord[] = API_ON ? [] : seed();
try {
  const raw = localStorage.getItem(KEY);
  if (raw && !API_ON) list = JSON.parse(raw);
} catch {
  /* التخزين غير متاح */
}
const subs = new Set<() => void>();

/** استبدال السجل بنسخة الباك إند (وضع API) */
export function setCalls(l: CallRecord[]) {
  list = l;
  subs.forEach((f) => f());
}

export async function refreshCalls() {
  if (!API_ON) return;
  try { setCalls(await api<CallRecord[]>("/calls")); } catch { /* تجاهل */ }
}

export function logCall(r: Omit<CallRecord, "id">) {
  // مع الباك إند السيرفر هو اللي بيسجّل المكالمات (للطرفين، بما فيها الفايتة)؛ بنحدّث القايمة بس
  if (API_ON) { setTimeout(() => void refreshCalls(), 600); return; }
  list = [{ ...r, id: `c${Date.now()}` }, ...list].slice(0, 100);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}

export function useCalls(): CallRecord[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => list,
    () => list
  );
}
