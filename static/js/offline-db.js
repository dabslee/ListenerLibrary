/*
 * offline-db.js
 * Shared IndexedDB helper for offline track support.
 *
 * Loaded both in the page (via <script>) and inside the service worker
 * (via importScripts). It attaches an `OfflineDB` object to the global
 * scope (`window` in the page, `self` in the worker).
 *
 * Two object stores are used:
 *   - "tracks": lightweight metadata for each saved track, keyed by track id.
 *   - "audio":  the audio Blob for each saved track, keyed by a normalized
 *               stream-URL path so the service worker can look it up quickly.
 */
(function (global) {
    'use strict';

    const DB_NAME = 'listenerlibrary-offline';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise(function (resolve, reject) {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function (event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tracks')) {
                    db.createObjectStore('tracks', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('audio')) {
                    db.createObjectStore('audio', { keyPath: 'key' });
                }
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    }

    function promisifyRequest(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    }

    // Normalize a stream URL (absolute or relative) to origin + pathname so the
    // same track resolves to the same cache key everywhere.
    function keyFor(streamUrl) {
        try {
            const url = new URL(streamUrl, global.location.origin);
            return url.origin + url.pathname;
        } catch (e) {
            return streamUrl;
        }
    }

    async function putTrack(track) {
        const db = await openDB();
        const store = db.transaction('tracks', 'readwrite').objectStore('tracks');
        return promisifyRequest(store.put(track));
    }

    async function getTrack(id) {
        const db = await openDB();
        const store = db.transaction('tracks', 'readonly').objectStore('tracks');
        return promisifyRequest(store.get(id));
    }

    async function getTracks() {
        const db = await openDB();
        const store = db.transaction('tracks', 'readonly').objectStore('tracks');
        const result = await promisifyRequest(store.getAll());
        return result || [];
    }

    async function putAudio(key, blob, contentType) {
        const db = await openDB();
        const store = db.transaction('audio', 'readwrite').objectStore('audio');
        return promisifyRequest(store.put({ key: key, blob: blob, contentType: contentType }));
    }

    async function getAudio(key) {
        const db = await openDB();
        const store = db.transaction('audio', 'readonly').objectStore('audio');
        return promisifyRequest(store.get(key));
    }

    async function deleteTrack(id, key) {
        const db = await openDB();
        await new Promise(function (resolve, reject) {
            const tx = db.transaction(['tracks', 'audio'], 'readwrite');
            tx.objectStore('tracks').delete(id);
            if (key) {
                tx.objectStore('audio').delete(key);
            }
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    global.OfflineDB = {
        openDB: openDB,
        keyFor: keyFor,
        putTrack: putTrack,
        getTrack: getTrack,
        getTracks: getTracks,
        putAudio: putAudio,
        getAudio: getAudio,
        deleteTrack: deleteTrack,
    };
})(self);
