/* sw.js — OMNILAUNCHER offline sync engine (build 6)
   BOOT: everything served from the pack cache — zero network requests.
   SYNC: only ever triggered by the user (or first run). One burst:
   shell + all games + fonts + manifest/icons downloaded in parallel,
   progress reported to the page, "changed" detection by content compare.
   Bump CODE_VERSION when you edit this file. */
const CODE_VERSION='omnilauncher-sync-v1';
const PACK='omnilauncher-pack';                 /* persists across sw versions */
const ROOT=new URL('./',self.location.href).href;

self.addEventListener('install',function(e){
  self.skipWaiting();
});

self.addEventListener('activate',function(e){
  e.waitUntil((async function(){
    /* drop every cache from older builds, but never the offline pack */
    const keys=await caches.keys();
    await Promise.all(keys.filter(function(k){return k!==PACK}).map(function(k){return caches.delete(k)}));
    await self.clients.claim();
  })());
});

/* ---------- messages from the page ---------- */
self.addEventListener('message',function(e){
  const d=e.data;
  if(!d||d.__sync!==true)return;
  if(d.type==='ping'){try{e.source.postMessage({__sync:true,type:'pong'})}catch(_){}return}
  if(d.type==='start')runSync(d.games||[],e.source);
});

function parseMeta(html){
  const out={};
  const t=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if(t)out.t=t[1].replace(/\s+/g,' ').trim().slice(0,90);
  const m=/<meta[^>]+name=["']description["'][^>]*>/i.exec(html);
  if(m){
    const c=/content=["']([^"']*)["']/i.exec(m[0]);
    if(c)out.d=c[1].trim().slice(0,150);
  }
  return (out.t||out.d)?out:null;
}
function collectFontLinks(text,set){
  const re=/https:\/\/fonts\.googleapis\.com\/css[^"'\s)]+/g;let m;
  while((m=re.exec(text)))set.add(m[0].replace(/&amp;/g,'&'));
}

async function runSync(games,client){
  const send=function(m){try{if(client)client.postMessage(Object.assign({__sync:true},m))}catch(_){}};
  const cache=await caches.open(PACK);
  const failed=[];
  let total=games.length+1,done=0,changed=false;
  const titles={};

  const grab=async function(url){
    const res=await fetch(new Request(url,{cache:'reload'}));
    if(!res||!res.ok)throw new Error('HTTP '+(res&&res.status));
    return res;
  };
  const store=async function(url,res){ /* download + content-compare + cache */
    const text=await res.clone().text();
    const old=await cache.match(url,{ignoreVary:true});
    let fileChanged=true;
    if(old){try{fileChanged=(await old.clone().text())!==text}catch(_){fileChanged=true}}
    await cache.put(url,res);
    if(fileChanged)changed=true;
    done++;send({type:'progress',done:done,total:total});
    return text;
  };

  try{
    /* 1 — launcher shell, always fresh, cached under both URLs */
    const shellRes=await grab(ROOT+'index.html');
    const shellText=await shellRes.clone().text();
    let shellChanged=true;
    const oldShell=await cache.match(ROOT+'index.html',{ignoreVary:true})||await cache.match(ROOT,{ignoreVary:true});
    if(oldShell){try{shellChanged=(await oldShell.clone().text())!==shellText}catch(_){}}
    await cache.put(ROOT,shellRes.clone());
    await cache.put(ROOT+'index.html',shellRes);
    if(shellChanged)changed=true;
    done++;send({type:'progress',done:done,total:total});

    const fontCss=new Set();
    collectFontLinks(shellText,fontCss);

    /* 2 — games (page already skipped unchanged ones by size) */
    for(const g of games){
      try{
        const res=await grab(g.url);
        const text=await store(g.url,res);
        collectFontLinks(text,fontCss);
        const t=parseMeta(text);
        if(t)titles[g.url]=t;
      }catch(err){
        failed.push(g.url);
        done++;send({type:'progress',done:done,total:total});
      }
    }

    /* 3 — fonts found in the shell + game files (only if not cached) */
    const fontFiles=[];
    for(const cssUrl of Array.from(fontCss)){
      if(await cache.match(cssUrl,{ignoreVary:true}))continue;
      try{
        const res=await fetch(new Request(cssUrl,{cache:'reload',mode:'cors'}));
        if(res&&res.ok){
          const text=await res.clone().text();
          await cache.put(cssUrl,res);
          const re=/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;let m;
          while((m=re.exec(text)))fontFiles.push(m[1]);
        }
      }catch(err){}
    }
    if(fontFiles.length){
      total+=fontFiles.length;
      send({type:'progress',done:done,total:total});
      for(const fu of fontFiles){
        if(await cache.match(fu,{ignoreVary:true})){done++;continue}
        try{const r=await fetch(new Request(fu,{cache:'reload',mode:'cors'}));if(r&&r.ok)await cache.put(fu,r)}catch(err){}
        done++;send({type:'progress',done:done,total:total});
      }
    }

    /* 4 — manifest + icons (only if not cached) */
    try{
      const mUrl=ROOT+'manifest.json';
      if(!await cache.match(mUrl,{ignoreVary:true})){
        const r=await grab(mUrl);
        await cache.put(mUrl,r);
        const mj=JSON.parse(await r.clone().text());
        for(const ic of (mj.icons||[])){
          const iu=new URL(ic.src,ROOT).href;
          if(!await cache.match(iu,{ignoreVary:true})){
            try{const ir=await grab(iu);await cache.put(iu,ir)}catch(err){}
          }
        }
      }
    }catch(err){}
  }catch(err){
    send({type:'done',changed:changed,failed:failed,titles:titles,error:true});
    return;
  }
  send({type:'done',changed:changed,failed:failed,titles:titles});
}

/* ---------- FETCH: the boot path — cache first, no revalidation, ever.
   Freshness comes exclusively from SYNC. Network is only touched on a
   cache miss (first visit). no-store requests & the GitHub API pass
   straight through. ---------- */
self.addEventListener('fetch',function(event){
  const req=event.request;
  if(req.method!=='GET')return;
  if(req.cache==='no-store')return;
  const url=new URL(req.url);
  const isFont=url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com';
  if(url.origin!==self.location.origin&&!isFont)return; /* API etc → network */

  event.respondWith((async function(){
    const cache=await caches.open(PACK);
    const cached=await cache.match(req,{ignoreVary:true});
    if(cached)return cached;
    try{
      const fresh=await fetch(req);
      if(fresh&&(fresh.ok||fresh.type==='opaque')){
        try{await cache.put(req,fresh.clone())}catch(_){}
      }
      return fresh;
    }catch(err){
      const isPage=req.mode==='navigate'||(req.headers.get('accept')||'').indexOf('text/html')!==-1;
      if(isPage){
        const shell=await cache.match(ROOT+'index.html',{ignoreVary:true})||await cache.match(ROOT,{ignoreVary:true});
        if(shell)return shell;
      }
      return new Response('OFFLINE',{status:503,headers:{'Content-Type':'text/plain'}});
    }
  })());
});