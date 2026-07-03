/*
 * offline.js
 * Client-side manager for offline track support.
 *
 * - Registers the service worker.
 * - Handles "Save for offline" / "Remove download" actions from track menus.
 * - Keeps offline indicators in sync as track lists are (re)rendered.
 * - Renders the offline library on the Downloads page.
 */
(function () {
    'use strict';

    const DB = self.OfflineDB;

    // ---- Service worker registration ----------------------------------------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (err) {
                console.error('Service worker registration failed:', err);
            });
        });
    }

    function toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // ---- Saving / removing tracks -------------------------------------------
    // Track ids currently being downloaded, to avoid double-clicks.
    const inFlight = new Set();

    async function saveTrackOffline(track, triggerEl) {
        const id = track.id;
        if (inFlight.has(id)) return;
        inFlight.add(id);
        setTriggerState(triggerEl, 'downloading');

        try {
            const key = DB.keyFor(track.stream_url);
            const response = await fetch(track.stream_url);
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
            const blob = await response.blob();

            await DB.putAudio(key, blob, contentType);
            await DB.putTrack({
                id: id,
                name: track.name,
                artist: track.artist || '',
                icon_url: track.icon_url || '',
                stream_url: track.stream_url,
                type: track.type || 'song',
                duration: track.duration || 0,
                size: blob.size,
                key: key,
                savedAt: Date.now(),
            });

            // Best-effort cache of the track artwork for offline display.
            if (track.icon_url && 'caches' in window) {
                try {
                    const iconResp = await fetch(track.icon_url, { mode: 'no-cors' });
                    const cache = await caches.open('ll-media-v1');
                    await cache.put(track.icon_url, iconResp);
                } catch (e) { /* artwork is optional */ }
            }

            toast('"' + track.name + '" saved for offline.', 'success');
            document.dispatchEvent(new CustomEvent('offlinetrackschanged'));
        } catch (err) {
            console.error('Failed to save track offline:', err);
            toast('Could not save "' + track.name + '" for offline.', 'error');
        } finally {
            inFlight.delete(id);
            await refreshOfflineIndicators();
        }
    }

    async function removeTrackOffline(id, name) {
        try {
            const existing = await DB.getTrack(id);
            const key = existing ? existing.key : null;
            await DB.deleteTrack(id, key);
            toast('Removed "' + (name || 'track') + '" from offline downloads.', 'success');
            document.dispatchEvent(new CustomEvent('offlinetrackschanged'));
        } catch (err) {
            console.error('Failed to remove offline track:', err);
            toast('Could not remove the offline download.', 'error');
        } finally {
            await refreshOfflineIndicators();
        }
    }

    // ---- Menu trigger wiring ------------------------------------------------
    function trackFromTrigger(el) {
        return {
            id: parseInt(el.dataset.trackId, 10),
            name: el.dataset.trackName || '',
            artist: el.dataset.trackArtist || '',
            icon_url: el.dataset.trackIcon || '',
            stream_url: el.dataset.streamUrl || '',
            type: el.dataset.trackType || 'song',
            duration: parseFloat(el.dataset.trackDuration || '0'),
        };
    }

    function setTriggerState(el, state) {
        if (!el) return;
        const label = el.querySelector('.offline-label');
        const icon = el.querySelector('i');
        if (state === 'downloading') {
            if (icon) icon.className = 'fas fa-spinner fa-spin me-2';
            if (label) label.textContent = 'Saving…';
            el.classList.add('disabled');
        } else if (state === 'saved') {
            if (icon) icon.className = 'fas fa-circle-check text-success me-2';
            if (label) label.textContent = 'Remove download';
            el.classList.remove('disabled');
            el.dataset.offlineState = 'saved';
        } else { // not saved
            if (icon) icon.className = 'fas fa-download me-2';
            if (label) label.textContent = 'Save for offline';
            el.classList.remove('disabled');
            el.dataset.offlineState = 'none';
        }
    }

    async function refreshOfflineIndicators() {
        const triggers = document.querySelectorAll('.offline-toggle');
        if (!triggers.length) return;
        let savedIds;
        try {
            const tracks = await DB.getTracks();
            savedIds = new Set(tracks.map(function (t) { return t.id; }));
        } catch (e) {
            return;
        }
        triggers.forEach(function (el) {
            const id = parseInt(el.dataset.trackId, 10);
            if (el.classList.contains('disabled')) return; // mid-download
            setTriggerState(el, savedIds.has(id) ? 'saved' : 'none');
        });
    }

    document.addEventListener('click', function (event) {
        const trigger = event.target.closest('.offline-toggle');
        if (!trigger) return;
        event.preventDefault();
        event.stopPropagation();
        if (trigger.classList.contains('disabled')) return;

        const track = trackFromTrigger(trigger);
        if (!track.id || !track.stream_url) return;

        if (trigger.dataset.offlineState === 'saved') {
            removeTrackOffline(track.id, track.name);
        } else {
            saveTrackOffline(track, trigger);
        }
    });

    // Keep indicators fresh as the track list is re-rendered via AJAX.
    function observeContainers() {
        ['track-list-container', 'playlist-item-list'].forEach(function (containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            const observer = new MutationObserver(function () {
                refreshOfflineIndicators();
            });
            observer.observe(container, { childList: true, subtree: true });
        });
    }

    // ---- Downloads (offline library) page rendering -------------------------
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const mm = (h > 0 && m < 10) ? '0' + m : String(m);
        const ss = s < 10 ? '0' + s : String(s);
        return (h > 0 ? h + ':' : '') + mm + ':' + ss;
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 MB';
        const mb = bytes / (1024 * 1024);
        if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
        return mb.toFixed(1) + ' MB';
    }

    async function renderDownloadsPage() {
        const listEl = document.getElementById('offline-track-list');
        const emptyEl = document.getElementById('offline-empty');
        const summaryEl = document.getElementById('offline-summary');
        if (!listEl) return;

        let tracks;
        try {
            tracks = await DB.getTracks();
        } catch (e) {
            tracks = [];
        }
        tracks.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });

        listEl.innerHTML = '';
        if (!tracks.length) {
            if (emptyEl) emptyEl.style.display = 'block';
            if (summaryEl) summaryEl.textContent = '';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        const totalSize = tracks.reduce(function (sum, t) { return sum + (t.size || 0); }, 0);
        if (summaryEl) {
            summaryEl.textContent = tracks.length + ' track' + (tracks.length === 1 ? '' : 's') +
                ' • ' + formatBytes(totalSize) + ' stored on this device';
        }

        tracks.forEach(function (track) {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.dataset.trackId = track.id;

            const iconHtml = track.icon_url
                ? '<img src="' + track.icon_url + '" alt="" style="width:50px;height:50px;border-radius:5px;object-fit:cover;" class="me-3" onerror="this.style.display=\'none\'">'
                : '<div class="bg-secondary me-3 d-flex align-items-center justify-content-center" style="width:50px;height:50px;border-radius:5px;"><i class="fas fa-music text-white"></i></div>';

            const info = document.createElement('div');
            info.className = 'd-flex align-items-center flex-grow-1';
            info.style.cursor = 'pointer';
            info.innerHTML = iconHtml +
                '<div><h6 class="mb-1">' + escapeHtml(track.name) +
                (track.type === 'podcast' ? ' <i class="fas fa-book ms-1 text-secondary"></i>' : '') +
                '</h6>' +
                (track.artist ? '<small class="text-muted">By ' + escapeHtml(track.artist) + '</small>' : '') +
                '<div><small class="text-muted">' + formatTime(track.duration) + ' • ' + formatBytes(track.size) + '</small></div>' +
                '</div>';
            info.addEventListener('click', function () {
                if (typeof window.playTrack === 'function') {
                    window.playTrack(track.stream_url, track.name, track.artist,
                        track.icon_url, track.id, track.type, 0, track.duration);
                }
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger ms-2';
            removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
            removeBtn.title = 'Remove download';
            removeBtn.addEventListener('click', function () {
                removeTrackOffline(track.id, track.name).then(renderDownloadsPage);
            });

            item.appendChild(info);
            item.appendChild(removeBtn);
            listEl.appendChild(item);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    // ---- Online / offline status banner -------------------------------------
    function updateOnlineStatus() {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;
        banner.style.display = navigator.onLine ? 'none' : 'block';
    }

    // ---- Init ----------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', function () {
        refreshOfflineIndicators();
        observeContainers();
        renderDownloadsPage();
        updateOnlineStatus();
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        document.addEventListener('offlinetrackschanged', function () {
            if (document.getElementById('offline-track-list')) {
                renderDownloadsPage();
            }
        });
    });

    // Expose for other scripts that re-render track lists.
    window.refreshOfflineIndicators = refreshOfflineIndicators;
})();
