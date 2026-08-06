/* Service Worker do app "Meus Treinos"
   Objetivo: abrir instantaneamente e funcionar offline.
   Estratégia: stale-while-revalidate — responde do cache na hora (rápido)
   e, em 2º plano, baixa a versão nova e guarda pro próximo abrir. */
const CACHE = "treino-v1";
const ASSETS = ["./", "./index.html"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                 // só GET
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // deixa a API do GitHub (nuvem) passar direto pela rede
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || fetch(req);
  })());
});
