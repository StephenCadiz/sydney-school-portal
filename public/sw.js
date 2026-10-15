/* Sydney School Portal service worker.
 * Static app assets are cached for a fast installed-PWA shell. Private API
 * responses and user data are handled by the account-scoped IndexedDB cache,
 * never by this shared service-worker cache. PDFs, audio, downloads, and
 * attachments remain network-only.
 */
const STATIC_CACHE = "sydney-school-static-v2";
const STATIC_PATHS = ["/_next/static/", "/icons/", "/fonts/", "/LOGO and NAME.png"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("sydney-school-static-") && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || /\.(pdf|mp3|wav|m4a|aac|ogg|webm)$/i.test(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (!STATIC_PATHS.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        void fetch(request).then((response) => {
          if (response.ok && response.type === "basic") void cache.put(request, response.clone());
        }).catch(() => undefined);
        return cached;
      }
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try { payload = event.data ? JSON.parse(event.data.text()) : {}; } catch { payload = {}; }
  }
  const title = payload.title || "Sydney School";
  const options = {
    body: payload.body || "You have a new portal notification.",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
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
