/* =====================================================================
   Renal (KUB) Assessment Mastery — Service Worker
   Version: 3.1.0
   =====================================================================

   INSTRUCTOR INSTRUCTIONS:
   When you update the app, change ONLY the APP_VERSION below.
   Students will automatically get the new version on next open.

   - Small fix (typo, color)     → 3.1.1
   - New quiz question           → 3.1.2
   - New unit or feature         → 3.2.0
   - Major overhaul              → 4.0.0
   ===================================================================== */

const APP_VERSION = '3.1.0';

const CACHE_NAME    = `kub-mastery-v${APP_VERSION}`;
const RUNTIME_CACHE = `kub-mastery-runtime-v${APP_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './about.html',
  './instructor-dashboard.html',
  './gradebook.html',
  './manifest.json',
  './icon.svg',
];

/* 1. INSTALL */
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing v${APP_VERSION}...`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] Skipped precache for ${url}:`, err.message))
        )
      ))
      .then(() => {
        console.log('[SW] Precache complete. Activating immediately.');
        return self.skipWaiting();
      })
      .catch((err) => console.error('[SW] Precache failed:', err))
  );
});

/* 2. ACTIVATE */
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating v${APP_VERSION}...`);
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => console.log('[SW] Activation complete.'))
  );
});

/* 3. FETCH */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // --- CASE A: Cross-origin (Google Apps Script, CDNs, fonts) ---
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone).catch(() => {}));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            if (url.hostname.includes('script.google.com')) {
              return new Response(
                JSON.stringify({ success: false, error: 'Offline — unable to reach backend' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              );
            }
            return new Response('', { status: 504 });
          });
        })
    );
    return;
  }

  // --- CASE B: Same-origin HTML (stale-while-revalidate) ---
  if (request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone).catch(() => {}));
            }
            return response;
          })
          .catch(() => cached || caches.match('./index.html'));
        return cached || networkFetch;
      })
    );
    return;
  }

  // --- CASE C: Same-origin assets (CSS/JS/images) ---
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                return caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
              }
            })
            .catch(() => {})
        );
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone).catch(() => {}));
          return response;
        })
        .catch(() => {
          if (request.destination === 'document') return caches.match('./index.html');
          return new Response('', { status: 504 });
        });
    })
  );
});

/* 4. MESSAGE */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Activating new version now.');
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: APP_VERSION });
  }
});

console.log(`[SW] Renal Mastery SW loaded — v${APP_VERSION}`);
