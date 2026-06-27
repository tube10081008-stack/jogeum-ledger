/* 조금만 가계부 — 서비스워커 (오프라인 캐시)
 * 버전을 올리면 새 캐시로 교체되고 구버전은 삭제된다. */
const CACHE = "jogeum-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/format.js",
  "./js/storage.js",
  "./js/state.js",
  "./js/mascot.js",
  "./js/gamification.js",
  "./js/views.js",
  "./js/sync.js",
  "./js/insights.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* 네트워크 우선 → 실패 시 캐시 (배포 직후 최신본을 잘 받도록) */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
