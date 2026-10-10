import { useSyncExternalStore } from "react";
import { API_URL, api, getSession } from "./client";

export interface SocketLike {
  on(ev: string, fn: (p: any) => void): void;
  off(ev: string, fn?: (p: any) => void): void;
  emit(ev: string, payload?: unknown, ack?: (r: any) => void): void;
  close(): void;
  connect(): void;
}

let current: SocketLike | null = null;
const subs = new Set<() => void>();
const set = (s: SocketLike | null) => { current = s; subs.forEach((f) => f()); };
export const getSocket = () => current;
/** الاتصال الحالي (أو null) — بيتحدّث لما يتفتح/يتقفل */
export const useSocket = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);

/** اتصال لحظي — بيتحمّل بس في وضع الباك إند الحقيقي */
export async function connectSocket(): Promise<SocketLike | null> {
  const s = getSession();
  if (!s) return null;
  const { io } = await import("socket.io-client");
  // التوكن بيتقرا عند كل (إعادة) اتصال؛ لو انتهى نجدّده عبر نداء API عادي
  const sock = io(API_URL, { auth: (cb: (d: object) => void) => cb({ token: getSession()?.access ?? "" }), transports: ["websocket"] }) as unknown as SocketLike;
  sock.on("connect_error", () => { void api("/me").catch(() => {}); });
  const close = sock.close.bind(sock);
  sock.close = () => { close(); if (current === sock) set(null); };
  set(sock);
  return sock;
}
