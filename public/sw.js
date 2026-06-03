// ReStock Service Worker v3
const CACHE = "restock-v3";
const SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/restock.png",
  "/restockname.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for assets ─────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-same-origin / Supabase API calls
  if (request.method !== "GET") return;
  if (url.hostname.includes("supabase.co")) return;

  // Navigation requests → serve app shell, fallback to offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache successful navigation responses
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match("/") || caches.match("/offline"))
    );
    return;
  }

  // Next.js static assets (_next/static) → cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Images / assets → stale-while-revalidate
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/) ||
    url.pathname.startsWith("/_next/image")
  ) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => { cache.put(request, res.clone()); return res; })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Everything else → network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request) || caches.match("/offline"))
  );
});
