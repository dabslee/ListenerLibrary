// static/js/service-worker.js

const CACHE_NAME = 'listener-library-v1';
const OFFLINE_TRACKS_CACHE_NAME = 'offline-tracks-v1';
const APP_SHELL_URLS = [
    '/',
    '/static/css/styles.css',
    '/static/js/player.js',
    // Add other essential static assets here
];

self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Service Worker: Caching app shell');
            return cache.addAll(APP_SHELL_URLS);
        })
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_TRACKS_CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // Cache hit - return response
            if (response) {
                return response;
            }

            // Clone the request because it's a stream and can only be consumed once
            const fetchRequest = event.request.clone();

            return fetch(fetchRequest).then(response => {
                // Check if we received a valid response
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // IMPORTANT: Clone the response. A response is a stream
                // and because we want the browser to consume the response
                // as well as the cache consuming the response, we need
                // to clone it so we have two streams.
                const responseToCache = response.clone();

                // We don't want to cache everything, just the app shell.
                // Dynamic content and API calls should not be cached here.
                if (APP_SHELL_URLS.includes(event.request.url)) {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }

                return response;
            });
        })
    );
});

self.addEventListener('message', event => {
    if (event.data.action === 'cache-track') {
        const trackUrl = event.data.url;
        caches.open(OFFLINE_TRACKS_CACHE_NAME).then(cache => {
            cache.add(trackUrl).then(() => {
                event.source.postMessage({
                    status: 'success',
                    url: trackUrl
                });
            }).catch(() => {
                 event.source.postMessage({
                    status: 'error',
                    url: trackUrl
                });
            });
        });
    } else if (event.data.action === 'delete-track') {
        const trackUrl = event.data.url;
        caches.open(OFFLINE_TRACKS_CACHE_NAME).then(cache => {
            cache.delete(trackUrl).then(wasDeleted => {
                 event.source.postMessage({
                    status: wasDeleted ? 'success' : 'error',
                    url: trackUrl
                });
            })
        })
    }
});
