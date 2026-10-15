/* Service worker · Organizador Pedagógico
   - Precarga el «cascarón» de la app para que abra sin internet.
   - Mismo origen: red primero (así siempre ves la versión nueva) y caché si no hay conexión.
   - Google (Drive/Identity) nunca se cachea: pasa directo a la red.
   Al cambiar archivos de la app, sube el número de CACHE. */
const CACHE = 'organizador-v11';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/db.js', './js/ulid.js', './js/store.js', './js/ui.js', './js/drive.js',
  './js/config.js', './js/cloud.js', './js/sync.js', './js/dedupe.js',
  './js/views/banco.js', './js/views/recurso-form.js', './js/views/estructura.js',
  './js/views/planeacion.js', './js/views/ajustes.js', './js/views/inicio.js', './js/views/pronto.js',
  './fonts/inter-latin-wght-normal.woff2', './fonts/inter-latin-ext-wght-normal.woff2',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;   // Drive, Google, etc.: directo a la red
  e.respondWith(
    fetch(r)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
        return res;
      })
      .catch(() => caches.match(r, {ignoreSearch: true})
        .then(hit => hit || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
