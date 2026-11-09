const CACHE_NAME = 'bipin-petroleum-v5';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/bpc_logo.svg',
  '/index.tsx',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Geologica:wght@300;400;500;600;700&family=Georama:ital,wght@0,300..700;1,300..700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching app shell assets...');
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const req = new Request(url, { cache: 'reload' });
            const res = await fetch(req);
            if (res && (res.status === 200 || res.type === 'opaque')) {
              await cache.put(req, res);
            }
          } catch (e) {
            try {
              const req = new Request(url, { mode: 'no-cors' });
              const res = await fetch(req);
              if (res) {
                await cache.put(req, res);
              }
            } catch (err) {
              console.warn('[SW] Pre-cache failed for:', url, err);
            }
          }
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // Skip Supabase backend REST and Auth API calls so JS layer handles offline mode via IndexedDB
  if (
    url.hostname.includes('supabase') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/')
  ) {
    return;
  }

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));

  if (isNavigation) {
    // Navigation Request: Try network first, fallback to cached index.html
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
            cache.put('/index.html', networkResponse.clone());
            cache.put('/', networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          console.log('[SW] Network navigation failed, serving cached app shell...');
          const cachedHtml =
            (await caches.match(request)) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'));
          if (cachedHtml) {
            return cachedHtml;
          }
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Bipin Petroleum Co.</title></head><body><div id="root"></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }

  // Static Assets / JS / CSS / Fonts / Images / Scripts
  event.respondWith(
    (async () => {
      // 1. Try exact match in cache first
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        // Opportunistic background update if online
        if (navigator.onLine) {
          fetch(request).then(async (netRes) => {
            if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(request, netRes);
            }
          }).catch(() => {});
        }
        return cachedResponse;
      }

      // 2. Fetch from network and store in cache
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // Fallback check without query params
        const urlWithoutQuery = request.url.split('?')[0];
        const matchNoQuery = await caches.match(urlWithoutQuery);
        if (matchNoQuery) {
          return matchNoQuery;
        }

        // Return appropriate content type for JS/CSS scripts so syntax errors are not thrown
        const isJs =
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.tsx') ||
          url.pathname.endsWith('.ts') ||
          url.pathname.endsWith('.jsx');

        if (isJs) {
          return new Response(`console.warn("[SW] Asset not cached offline: ${request.url}");`, {
            headers: { 'Content-Type': 'application/javascript' }
          });
        }

        return new Response('Asset not available offline', {
          status: 503,
          statusText: 'Offline Asset Unavailable'
        });
      }
    })()
  );
});
