/* global __SHELL__ */
const cacheKey="leonida-static-__REV__";
const shell=__SHELL__;
self.addEventListener("install",event=>{event.waitUntil(caches.open(cacheKey).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("leonida-static-")&&k!==cacheKey).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const {request}=event,url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin||/^\/(?:api|stream|audio)(?:\/|$)/.test(url.pathname)||request.headers.has("range"))return;
 if(request.mode==="navigate"){event.respondWith(fetch(request).catch(()=>caches.open(cacheKey).then(c=>c.match("/index.html"))));return;}
 if(shell.includes(url.pathname)||url.pathname.startsWith("/art/")||url.pathname.startsWith("/assets/")){
   event.respondWith(caches.open(cacheKey).then(async cache=>{const saved=await cache.match(request);if(saved)return saved;
     const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}));
 }
});
