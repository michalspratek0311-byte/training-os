const CACHE_NAME = 'training-os-v2.1.0';
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
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // API volání (script.google.com apod.) nikdy necachovat v SW
  if (url.origin !== self.location.origin) return;

  // Network-First pro kód (HTML/JS/CSS): vždy aktuální konzistentní verze online, bleskový fallback na cache offline
  const isCodeAsset = req.mode === 'navigate' || /\.(html|js|css|json)$/i.test(url.pathname);
  if (isCodeAsset) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req);
        })
    );
    return;
  }

  // Cache-First pro statické ikony / obrázky
  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
