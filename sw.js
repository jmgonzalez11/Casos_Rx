/* Service worker: guarda la app para usarla sin conexión.
   Sube CACHE (v2, v3…) cada vez que publiques cambios en los archivos. */
const CACHE = 'casos-rad-v2';
const SHELL = ['./', './index.html', './styles.css', './app.js', './taxonomia.js', './temario.js', './manifest.webmanifest',
  './vendor/pdfjs/pdf.min.mjs', './vendor/pdfjs/pdf.worker.min.mjs',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Solo archivos propios (GET, mismo origen). Las llamadas a Apps Script (POST) nunca pasan por la caché.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }       // rápido y offline; se actualiza en segundo plano
    const res = await network;
    if (res) return res;
    return (req.mode === 'navigate' && (await cache.match('./index.html'))) || Response.error();
  }));
});
