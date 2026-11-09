// Offline-välimuisti. Nosta VERSION aina kun julkaiset muutoksia.
const VERSION = 'sali-v8';
const ASSETS = ['./', 'index.html', 'style.css', 'theme.css', 'weight-input.css', 'app.js', 'enhancements.js', 'analytics.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'fonts/barlow-condensed-500.woff2', 'fonts/barlow-condensed-600.woff2', 'fonts/barlow-condensed-700.woff2', 'fonts/barlow-condensed-800.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Verkko ensin (päivitykset tulevat heti kun yhteys on), välimuisti varalla.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
