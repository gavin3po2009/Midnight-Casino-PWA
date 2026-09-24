/* sw.js — OMNILAUNCHER offline sync engine (build 8)
   • Sync held open with waitUntil — fonts can never be killed mid-download.
   • Font links scanned for EVERY game in the library (cached ones too).
   • AIRGAP mode: when on, every fetch is served from cache or fails —
     the network is never touched, even while online. */
const CODE_VERSION='omnilauncher-sync-v3';
const PACK='omnilauncher-pack';
const FLAGS='omnilauncher-flags';
const ROOT=new URL('./',self.location.href).href;
const AIRGAP_URL=ROOT+'__airgap__';

let airgap=null;

self.addEventListener('install',function(e){
  self.skipWaiting();
});

self.addEventListener('activate',function(e){
  e.waitUntil((async function(){
    const keys=await caches.keys();
    await Promise.all(keys.filter(function(k){return k!==PACK&&k!==FLAGS}).map(function(k){return caches.delete(k)}));
    await self.clients.claim();
  })());
});

/* ---------- airgap flag (persists in the flags cache) ---------- */
async function loadAirgap(){
  if(airgap!==null)return airgap;
  try{
    const c=await caches.open(FLAGS);
    airgap=!!(await c.match(AIRGAP_URL,{ignoreVary:true}));
  }catch(e){airgap=false}
  return airgap;
}
async function setAirgap(on){
  try{
    const c=await caches.open(FLAGS);
    if(on)await c.put(AIRGAP_URL,new Response('on',{headers:{'Content-Type':'text/plain'}}));
    else await c.delete(AIRGAP_URL);
  }catch(e){}
  airgap=!!on;
  return airgap;
}

