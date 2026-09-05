// Market Status — Service Worker
// v3: the HTML app-shell is now NETWORK-FIRST (falls back to cache only when
// offline). Earlier versions were cache-FIRST, keyed to a version string —
// every time the HTML file was replaced without also bumping that version
// string, the phone kept serving the old cached page forever (the exact bug
// reported: "old form still showing / had to delete and reinstall every
// time"). With network-first, replacing Market_Status_v1.html on the phone
// is picked up on the very next open, no reinstall or version bump needed.
// v4: icons renamed to market-status-icon-192/512.png (were icon-192/512.png,
// which collided with the identically-named STFFE icon files sitting in the
// same shared Download folder — Chrome's "Add to Home Screen" was picking up
// whichever icon-192.png it found first, showing STFFE's logo on this app's
// shortcut instead of its own).
// v5: manifest.json renamed to market-status-manifest.json — the SAME
// collision bug as v4, but for the manifest file itself. STFFE also ships a
// file literally named "manifest.json" in this same shared Download folder;
// whichever app's manifest.json was written to disk LAST silently overwrote
// the other one (both apps' <link rel="manifest" href="./manifest.json">
// tags then resolved to whichever one survived), which is exactly why the
// "Create shortcut" dialog started showing the wrong app again after Market
// Status's manifest.json was re-downloaded into the same folder as STFFE's.
// v6: every filename in this set bumped to a "v2"-suffixed name
// (Market_Status_v2.html / sw-v2.js / market-status-manifest-v2.json) —
// this phone's download manager auto-renames a re-downloaded file with the
// SAME name as an existing one (Market_Status_v1.html, sw.js, manifest.json
// already sat in the Download folder from earlier attempts), which silently
// broke the relative-path links between the HTML/manifest/service-worker.
// Using a fresh, never-before-seen filename set each time sidesteps that
// "(1)"-suffix auto-rename entirely.
const CACHE_NAME = "market-status-shell-v7-no-store-fix";
const CORE_ASSETS = [
  "./Market_Status_v2.html",
  "./market-status-manifest-v2.json",
  "./market-status-icon-192-v2.png",
  "./market-status-icon-512-v2.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;

  // Live market-data / CORS-proxy calls always go straight to the network —
  // never touched by this service worker, never cached.
  if (
    url.includes("127.0.0.1:8091") ||
    url.includes("workers.dev") ||
    url.includes("corsproxy.io") ||
    url.includes("allorigins.win") ||
    url.includes("codetabs.com") ||
    url.includes("thingproxy") ||
    url.includes("finance.yahoo.com")
  ) {
    return;
  }

  // App-shell HTML (the page itself): NETWORK-FIRST. Always try to fetch the
  // latest file first; only fall back to the last cached copy if the network
  // request fails (offline / no signal). This is the fix for the "shows old
  // version until I delete and reinstall" problem.
  // 🐛 FIX (Sep 2026): fetch(req) alone still respects ordinary HTTP caching
  // rules — GitHub Pages sends cache-control headers that let the browser's
  // OWN disk cache silently return a stale response here even though this
  // branch is "network-first" at the Service Worker level. That's why a new
  // deploy only ever showed up after manually clearing Chrome's site data.
  // { cache: "no-store" } forces an actual round-trip to the network every
  // time, so a fresh GitHub commit is picked up on the very next open with
  // no manual cache-clearing needed.
  if (req.mode === "navigate" || url.endsWith(".html")) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Other shell assets (manifest, icons) rarely change — cache-first is fine
  // and keeps the app opening instantly / working offline.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
