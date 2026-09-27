/* Service worker: guarda la app para usarla sin conexión.
   Sube CACHE (v3, v4…) y APP_VERSION en app.js cada vez que publiques cambios. */
const CACHE = 'casos-rad-v7';
const SHELL = ['./', './index.html', './styles.css', './app.js', './theme.js', './taxonomia.js', './temario.js', './manifest.webmanifest',
  './vendor/pdfjs/pdf.min.mjs', './vendor/pdfjs/pdf.worker.min.mjs',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
// cache: 'reload' evita que se guarde una copia vieja desde la caché HTTP del navegador
const fresh = u => fetch(new Request(u, { cache: 'reload' }));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await Promise.all(SHELL.map(async u => { const r = await fresh(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); await c.put(u, r); }));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* «Buscar actualizaciones»: vuelve a descargar todos los archivos y avisa si alguno cambió.
   Cubre el caso en que se publicaron archivos nuevos sin cambiar este sw.js. */
function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
async function refreshShell() {
  const cache = await caches.open(CACHE);
  const got = await Promise.all(SHELL.map(async u => {
    const r = await fresh(u);
    if (!r.ok) throw new Error(`No se pudo descargar ${u} (${r.status})`);
    return [u, r];
  }));
  let changed = false;
  for (const [u, r] of got) {               // se guarda todo solo si todo se descargó bien: nunca queda una mezcla de versiones
    const old = await cache.match(u);
    const nb = await r.clone().arrayBuffer();
    if (!old || !sameBytes(await old.arrayBuffer(), nb)) changed = true;
    await cache.put(u, r);
  }
  return changed;
}
self.addEventListener('message', e => {
  const port = e.ports && e.ports[0];
  if (!e.data || !port) return;
  if (e.data.type === 'skip') { self.skipWaiting(); port.postMessage({ ok: true }); return; }
  if (e.data.type === 'refresh')
    e.waitUntil(refreshShell().then(changed => port.postMessage({ changed }), err => port.postMessage({ error: err.message || String(err) })));
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
