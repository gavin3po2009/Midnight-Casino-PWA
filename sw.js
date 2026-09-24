/* sw.js — OMNILAUNCHER offline sync engine (build 9)
   • A: preconnect/dns-prefetch hints stripped from every cached page.
   • D: Google Fonts fully localized — cached HTML & CSS rewritten to
     /__gf__/... pack paths; woff2 stored under local keys. No Google
     URL, request, or socket after the first sync.
   • Sync held open with waitUntil; AIRGAP blocks all network on miss. */
const CODE_VERSION='omnilauncher-sync-v4';
const PACK='omnilauncher-pack';
const FLAGS='omnilauncher-flags';
const ROOT=new URL('./',self.location.href).href;
const AIRGAP_URL=ROOT+'__airgap__';
const GF='https://fonts.googleapis.com/css2?';

let airgap=null;

self.addEventListener('install',function(e){
  self.skipWaiting();
});

self.addEventListener('activate',function(e){
  e.waitUntil((async function(){
    const keys=await caches.keys();
    await Promise.all(keys.filter(function(k){return k!==PACK&&k!==FLAGS}).map(function(k){return caches.delete(k)}));
    /* purge old-format (Google-URL) font entries from earlier builds */
    try{
      const pack=await caches.open(PACK);
      const entries=await pack.keys();
      await Promise.all(entries.filter(function(r){
        const u=String(r.url);
        return u.indexOf('https://fonts.googleapis.com')===0||u.indexOf('https://fonts.gstatic.com')===0;
      }).map(function(r){return pack.delete(r)}));
    }catch(e2){}
    await self.clients.claim();
  })());
});

/* ---------- airgap flag ---------- */
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

/* ---------- messages ---------- */
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
    e.waitUntil(runSync(d.games||[],e.source,d.all||[]));
  }
});

/* ---------- local font paths (D) ---------- */
function cssLocalKey(query){return ROOT+'__gf__/css2?'+query}
function cssGoogleUrl(query){return GF+query}
function wLocalKey(gurl){return ROOT+'__gf__/w/'+encodeURIComponent(gurl)}

