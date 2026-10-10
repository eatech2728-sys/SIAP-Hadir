const CACHE_NAME = 'siap-hadir-v1';
const APP_SHELL = ['./', './index.html', './admin.html', './style.css', './app.js', './admin.js', './chat.js',
  './firebase-config.js', './manifest.json', './icon-192.png', './icon-512.png', './favicon-32.png'];
const BYPASS = ['script.google.com', 'script.googleusercontent.com', 'googleapis.com', 'firebaseio.com', 'firebasedatabase.app'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => Promise.allSettled(APP_SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (BYPASS.some(h => url.hostname.endsWith(h))) return;
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
