import { useSyncExternalStore } from "react";
import { playSound } from "./sounds";

export interface Toast { id: number; title: string; body: string }

let toast: Toast | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** إشعار داخل التطبيق + نغمة الإشعار. مع الباك إند الحقيقي يجي من Push/WebSocket. */
export function notify(title: string, body: string, force = false) {
  toast = { id: ++seq, title, body };
  playSound("notify", force);
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(dismissToast, 4200);
}

export function dismissToast() {
  toast = null;
  emit();
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => toast,
    () => toast
  );
}
