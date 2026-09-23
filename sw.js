/* Service Worker — launcher shell is strict offline;
   same-origin game files are cache-first (cached on first visit);
   cross-origin (GitHub API) passes through to the network. */
const CACHE_NAME = 'arcade-launcher-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './fonts/fonts.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './fonts/font-0.woff2',
  './fonts/font-1.woff2',
  './fonts/font-2.woff2',
  './fonts/font-3.woff2',
  './fonts/font-4.woff2',
  './fonts/font-5.woff2',
  './fonts/font-6.woff2',
  './fonts/font-7.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cross-origin (e.g. api.github.com) → let the network handle it
  if (url.origin !== self.location.origin) {
    return; // default browser fetch, no SW intervention
  }

  // Same-origin: cache-first, then network + cache for future offline use
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    let response = await cache.match(event.request);
    if (response) return response;

    response = await cache.match(url.pathname);
    if (response) return response;

    // Navigation / root fallbacks
    if (event.request.mode === 'navigate' ||
        url.pathname === '/' ||
        url.pathname.endsWith('/index.html') ||
        url.pathname.endsWith('/')) {
      response = await cache.match('./index.html') || await cache.match('/index.html');
      if (response) return response;
    }

    // Not in cache — try network, then store for offline
    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse && networkResponse.status === 200) {
        cache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    } catch (err) {
      return new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  })());
});
