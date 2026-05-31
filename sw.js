const cacheName = "yingyu-app-v10";
const appShell = [
  "./",
  "./index.html",
  "./privacy.html",
  "./report.html",
  "./feedback-report.html",
  "./styles.css",
  "./report.css",
  "./app.js",
  "./copy.js",
  "./audio-core.js",
  "./live-quality.js",
  "./audio-attachments.js",
  "./audio-store.js",
  "./feedback-store.js",
  "./feedback-insights.js",
  "./feedback-report.js",
  "./report.js",
  "./result-insights.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appShell)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
