// Bump this string on every deploy. activate() deletes every cache that isn't
// the current one, so changing it is what evicts the previous version's files
// from returning players' devices.
const CACHE = 'point-invaders-v7';

// Relative so this works both at the domain root and under /Point-invaders/.
// Just the three real files — the icon and the manifest are built inside
// index.html as data: URIs, so there is nothing else to fetch or cache.
const SHELL = [
  './',
  './index.html',
  './app.js',
  './style.css'
];

// The Firebase SDK. These are immutable, version-pinned library files, NOT live
// data — and without them offline there is no `firebase` global at all, so
// initializeApp() throws and the player lands on an auth screen whose buttons
// do nothing. Precached with no-cors: the responses come back opaque, which is
// fine to store and replay for a plain <script src>.
const VENDOR = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Tolerated failures: addAll is atomic, and one unreachable CDN file
      // would throw away the whole precache. Anything missed here is picked up
      // by the fetch handler on first use instead.
      .then(c => Promise.allSettled([
        ...SHELL.map(u => c.add(u)),
        ...VENDOR.map(u =>
          fetch(new Request(u, { mode: 'no-cors', cache: 'reload' }))
            .then(r => c.put(u, r))
        )
      ]))
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

// Live traffic only. A stale leaderboard or a replayed auth token is worse than
// being offline, so none of this is ever cached. Note the RTDB host is
// *.firebasedatabase.app for this project, not the older firebaseio.com.
const BYPASS = /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken|google-analytics/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || BYPASS.test(req.url)) return;

  const sameOrigin = new URL(req.url).origin === self.location.origin;

  // Navigations: network first so a deploy is picked up, cache as the fallback
  // that makes the game reachable on a dead connection.
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

  // Everything else — the Firebase SDK and Google Fonts: cache first, refreshed
  // in the background. None of it is coupled to the app's own version, and the
  // SDK URLs are version-pinned, so a stale copy is still a correct copy.
  // Opaque responses report status 0, so res.ok is false for them by design;
  // they still have to be storable or the CDN files could never be cached.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
