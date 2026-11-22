/* Splitbox service worker.
 *
 * Goal: every launch/refresh shows the LATEST deployed version when online, and the last
 * version you opened when offline. No "update" button needed.
 *
 * - The page (HTML) is network-first: online → always fresh from the server; offline or a very
 *   slow network → the last saved copy.
 * - JS/CSS/icons are precached (file names contain a content hash, so they never go stale).
 * - A new service worker activates immediately (skipWaiting + clientsClaim).
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

const PAGE_CACHE = 'pages';
const PAGE_KEY = '/index.html';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Hashed build assets for offline use
precacheAndRoute(self.__WB_MANIFEST);

// Save the page that matches THIS version's assets, so an offline launch never pairs an old
// page with newer (or deleted) assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) =>
      fetch(PAGE_KEY, { cache: 'reload' })
        .then((res) => (res.ok ? cache.put(PAGE_KEY, res) : undefined))
        .catch(() => undefined),
    ),
  );
});

// All app routes (/, /t/CODE, …) are the same single page, so store them under one key.
// That way even a trip link you never opened before still works offline.
const sameKey = { cacheKeyWillBeUsed: async () => PAGE_KEY };
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: PAGE_CACHE, networkTimeoutSeconds: 5, plugins: [sameKey] }),
  ),
);

// Safety net: hashed assets referenced by a freshly fetched page before this worker has updated
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'assets',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);
