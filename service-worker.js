const CACHE_NAME = 'tashachatz-skel-v4.2.4';
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => {
    if (k !== CACHE_NAME) return caches.delete(k);
  }))));
});
