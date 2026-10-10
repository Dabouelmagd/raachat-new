import { useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light";
const KEY = "rachat-theme";
let mode: ThemeMode = "dark";
try {
  const v = localStorage.getItem(KEY);
  if (v === "light" || v === "dark") mode = v;
} catch {
  /* التخزين غير متاح — نكمل بالافتراضي */
}
const subs = new Set<() => void>();

export function setTheme(next: ThemeMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* تجاهل */
  }
  subs.forEach((f) => f());
}

export function useTheme(): ThemeMode {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => mode,
    () => mode
  );
}
