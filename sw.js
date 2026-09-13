/* Service Worker do app "Meus Treinos"
   v2 (2026-09-13) — REDE PRIMEIRO, cache como rede de seguranca.

   Por que mudou: a versao anterior (stale-while-revalidate) respondia do cache na
   hora e baixava a versao nova "em 2o plano" — mas esse download nao estava dentro
   de e.waitUntil(), entao o iOS matava o Service Worker assim que o app saia da tela
   e o cache NUNCA era atualizado. Resultado: o app travava numa versao velha para
   sempre, e abrir/fechar varias vezes so piorava.

   Agora: tenta a rede primeiro (com timeout curto) e, se nao houver sinal, entrega o
   cache. Todo download fica dentro de e.waitUntil() para terminar mesmo que o app
   seja fechado no meio. */
const CACHE = "treino-v2";
const ASSETS = ["./", "./index.html"];
const NET_TIMEOUT = 2500;   // ms — academia sem sinal nao fica esperando

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));  // apaga treino-v1
    await self.clients.claim();
  })());
});

/* Baixa da rede furando o cache HTTP do Safari e so resolve DEPOIS de gravar no cache,
   para que o e.waitUntil() la embaixo segure o Service Worker vivo ate terminar. */
async function fromNet(req, cache) {
  const res = await fetch(req.url, { cache: "no-store" });
  if (res && res.ok) { try { await cache.put(req, res.clone()); } catch (err) {} }
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                 // so GET
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // API do GitHub (nuvem) passa direto pela rede

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let timer;
    const net = fromNet(req, cache).catch(() => null);
    const espera = new Promise(r => { timer = setTimeout(() => r(null), NET_TIMEOUT); });

    const res = await Promise.race([net, espera]);   // rede primeiro
    clearTimeout(timer);
    if (res) { e.waitUntil(net); return res; }

    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) { e.waitUntil(net); return cached; } // sem sinal: cache agora, baixa por tras pro proximo abrir

    return (await net) || Response.error();
  })());
});
