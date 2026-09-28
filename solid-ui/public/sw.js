// OmnyID Service Worker - offline shell + update notification
const SHELL_CACHE = "omnyid-shell-v5";
const API_CACHE = "omnyid-api-v1";

const SHELL_ASSETS = [
  "/workspace/",
  "/workspace/index.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => { /* ignore missing assets in dev */ }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/agent/") ||
    url.pathname.startsWith("/dashboard/") ||
    url.pathname.startsWith("/relay/") ||
    url.pathname.startsWith("/files/")
  ) {
    event.respondWith(networkFirstWithCache(event.request, API_CACHE));
    return;
  }

  // Keep the shell entry page fresh so deploys pick up the latest hashed bundles.
  if (url.pathname === "/workspace/" || url.pathname === "/workspace/index.html") {
    event.respondWith(networkFirstWithCache(event.request, SHELL_CACHE));
    return;
  }

  // Never serve stale JS/CSS module assets first. A stale module graph can crash
  // the app with TDZ errors such as "can't access lexical declaration before
  // initialization" on the first load after a deploy.
  if (
    url.pathname.startsWith("/workspace/assets/") ||
    url.pathname === "/workspace/manifest.webmanifest" ||
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "worker" ||
    event.request.destination === "manifest"
  ) {
    event.respondWith(networkFirstWithCache(event.request, SHELL_CACHE));
    return;
  }

  event.respondWith(cacheFirstWithNetwork(event.request, SHELL_CACHE));
});

async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const fallback = await caches.match("/workspace/");
    return fallback ?? new Response("Offline", { status: 503 });
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "omnyid-sync") {
    event.waitUntil(Promise.resolve());
  }
});
