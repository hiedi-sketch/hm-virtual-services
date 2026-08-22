// Deliberately caches nothing: it exists so browsers treat this as an
// installable app. Every request goes straight to the network, so there is no
// stale build to clear after a deploy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
