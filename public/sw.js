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
    await syncBadge();
  })());
});

/**
 * **علامة العدّاد على أيقونة التطبيق والتطبيق مقفول.**
 *
 * الـ service worker مايعرفش عدد الرسايل المش مقروءة (مفيش جلسة ولا توكن
 * هنا)، فبنعدّ **الإشعارات المعلّقة** — ودي أقرب حاجة لعدد اللي لسه
 * محصلش عليه رد. والتطبيق لما يتفتح بيكتب الرقم الصحيح فوقه فورًا من
 * حالته هو (`src/push/badge.ts`)، فأي فرق بيتصلّح من أول فتحة.
 *
 * وكل حاجة جوه `try`: الـ Badging API مش موجود في كل متصفح، وفشلها
 * **مايصحّش** يوقف عرض الإشعار نفسه.
 */
async function syncBadge() {
  try {
    const ns = await self.registration.getNotifications();
    if (ns.length) await self.navigator.setAppBadge?.(ns.length);
    else await self.navigator.clearAppBadge?.();
  } catch { /* مش مدعّم */ }
}

self.addEventListener("notificationclose", (event) => event.waitUntil(syncBadge()));

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  n.close();
  const { threadId, callId } = n.data || {};
  event.waitUntil((async () => {
    await syncBadge();
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
