import { useSyncExternalStore } from "react";

const KEY = "rachat-favorites";
let cur: string[] = [];
try { cur = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cur = []; }
const subs = new Set<() => void>();
export function toggleFavorite(id: string) {
  cur = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
export function useFavorites(): string[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cur);
}
