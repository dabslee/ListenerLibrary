{% load static %}
/*
 * ListenerLibrary service worker.
 *
 * Served from the site root (/sw.js) so its scope covers the whole origin.
 * Responsibilities:
 *   1. Precache the app shell (CSS/JS/logo + the offline Downloads page) so the
 *      site loads with no network.
 *   2. Serve audio for tracks the user has saved for offline listening straight
 *      from IndexedDB, honoring HTTP Range requests (required by iOS Safari).
 *   3. Serve cached track artwork and, as a last resort, the Downloads page for
 *      navigations that fail while offline.
 */
importScripts('{% static "js/offline-db.js" %}');

const VERSION = 'v1';
const SHELL_CACHE = 'll-shell-' + VERSION;
const MEDIA_CACHE = 'll-media-' + VERSION;

// Same-origin assets required for the app to boot offline.
const SHELL_ASSETS = [
    '{% url "downloads" %}',
    '{% static "css/style.css" %}',
    '{% static "css/themes.css" %}',
    '{% static "js/player.js" %}',
    '{% static "js/toasts.js" %}',
    '{% static "js/offline-db.js" %}',
    '{% static "js/offline.js" %}',
    '{% static "images/logo.png" %}',
];

// Cross-origin CDN assets (Bootstrap / Font Awesome). Cached best-effort; a
// failure here must not abort installation.
const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
];

const STREAM_RE = /^\/track\/\d+\/stream\/?$/;

self.addEventListener('install', function (event) {
    event.waitUntil((async function () {
        const cache = await caches.open(SHELL_CACHE);
        // Core assets must all cache for install to succeed.
        await cache.addAll(SHELL_ASSETS);
        // CDN assets are best-effort.
        await Promise.all(CDN_ASSETS.map(function (url) {
            return cache.add(url).catch(function () { /* ignore */ });
        }));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', function (event) {
    event.waitUntil((async function () {
        const keys = await caches.keys();
        await Promise.all(keys.map(function (key) {
            if (key !== SHELL_CACHE && key !== MEDIA_CACHE) {
                return caches.delete(key);
            }
        }));
        await self.clients.claim();
    })());
});

// Build a (possibly partial) Response for a saved audio Blob, honoring Range.
function buildAudioResponse(request, record) {
    const blob = record.blob;
    const total = blob.size;
    const contentType = record.contentType || blob.type || 'application/octet-stream';
    const rangeHeader = request.headers.get('range');

    if (!rangeHeader) {
        return new Response(blob, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(total),
                'Accept-Ranges': 'bytes',
            },
        });
    }

    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    let start = match ? parseInt(match[1], 10) : 0;
    let end = (match && match[2]) ? parseInt(match[2], 10) : total - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= total) end = total - 1;
    if (start > end) start = 0;

    const chunk = blob.slice(start, end + 1);
    return new Response(chunk, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': contentType,
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
        },
    });
}

async function handleAudio(request) {
    try {
        const url = new URL(request.url);
        const key = url.origin + url.pathname;
        const record = await self.OfflineDB.getAudio(key);
        if (record && record.blob) {
            return buildAudioResponse(request, record);
        }
    } catch (e) {
        // Fall through to the network on any lookup error.
    }
    return fetch(request);
}

// Cache-first for track artwork so saved tracks show their icon offline.
async function handleMedia(request) {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return cached || Response.error();
    }
}

// Network-first for page navigations, falling back to the cached page or the
// offline Downloads library.
async function handleNavigation(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        return await fetch(request);
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        const downloads = await cache.match('{% url "downloads" %}');
        if (downloads) return downloads;
        return new Response('You are offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
        });
    }
}

// Cache-first for shell assets (CSS/JS/logo, same-origin static + known CDN).
async function handleAsset(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return cached || Response.error();
    }
}

self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // Saved-track audio.
    if (sameOrigin && STREAM_RE.test(url.pathname)) {
        event.respondWith(handleAudio(request));
        return;
    }

    // Track artwork / uploaded media.
    if (sameOrigin && url.pathname.startsWith('/media/')) {
        event.respondWith(handleMedia(request));
        return;
    }

    // Page navigations.
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    // Static shell assets (same-origin /static/ and known CDN hosts).
    const isStatic = sameOrigin && url.pathname.startsWith('/static/');
    const isCdn = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com';
    if (isStatic || isCdn) {
        event.respondWith(handleAsset(request));
        return;
    }

    // Everything else (API calls, etc.) passes through untouched.
});
