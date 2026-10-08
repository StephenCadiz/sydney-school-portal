/* Sydney School Portal service worker.
 * Deliberately network-only: private portal data, API responses, and sessions
 * are never cached for offline use.
 */
const SCOPE = "/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || "Sydney School";
  const options = {
    body: payload.body || "You have a new portal notification.",
    icon: payload.icon || "/LOGO.png",
    badge: payload.badge || "/LOGO.png",
    data: { url: payload.url || "/" },
    tag: payload.tag || "sydney-school-notification",
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client);
    if (existing) return existing.focus().then(() => existing.navigate(target));
    return self.clients.openWindow(target);
  }));
});