/* A + D: strip preconnect hints, point font CSS at local pack paths */
function sanitizeHtml(text){
  if(!text)return text;
  let t=text;
  t=t.replace(/<link[^>]*rel=["'][^"']*(?:preconnect|dns-prefetch)[^"']*["'][^>]*>/gi,'');
  t=t.split('https://fonts.googleapis.com/css2?').join('/__gf__/css2?');
  return t;
}
/* D: point font files inside CSS at local pack paths */
function sanitizeCss(text){
  if(!text)return text;
  return text.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/g,function(m,u){
    return 'url(/__gf__/w/'+encodeURIComponent(u)+')';
  });
}
/* collect css2 queries from HTML (handles both Google and local form) */
function collectCssQueries(text,set){
  const re=/((?:https:\/\/fonts\.googleapis\.com|\/__gf__)\/css2\?[^"'\s)]+)/g;let m;
  while((m=re.exec(text))){
    const s=m[1];
    set.add(s.slice(s.indexOf('css2?')+5).replace(/&amp;/g,'&'));
  }
}
/* collect font-file URLs from CSS (both forms; latin/latin-ext subsets) */
function fontUrlsIn(cssText){
  const out=[];
  if(!cssText)return out;
  const re=/url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)|url\(\/__gf__\/w\/([^)\s]+)\)/g;let m;
  while((m=re.exec(cssText))){
    if(m[1])out.push(m[1]);
    else if(m[2]){try{out.push(decodeURIComponent(m[2]))}catch(e){}}
  }
  return out;
}
function collectFontFiles(cssText,set){
  if(!cssText)return;
  let found=0;
  const scan=function(seg){
    for(const u of fontUrlsIn(seg)){const sz=set.size;set.add(u);if(set.size>sz)found++}
  };
  const blocks=cssText.split('/*');
  if(blocks.length>1){
    for(let i=1;i<blocks.length;i++){
      const b=blocks[i];
      const end=b.indexOf('*/');
      const label=(end>=0?b.slice(0,end):'').toLowerCase();
      if(label.indexOf('latin')!==-1)scan(b);
    }
  }
  if(found===0)scan(cssText);
}

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
  const htmlHeaders={'Content-Type':'text/html; charset=utf-8'};

  const grab=async function(url){
    const res=await fetch(new Request(url,{cache:'reload'}));
    if(!res||!res.ok)throw new Error('HTTP '+(res&&res.status));
    return res;
  };
  const storeOne=async function(url){ /* fetch → sanitize → compare → store */
    try{
      const res=await grab(url);
      const raw=await res.clone().text();
      const text=sanitizeHtml(raw);
      let fileChanged=true;
      const old=await cache.match(url,{ignoreVary:true});
      if(old){try{fileChanged=(await old.clone().text())!==text}catch(_){fileChanged=true}}
      await cache.put(url,new Response(text,{headers:htmlHeaders}));
      if(fileChanged)changed=true;
      return text;
    }catch(e){return null}
  };

  /* ---- PHASE 1: shell + all games, parallel ---- */
  const shellTask=(async function(){
    let text=null;
    try{
      const res=await grab(ROOT+'index.html');
      const raw=await res.clone().text();
      text=sanitizeHtml(raw);
      let shChanged=true;
      const old=await cache.match(ROOT+'index.html',{ignoreVary:true})||await cache.match(ROOT,{ignoreVary:true});
      if(old){try{shChanged=(await old.clone().text())!==text}catch(_){}}
      await cache.put(ROOT,new Response(text,{headers:htmlHeaders}));
      await cache.put(ROOT+'index.html',new Response(text,{headers:htmlHeaders}));
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

  send({type:'done',changed:changed,failed:failed,titles:titles});

  /* ---- PHASE 2 (waitUntil-protected): local fonts + migration ---- */
  try{
    const queries=new Set();
    for(const t of texts)collectCssQueries(t,queries);

    /* skipped games: migrate their cached HTML locally — zero network */
    const dlSet={};
    games.forEach(function(g){dlSet[g.url]=1});
    for(const u of all){
      if(dlSet[u])continue;
      try{
        const hit=await cache.match(u,{ignoreVary:true});
        if(!hit)continue;
        const raw=await hit.clone().text();
        if(raw.indexOf('fonts.googleapis.com/css2?')!==-1||/(preconnect|dns-prefetch)/i.test(raw)){
          await cache.put(u,new Response(sanitizeHtml(raw),{headers:htmlHeaders}));
        }
        collectCssQueries(raw,queries);
      }catch(e){}
    }

    /* CSS: fetch once from Google, store rewritten under local keys */
    const wurls=new Set();
    await Promise.all(Array.from(queries).map(async function(q){
      const lk=cssLocalKey(q);
      let text='';
      const hit=await cache.match(lk,{ignoreVary:true});
      if(hit){try{text=await hit.clone().text()}catch(_){}}
      else{
        try{
          const res=await fetch(new Request(cssGoogleUrl(q),{cache:'reload',mode:'cors'}));
          if(res&&res.ok){
            const orig=await res.clone().text();
            await cache.put(lk,new Response(sanitizeCss(orig),{headers:{'Content-Type':'text/css'}}));
            text=orig; /* collect file urls from the original form */
          }
        }catch(e){}
      }
      if(text)collectFontFiles(text,wurls);
    }));

    const needed=[];
    await Promise.all(Array.from(wurls).map(async function(u){
      const lk=wLocalKey(u);
      if(!(await cache.match(lk,{ignoreVary:true})))needed.push({u:u,lk:lk});
    }));

    if(needed.length){
      let fDone=0;
      broadcast({type:'fonts',done:0,total:needed.length});
      await Promise.all(needed.map(async function(item){
        try{
          const r=await fetch(new Request(item.u,{cache:'reload',mode:'cors'}));
          if(r&&r.ok)await cache.put(item.lk,r);
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
  broadcast({type:'packdone'});
}

/* ---------- FETCH: cache-first, never revalidating.
   Google font requests are mapped to their local pack keys.
   AIRGAP refuses the network on any miss. ---------- */
self.addEventListener('fetch',function(event){
  const req=event.request;
  if(req.method!=='GET')return;
  if(req.cache==='no-store')return;
  const url=new URL(req.url);
  const sameOrigin=url.origin===self.location.origin;

  let localKey=null;
  if(sameOrigin&&url.pathname.indexOf('/__gf__/')===0){
    localKey=req.url;
  }else if(url.hostname==='fonts.googleapis.com'&&url.pathname==='/css2'){
    localKey=cssLocalKey(url.search.slice(1));
  }else if(url.hostname==='fonts.gstatic.com'){
    localKey=wLocalKey(url.href);
  }else if(!sameOrigin){
    return; /* GitHub API etc → network */
  }

  event.respondWith((async function(){
    const cache=await caches.open(PACK);
    const cached=await cache.match(localKey||req,{ignoreVary:true});
    if(cached)return cached;

    /* figure out the network source for a local-key miss */
    let netUrl=null,kind=null;
    if(localKey){
      if(localKey.indexOf('/__gf__/css2?')!==-1){
        netUrl=cssGoogleUrl(localKey.slice(localKey.indexOf('css2?')+5));
        kind='css';
      }else{
        try{netUrl=decodeURIComponent(localKey.slice(localKey.indexOf('/__gf__/w/')+10));kind='font'}catch(e){}
      }
    }

    if(await loadAirgap()){
      const isPage=req.mode==='navigate'||(req.headers.get('accept')||'').indexOf('text/html')!==-1;
      if(isPage){
        const shell=await cache.match(ROOT+'index.html',{ignoreVary:true})||await cache.match(ROOT,{ignoreVary:true});
        if(shell)return shell;
      }
      return new Response('AIRGAP — NETWORK BLOCKED',{status:503,headers:{'Content-Type':'text/plain'}});
    }

    try{
      if(netUrl){
        const fresh=await fetch(new Request(netUrl,{mode:'cors',cache:'reload'}));
        if(fresh&&fresh.ok){
          if(kind==='css'){
            const orig=await fresh.clone().text();
            const san=sanitizeCss(orig);
            await cache.put(localKey,new Response(san,{headers:{'Content-Type':'text/css'}}));
            return new Response(san,{headers:{'Content-Type':'text/css'}});
          }
          await cache.put(localKey,fresh.clone());
          return fresh;
        }
        return new Response('FONT MISS',{status:504,headers:{'Content-Type':'text/plain'}});
      }
      const fresh=await fetch(req);
      if(fresh&&(fresh.ok||fresh.type==='opaque')){
        const isPage=req.mode==='navigate'||(req.headers.get('accept')||'').indexOf('text/html')!==-1;
        if(isPage&&fresh.ok){
          try{
            const text=sanitizeHtml(await fresh.clone().text());
            const h={'Content-Type':'text/html; charset=utf-8'};
            await cache.put(req,new Response(text,{headers:h}));
            return new Response(text,{headers:h});
          }catch(e){return fresh}
        }
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