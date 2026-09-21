// KyaPehnu Progressive Web App Service Worker (v2.0.0)
// Optimized for fast image loading on PWA re-opens
const CACHE_NAME = 'kyapehnu-cache-v4';
const IMAGE_CACHE_NAME = 'kyapehnu-images-v1';
const MAX_IMAGE_CACHE_ITEMS = 500;

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/kyapehnu-icon.png',
  '/icon-192x192.png',
  '/icon-384x384.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
];

// Install event - precache core static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[KyaPehnu SW] Pre-cache non-fatal error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event - clean up older caches
self.addEventListener('activate', (event) => {
  const VALID_CACHES = [CACHE_NAME, IMAGE_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!VALID_CACHES.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: trim image cache to MAX_IMAGE_CACHE_ITEMS (LRU eviction)
async function trimImageCache() {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGE_CACHE_ITEMS) {
    // Delete oldest entries (FIFO since Cache API preserves insertion order)
    const excess = keys.length - MAX_IMAGE_CACHE_ITEMS;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// Helper: is this a cacheable image request?
function isImageRequest(url) {
  // Local static images & icons
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|avif|ico|woff2)$/i)) return true;
  // Next.js optimized image endpoint (/_next/image?url=...&w=...&q=...)
  if (url.pathname === '/_next/image') return true;
  // Cloudinary hosted images
  if (url.hostname === 'res.cloudinary.com') return true;
  // Next.js static build assets
  if (url.pathname.startsWith('/_next/static/')) return true;
  return false;
}

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests or chrome-extension schemes
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  // ── Image requests: Stale-While-Revalidate ──
  // Serves cached version instantly, then refreshes cache in background
  if (isImageRequest(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        
        // Background revalidation: fetch fresh copy and update cache
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
            // Trim cache asynchronously
            trimImageCache();
          }
          return networkResponse;
        }).catch(() => {
          // Network failed — cached version (if any) was already returned
          return cachedResponse;
        });

        // Return cached immediately, or wait for network if no cache
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // ── API data requests: skip caching (keep fresh) ──
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // ── Page navigation & other: Network-first with cache fallback ──
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // If navigating to a page offline, return the cached root shell
        if (request.mode === 'navigate') {
          return caches.match('/');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
