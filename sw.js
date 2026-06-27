const CACHE_NAME = 'eva-portfolio-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './design-tokens.css',
  './eva-player.css',
  './eva-player.bundle.js',
  './eva-eq-float/eva-eq-float.js',
  './eva-eq-float/eva-eq-float.css',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Audio and cover files: network only (no cache — too large for mobile)
  if (url.pathname.match(/\.(mp3|wav|ogg|flac|m4a|aac|opus|png|jpe?g|webp)$/i)) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Static assets: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
