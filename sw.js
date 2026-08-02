/* ==========================================================================
   Syncra Task Scheduler - PWA Service Worker
   ========================================================================== */

const CACHE_NAME = 'chronos-planner-cache-v8';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=8',
  './app.js?v=8',
  './manifest.json',
  './icon.svg',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap'
];

// Install Event - Pre-cache files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Serve Cache First, fallback to Network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Cache newly fetched assets dynamically (optional, but keep it simple for now)
        return networkResponse;
      });
    }).catch(() => {
      // Offline fallback handling (if requested HTML document, return cached index)
      if (e.request.headers.get('accept').includes('text/html')) {
        return caches.match('./index.html');
      }
    })
  );
});
