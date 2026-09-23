/* Service Worker — strict offline (cache-only after install) */
const CACHE_NAME = 'midnight-casino-v3';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
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
  './fonts/font-7.woff2',
  './fonts/font-8.woff2',
  './fonts/font-9.woff2',
  './fonts/font-10.woff2',
  './fonts/font-11.woff2',
  './fonts/font-12.woff2',
  './fonts/font-13.woff2',
  './fonts/font-14.woff2',
  './fonts/font-15.woff2',
  './fonts/font-16.woff2',
  './fonts/font-17.woff2',
  './fonts/font-18.woff2',
  './fonts/font-19.woff2',
  './fonts/font-20.woff2',
  './fonts/font-21.woff2',
  './fonts/font-22.woff2',
  './fonts/font-23.woff2',
  './fonts/font-24.woff2',
  './fonts/font-25.woff2',
  './fonts/font-26.woff2',
  './fonts/font-27.woff2',
  './fonts/font-28.woff2'
];

// Install: pre-cache everything, then activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: take control and delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: STRICT cache-only.
// The app never talks to the network after install.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached; // serve from cache — no network
      }

      // Nothing in cache → for navigation, fall back to the main page
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }

      // For any other missing asset, return a quiet offline response
      // (never hits the network)
      return new Response('', { status: 404, statusText: 'Offline' });
    })
  );
});
