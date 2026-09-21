const CACHE_NAME = 'indamora-play-public-v1';
const PUBLIC_ASSETS = [
  '/favicon.png',
  '/favicon.svg',
  '/assets/indamora-play-logo.png',
  '/assets/indamora-play-mark.png',
  '/assets/indamora-play-icon-192.png',
  '/assets/indamora-play-icon-512.png',
  '/assets/indamora-play-apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PUBLIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('indamora-play-public-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET'
    || url.origin !== self.location.origin
    || url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/objects/')
    || url.pathname.startsWith('/admin')
    || url.pathname.startsWith('/administration')
    || url.pathname.startsWith('/moderation')
    || url.pathname.startsWith('/espace-artiste')
  ) {
    return;
  }

  if (PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
  }
});