import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePushSync } from "./push";

/** بيربط ضغطة الإشعار بالتنقل: يفتح المحادثة (والمكالمة الرانّة بتظهر من call:pending) */
export function PushBridge() {
  const nav = useNavigate();
  usePushSync(true);
  useEffect(() => {
    const open = (threadId?: string) => { if (threadId) nav(`/chat/${threadId}`); };
    // التطبيق اتفتح من الإشعار (نافذة جديدة): ?thread=…&call=…
    try {
      const q = new URLSearchParams(location.search);
      if (q.get("thread")) { open(q.get("thread")!); history.replaceState(null, "", location.pathname); }
    } catch { /* تجاهل */ }
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "rachat-open") open(e.data.threadId); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [nav]);
  return null;
}
