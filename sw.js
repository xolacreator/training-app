const CACHE = 'rev10';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.add('./').catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    // Network-first, bypassing the browser HTTP cache so a fresh deploy reaches the
    // device on the next load. GitHub Pages sets max-age=600, which otherwise served
    // a stale index.html for ~10 min even with a "network-first" fetch.
    e.respondWith(
      fetch(e.request.url, { cache: 'no-store' })
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./', cp)); return r; })
        .catch(() => caches.match('./'))
    );
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      for (const w of ws) {
        if ('focus' in w) return w.focus();
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});
