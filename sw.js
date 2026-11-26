const CACHE_NAME = 'training-os-v2.0.3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/store.js',
  './js/workout.js',
  './js/big3.js',
  './js/analytics.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // API volání (script.google.com apod.) nikdy necachovat v SW
  if (url.origin !== self.location.origin) return;

  // Stale-While-Revalidate: bleskový start z cache + tichá aktualizace na pozadí
  event.respondWith(
    caches.match(req).then(function (cached) {
      const networkFetch = fetch(req)
        .then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return cached;
        });

      return cached || networkFetch;
    })
  );
});
