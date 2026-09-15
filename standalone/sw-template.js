const VERSION=__VERSION__;
const FILES=__FILES__;
const BASE=new URL(".",self.location.href);
const PREFIX="signal-mirror-"+encodeURIComponent(BASE.pathname)+"-";
const CACHE=PREFIX+VERSION;
const URLS=FILES.map(file=>new URL(file,BASE).href);
self.addEventListener("install",event=>event.waitUntil((async()=>{
  try{const cache=await caches.open(CACHE);await cache.addAll(URLS.map(url=>new Request(url,{cache:"reload"})));}
  catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("message",event=>{
  if(event.data==="ACTIVATE")self.skipWaiting();
  if(event.data==="STATUS")event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const ready=(await cache.keys()).length===URLS.length;
    event.ports[0]?.postMessage({ready,version:VERSION});
  })());
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  const target=event.request.mode==="navigate"?new URL("index.html",BASE).href:url.href;
  if(!URLS.includes(target))return;
  event.respondWith((async()=>{
    const cached=await (await caches.open(CACHE)).match(target);
    return cached||fetch(event.request);
  })());
});
