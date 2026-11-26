// VR Cricket League service worker: fast app shell, an offline page, and match alerts on the phone.
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const MAX_ASSETS = 150;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.json', '/icons/icon-192.png'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const offlinePage = () =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · VR Cricket League</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0b;color:#fafafa;font-family:system-ui,sans-serif;text-align:center;padding:24px}
.c{max-width:320px}h1{font-size:22px;margin:16px 0 8px}p{color:#a1a1aa;line-height:1.5}button{margin-top:16px;padding:12px 20px;border-radius:8px;border:1px solid #e31837;background:#e31837;color:#fff;font-weight:600;font-size:15px}</style></head>
<body><div class="c"><img src="/icons/icon-192.png" width="72" height="72" alt=""><h1>You're offline</h1><p>Check your connection, then try again. Your matches and scores are safe.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

async function trim(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // The API lives on another host and is never cached, so scores and matches are always live.
  if (url.origin !== self.location.origin) return;

  // Pages: always try the network first so a new deploy shows up at once; fall back when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || offlinePage()))
    );
    return;
  }

  // Built files have content hashes in their names, so a cached copy is always correct.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy).then(() => trim(ASSETS)));
            }
            return res;
          })
      )
    );
  }
});

// Match alerts sent by the server: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'VR Cricket League', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/my-tournaments' },
    })
  );
});

// Tapping an alert opens (or focuses) the app on the right page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/my-tournaments';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
