/* sw.js — CACHE PURGE VERSION
   Replaces the old caching service worker. On activation it deletes
   every cache, claims open pages, then unregisters itself so the site
   is always served fresh from the network from now on. */
self.addEventListener('install', function(event){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.map(function(k){ return caches.delete(k); }));
      })
      .then(function(){ return self.clients.claim(); })
      .then(function(){ return self.registration.unregister(); })
      .catch(function(){})
  );
});

/* pass-through: never cache anything */
self.addEventListener('fetch', function(event){
  /* intentionally empty — all requests go straight to the network */
});