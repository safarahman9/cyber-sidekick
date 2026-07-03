const CACHE = "cyber-v2";
const FILES = ["./index.html", "./manifest.json", "./icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.search) {
    // Has query params (e.g. a share-target load with ?url=/&text=/&title=).
    // Always go to network so the shared content isn't lost to a cached shell.
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
