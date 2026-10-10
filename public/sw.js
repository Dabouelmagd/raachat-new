/* رع شات — Service Worker: إشعارات Push للمكالمات والرسايل (بيشتغل بس في وضع الباك إند) */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* payload مش JSON */ }
  event.waitUntil((async () => {
    // التطبيق ظاهر قدام المستخدم؟ الـ socket بيوصّل كل حاجة، متكرّرش بإشعار
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === "visible")) return;
    const call = d.kind === "call";
    await self.registration.showNotification(d.title || "رع شات", {
      body: d.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: d.tag || "rachat",
      renotify: true,
      requireInteraction: call,
      vibrate: call ? [400, 200, 400, 200, 400] : [120],
      data: { threadId: d.threadId || "", callId: d.callId || "", kind: d.kind || "message" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  n.close();
  const { threadId, callId } = n.data || {};
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const msg = { type: "rachat-open", threadId, callId };
    if (wins.length) {
      const w = wins.find((x) => x.visibilityState === "visible") || wins[0];
      await w.focus();
      w.postMessage(msg);
      return;
    }
    const q = new URLSearchParams();
    if (threadId) q.set("thread", threadId);
    if (callId) q.set("call", callId);
    await self.clients.openWindow("/?" + q.toString());
  })());
});
