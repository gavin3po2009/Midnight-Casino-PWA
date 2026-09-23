/* sw.js — OMNILAUNCHER offline PWA worker
   Strategy:
   • HTML pages & games: NETWORK-FIRST — always the newest version when
     online, cached copy only when offline. (The old worker used
     cache-first, which trapped visitors on a stale copy — fixed.)
   • Icons / manifest / static files: stale-while-revalidate.
   • Repo scans, title checks (no-store requests) and the GitHub API
     go straight to the network — never cached.
   Bump VERSION whenever you edit this file so every visitor refreshes. */
const VERSION='omnilauncher-offline-v1';
const CORE=[
  './',
  './index.html',
  './gambling.html',
  './SnakeYahu.html',
  './MightySeagull.html',
  './RunFromVerity.html'
];

self.addEventListener('install',function(event){
  event.waitUntil((async function(){
    const cache=await caches.open(VERSION);
    await Promise.all(CORE.map(async function(u){
      try{await cache.add(new Request(u,{cache:'reload'}))}catch(e){/* not deployed yet — fine */}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',function(event){
  event.waitUntil((async function(){
    const keys=await caches.keys();
    await Promise.all(keys.filter(function(k){return k!==VERSION}).map(function(k){return caches.delete(k)}));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',function(event){
  const req=event.request;
  if(req.method!=='GET')return;
  if(req.cache==='no-store')return;             /* freshness-critical: network only */
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;  /* GitHub API, Google Fonts: direct */

  const isPage=req.mode==='navigate'||(req.headers.get('accept')||'').indexOf('text/html')!==-1;

  if(isPage){
    /* network-first: fresh when online, cache when offline */
    event.respondWith((async function(){
      try{
        const fresh=await fetch(new Request(req.url,{cache:'reload'}));
        if(fresh&&fresh.ok){
          const cache=await caches.open(VERSION);
          cache.put(req,fresh.clone());
        }
        return fresh;
      }catch(e){
        const cached=await caches.match(req,{ignoreSearch:true});
        if(cached)return cached;
        const shell=await caches.match('./index.html');
        if(shell)return shell;
        return new Response('OFFLINE',{status:503,headers:{'Content-Type':'text/plain'}});
      }
    })());
    return;
  }

  /* everything else: stale-while-revalidate */
  event.respondWith((async function(){
    const cache=await caches.open(VERSION);
    const cached=await cache.match(req);
    const network=fetch(req).then(function(res){
      if(res&&res.ok)cache.put(req,res.clone());
      return res;
    }).catch(function(){return null});
    if(cached)return cached;
    const fresh=await network;
    if(fresh)return fresh;
    return new Response('',{status:504});
  })());
});