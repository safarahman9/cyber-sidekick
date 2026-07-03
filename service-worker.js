const CACHE = "cyber-v3";
const SHARE_CACHE = "cyber-share-v1";
const FILES = ["./index.html", "./manifest.json", "./icon.png", "./share-target.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Incoming share (long-press an image/link on mobile, tap Share, pick Cyber Sidekick).
  // The OS POSTs form data here; pull out the file and any text/url/title, stash them
  // where index.html can read them on load, then redirect to a normal GET navigation.
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target.html")) {
    e.respondWith(handleShareTarget(e.request));
    return;
  }

  if (url.search) {
    // Has query params (e.g. the ?shared=1 redirect below). Always go to network
    // so shared content isn't lost to a cached shell.
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const title = formData.get("title") || "";
    const text = formData.get("text") || "";
    const sharedUrl = formData.get("url") || "";
    const file = formData.get("media"); // File object, or null if no image/pdf was shared

    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      "/__shared_payload",
      new Response(JSON.stringify({ title, text, url: sharedUrl, hasFile: !!file }))
    );

    if (file && file.size > 0) {
      await cache.put(
        "/__shared_file",
        new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream" } })
      );
    } else {
      await cache.delete("/__shared_file");
    }
  } catch (err) {
    // Best-effort. If parsing fails, index.html just finds nothing shared.
  }
  return Response.redirect("./index.html?shared=1", 303);
}
