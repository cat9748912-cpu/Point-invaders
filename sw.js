// Bump this string on every deploy. activate() deletes every cache that isn't
// the current one, so changing it is what evicts the previous version's files
// from returning players' devices.
const CACHE = 'point-invaders-v2';

// Relative so this works both at the domain root and under /Point-invaders/.
// Just the three real files — the icon and the manifest are built inside
// index.html as data: URIs, so there is nothing else to fetch or cache.
const SHELL = [
  './',
  './index.html',
  './app.js',
  './style.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll is atomic: one 404 would throw away the whole precache, and the
      // shell is fetched again on demand anyway, so failures are tolerated here.
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Realtime Database traffic and auth must never be served from a cache — a
// stale leaderboard or a replayed token is worse than being offline.
const BYPASS = /firebaseio\.com|googleapis\.com|google-analytics|gstatic\.com\/firebasejs|identitytoolkit/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || BYPASS.test(req.url)) return;

  const sameOrigin = new URL(req.url).origin === self.location.origin;

  // Navigations: network first so a deploy is picked up, cache as the fallback
  // that makes the game playable on a dead connection.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // The three shell files are ONE unit: index.html declares the elements that
  // app.js binds to. Serving a cached app.js against a freshly fetched page (or
  // the reverse) is a version skew that crashes on the first missing element,
  // so the shell is network-first and only falls back to cache when genuinely
  // offline — where all three then come from the same cache generation.
  const path = new URL(req.url).pathname;
  const isShell = sameOrigin && /\/(index\.html|app\.js|style\.css)$/.test(path);

  if (isShell) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else (fonts, and anything added later): cache first, refreshed
  // in the background — none of it is coupled to the app's own version.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok && (sameOrigin || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