/* ---------- messages from the page ---------- */
self.addEventListener('message',function(e){
  const d=e.data;
  if(!d||d.__sync!==true)return;
  if(d.type==='ping'){try{e.source.postMessage({__sync:true,type:'pong'})}catch(_){}return}
  if(d.type==='airgap'){
    e.waitUntil(setAirgap(!!d.on).then(function(state){
      try{e.source.postMessage({__sync:true,type:'airgapped',on:state})}catch(_){}
    }));
    return;
  }
  if(d.type==='start'){
    /* waitUntil keeps the worker alive for the WHOLE sync, fonts included */
    e.waitUntil(runSync(d.games||[],e.source,d.all||[]));
  }
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
function collectFontCss(text,set){
  const re=/https:\/\/fonts\.googleapis\.com\/css[^"'\s)]+/g;let m;
  while((m=re.exec(text)))set.add(m[0].replace(/&amp;/g,'&'));
}
/* keep only latin / latin-ext subsets — the ones a page actually renders */
function collectFontFiles(cssText,set){
  if(!cssText)return;
  let found=0;
  const blocks=cssText.split('/*');
  if(blocks.length>1){
    for(let i=1;i<blocks.length;i++){
      const b=blocks[i];
      const end=b.indexOf('*/');
      const label=(end>=0?b.slice(0,end):'').toLowerCase();
      if(label.indexOf('latin')!==-1){
        const re=/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;let m;
        while((m=re.exec(b))){const sz=set.size;set.add(m[1]);if(set.size>sz)found++}
      }
    }
  }
  if(found===0){
    const re=/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;let m;
    while((m=re.exec(cssText))){set.add(m[1])}
  }
}

async function runSync(games,client,all){
  const send=function(m){try{if(client)client.postMessage(Object.assign({__sync:true},m))}catch(_){}}
  const broadcast=async function(m){
    try{
      const cls=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const c of cls){try{c.postMessage(Object.assign({__sync:true},m))}catch(_){}}
    }catch(_){}
  };
  const cache=await caches.open(PACK);
  const failed=[],titles={};
  let changed=false,done=0;
  const total=games.length+1;

  const grab=async function(url){
    const res=await fetch(new Request(url,{cache:'reload'}));
    if(!res||!res.ok)throw new Error('HTTP '+(res&&res.status));
    return res;
  };
  const storeOne=async function(url){ /* download + compare + cache; text or null */
    try{
      const res=await grab(url);
      const text=await res.clone().text();
      let fileChanged=true;
      const old=await cache.match(url,{ignoreVary:true});
      if(old){try{fileChanged=(await old.clone().text())!==text}catch(_){fileChanged=true}}
      await cache.put(url,res);
      if(fileChanged)changed=true;
      return text;
    }catch(e){return null}
  };

  /* ---- PHASE 1: shell + all games, fully parallel ---- */
  const shellTask=(async function(){
    let text=null;
    try{
      const res=await grab(ROOT+'index.html');
      text=await res.clone().text();
      let shChanged=true;
      const old=await cache.match(ROOT+'index.html',{ignoreVary:true})||await cache.match(ROOT,{ignoreVary:true});
      if(old){try{shChanged=(await old.clone().text())!==text}catch(_){}}
      await cache.put(ROOT,res.clone());
      await cache.put(ROOT+'index.html',res);
      if(shChanged)changed=true;
    }catch(e){}
    done++;send({type:'progress',done:done,total:total});
    return text;
  })();

  const gameTasks=games.map(function(g){
    return (async function(){
      const text=await storeOne(g.url);
      if(text===null){failed.push(g.url)}
      else{
        const t=parseMeta(text);
        if(t)titles[g.url]=t;
      }
      done++;send({type:'progress',done:done,total:total});
      return text;
    })();
  });

  const texts=(await Promise.all([shellTask].concat(gameTasks))).filter(function(t){return !!t});

  /* games & shell synced — report immediately; fonts continue below */
  send({type:'done',changed:changed,failed:failed,titles:titles});

  /* ---- PHASE 2 (protected by waitUntil): fonts + manifest + icons ---- */
  try{
    const fontCss=new Set();
    for(const t of texts)collectFontCss(t,fontCss);

    /* skipped games: read their HTML from the pack — local, zero network */
    const dlSet={};
    games.forEach(function(g){dlSet[g.url]=1});
    for(const u of all){
      if(dlSet[u])continue;
      try{
        const hit=await cache.match(u,{ignoreVary:true});
        if(hit)collectFontCss(await hit.clone().text(),fontCss);
      }catch(e){}
    }

    const fontSet=new Set();
    await Promise.all(Array.from(fontCss).map(async function(cssUrl){
      let text='';
      const hit=await cache.match(cssUrl,{ignoreVary:true});
      if(hit){try{text=await hit.clone().text()}catch(_){}}
      else{
        try{
          const res=await fetch(new Request(cssUrl,{cache:'reload',mode:'cors'}));
          if(res&&res.ok){text=await res.clone().text();await cache.put(cssUrl,res)}
        }catch(e){}
      }
      if(text)collectFontFiles(text,fontSet);
    }));

    const needed=[];
    await Promise.all(Array.from(fontSet).map(async function(u){
      if(!(await cache.match(u,{ignoreVary:true})))needed.push(u);
    }));

    if(needed.length){
      let fDone=0;
      broadcast({type:'fonts',done:0,total:needed.length});
      await Promise.all(needed.map(async function(u){
        try{
          const r=await fetch(new Request(u,{cache:'reload',mode:'cors'}));
          if(r&&r.ok)await cache.put(u,r);
        }catch(e){}
        fDone++;
        broadcast({type:'fonts',done:fDone,total:needed.length});
      }));
    }

    try{
      const mUrl=ROOT+'manifest.json';
      if(!await cache.match(mUrl,{ignoreVary:true})){
        const r=await grab(mUrl);
        await cache.put(mUrl,r);
        const mj=JSON.parse(await r.clone().text());
        await Promise.all((mj.icons||[]).map(async function(ic){
          const iu=new URL(ic.src,ROOT).href;
          if(!await cache.match(iu,{ignoreVary:true})){
            try{const ir=await grab(iu);await cache.put(iu,ir)}catch(e){}
          }
        }));
      }
    }catch(e){}
  }catch(e){}
  /* fonts finished — tell the page to re-verify & light the READY chip */
  broadcast({type:'packdone'});
}

/* ---------- FETCH: cache-first, never revalidating.
   AIRGAP: on a miss, refuse the network and behave as offline. ---------- */
self.addEventListener('fetch',function(event){
  const req=event.request;
  if(req.method!=='GET')return;
  if(req.cache==='no-store')return;
  const url=new URL(req.url);
  const isFont=url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com';
  if(url.origin!==self.location.origin&&!isFont)return;

  event.respondWith((async function(){
    const cache=await caches.open(PACK);
    const cached=await cache.match(req,{ignoreVary:true});
    if(cached)return cached;
    if(await loadAirgap()){
      const isPage=req.mode==='navigate'||(req.headers.get('accept')||'').indexOf('text/html')!==-1;
      if(isPage){
        const shell=await cache.match(ROOT+'index.html',{ignoreVary:true})||await cache.match(ROOT,{ignoreVary:true});
        if(shell)return shell;
      }
      return new Response('AIRGAP — NETWORK BLOCKED',{status:503,headers:{'Content-Type':'text/plain'}});
    }
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