/* Service Worker — STRICT offline after first successful install.
   Once cached, the app never initiates network requests for its own assets.
   Note: Chrome itself may still briefly check /sw.js for updates; that is
   browser behavior and cannot be fully disabled. */
const CACHE_NAME = 'midnight-casino-v4';

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

// STRICT cache-only. Never call fetch() for app assets.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Try exact match first
    let response = await cache.match(event.request);
    if (response) return response;

    // Try without query string / hash
    const url = new URL(event.request.url);
    response = await cache.match(url.pathname);
    if (response) return response;

    // Common navigation fallbacks
    if (event.request.mode === 'navigate' ||
        url.pathname === '/' ||
        url.pathname.endsWith('/index.html') ||
        url.pathname.endsWith('/')) {
      response = await cache.match('./index.html') || await cache.match('/index.html');
      if (response) return response;
    }

    // Absolute last resort — still no network
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  })());
});
