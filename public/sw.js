const CACHE = "pouragenda-public-v2";
const PUBLIC_ASSETS = ["/offline", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  const isPublicAsset =
    url.pathname.startsWith("/_next/static/") ||
    PUBLIC_ASSETS.includes(url.pathname);
  if (!isPublicAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    })),
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(payload.title ?? "PourAgenda reminder", {
    body: payload.body ?? "You have an upcoming appointment.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { target: payload.target, date: payload.date },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const target = data.target
    ? `/?target=${encodeURIComponent(data.target)}&date=${encodeURIComponent(data.date ?? "")}`
    : "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client);
    if (existing) {
      existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  }));
});
