// Verso service worker: keeps the app and downloaded songs working offline.
//
// - Pages and data (navigations and Next.js RSC requests): network first, cached
//   copy when offline.
// - Build files (/_next/static): cache first (their names change every build).
// - Audio of songs saved offline: served from the "verso-audio" cache, with
//   Range support so <audio> can seek.
// - /api: always network (never cached).

const VERSION = "v1";
const APP_CACHE = `verso-app-${VERSION}`;
const AUDIO_CACHE = "verso-audio";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("verso-app-") && key !== APP_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.destination === "audio") {
    event.respondWith(
      caches
        .open(AUDIO_CACHE)
        .then((cache) => cache.match(request.url))
        .then((saved) => (saved ? withRange(request, saved) : fetch(request))),
    );
    return;
  }
  // Other sites (YouTube, Supabase, Stripe) and the API go straight to the network.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  const accept = request.headers.get("accept") || "";
  if (request.mode === "navigate" || accept.includes("text/html") || request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw error;
  }
}

/** Answers "Range: bytes=start-end" from a cached full response, as media elements expect. */
async function withRange(request, response) {
  const range = request.headers.get("range");
  if (!range) return response;
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) return response;
  const body = await response.blob();
  const size = body.size;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
