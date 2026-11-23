// OmnyID Service Worker - offline shell + update notification
const SHELL_CACHE = "omnyid-shell-v17";

const SHELL_ASSETS = [];

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
          .filter((key) => key !== SHELL_CACHE)
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
    url.pathname.startsWith("/files/") ||
    url.pathname.startsWith("/wedding/")
  ) {
    event.respondWith(networkOnly(event.request));
    return;
  }

  // Authentication transitions must never inherit an older HTML/module graph.
  // Offline navigation is handled by the visible boot recovery surface instead
  // of combining cached HTML with a different deployment's immutable chunks.
  if (url.pathname === "/workspace/" || url.pathname === "/workspace/index.html") {
    event.respondWith(networkOnly(event.request));
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
    event.respondWith(networkOnly(event.request));
    return;
  }

  // Do not put unclassified application responses into a shared origin cache.
  // They may be authenticated or account-scoped even when their route does not
  // use one of the prefixes above. The browser can still apply normal HTTP cache
  // semantics to public resources that are not intercepted here.
});

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    });
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "omnyid-sync") {
    event.waitUntil(Promise.resolve());
  }
});
