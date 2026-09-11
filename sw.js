/* ==========================================================================
   Syncra Task Scheduler - PWA Service Worker
   ========================================================================== */

const CACHE_NAME = 'syncra-planner-cache-v15';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=15',
  './app.js?v=15',
  './manifest.json',
  './icon.svg'
];

// Install Event - Pre-cache files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return Promise.all(ASSETS_TO_CACHE.map(asset =>
        cache.add(asset).catch(error => console.warn('[Service Worker] Skipping unavailable asset:', asset, error))
      ));
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

// Fetch Event - Network First with Cache Fallback
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (error) {
    data = { body: e.data ? e.data.text() : 'You have a scheduled reminder.' };
  }
  e.waitUntil(self.registration.showNotification(data.title || 'Syncra Reminder', {
    body: data.body || 'You have a scheduled reminder.',
    icon: './icon.svg',
    badge: './icon.svg',
    requireInteraction: true,
    tag: data.eventId || 'syncra-reminder',
    data: { url: data.url || './index.html', eventId: data.eventId }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    const existing = clientList.find(client => 'focus' in client);
    if (existing) return existing.focus();
    return clients.openWindow(e.notification.data.url);
  }));
});
