/*
 * offline.js
 * Client-side manager for offline track support.
 *
 * - Registers the service worker.
 * - Handles "Save for offline" / "Remove download" actions from track menus.
 * - Handles whole-playlist save/remove via the playlist page button.
 * - Streams downloads so progress can be shown on track icons, in menus,
 *   on the playlist button, and on the Downloads page. Progress is also
 *   broadcast to other open tabs via BroadcastChannel.
 * - Keeps offline indicators (menu labels + icon badges) in sync as track
 *   lists are (re)rendered.
 * - Renders the offline library on the Downloads page.
 */
(function () {
    'use strict';

    const DB = self.OfflineDB;
    const MEDIA_CACHE_NAME = 'll-media'; // must match MEDIA_CACHE in sw.js

    // ---- Service worker registration ----------------------------------------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (err) {
                console.error('Service worker registration failed:', err);
            });
        });
    }

    function toast(message, type) {
        try {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type);
            }
        } catch (e) { /* toasts are best-effort */ }
    }

    // Write helpers that skip no-op DOM writes; the MutationObserver below
    // watches these containers, so unconditional writes would loop.
    function setText(el, text) {
        if (el && el.textContent !== text) el.textContent = text;
    }
    function setClass(el, cls) {
        if (el && el.className !== cls) el.className = cls;
    }

    // ---- Download progress registry ------------------------------------------
    // trackId -> { track, loaded, total, fraction, local, updatedAt }
    // `local` entries are downloads running in this page; remote entries mirror
    // downloads in other tabs (via BroadcastChannel).
    const progress = new Map();
    const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('ll-offline') : null;

    function broadcast(msg) {
        if (channel) {
            try { channel.postMessage(msg); } catch (e) { /* ignore */ }
        }
    }

    if (channel) {
        channel.onmessage = function (event) {
            const msg = event.data || {};
            if (msg.type === 'progress' && msg.track && msg.track.id != null) {
                progress.set(msg.track.id, {
                    track: msg.track,
                    loaded: msg.loaded,
                    total: msg.total,
                    fraction: msg.fraction,
                    local: false,
                    updatedAt: Date.now(),
                });
                renderProgressUI(msg.track.id);
            } else if (msg.type === 'end') {
                if (msg.id != null) {
                    const entry = progress.get(msg.id);
                    if (entry && !entry.local) {
                        progress.delete(msg.id);
                        renderProgressUI(msg.id);
                    }
                }
                if (msg.changed) {
                    refreshOfflineIndicators();
                    renderDownloadsPage();
                }
            }
        };
        // Drop remote entries that stopped updating (their tab was closed).
        setInterval(function () {
            const now = Date.now();
            progress.forEach(function (entry, id) {
                if (!entry.local && now - entry.updatedAt > 15000) {
                    progress.delete(id);
                    renderProgressUI(id);
                }
            });
        }, 5000);
    }

    function setProgress(id, track, loaded, total) {
        const fraction = total > 0 ? Math.min(loaded / total, 1) : null;
        progress.set(id, {
            track: track,
            loaded: loaded,
            total: total,
            fraction: fraction,
            local: true,
            updatedAt: Date.now(),
        });
        renderProgressUI(id);
        broadcast({ type: 'progress', track: track, loaded: loaded, total: total, fraction: fraction });
    }

    function endProgress(id, changed) {
        progress.delete(id);
        renderProgressUI(id);
        broadcast({ type: 'end', id: id, changed: changed });
    }

    function percentText(entry) {
        return entry.fraction == null ? '…' : Math.round(entry.fraction * 100) + '%';
    }

    // ---- Navigation warning while downloading ---------------------------------
    // Downloads run in the page, so navigating away cancels them. Warn the user
    // with a banner while any download is active here, confirm before following
    // in-app links, and arm beforeunload for full page unloads.
    function localDownloadCount() {
        let count = 0;
        progress.forEach(function (entry) { if (entry.local) count++; });
        return count;
    }

    function hasActiveLocalWork() {
        return localDownloadCount() > 0 || playlistSaveState.active;
    }

    function updateDownloadWarningBanner() {
        const active = hasActiveLocalWork();
        let banner = document.getElementById('offline-download-warning');
        if (!active) {
            if (banner) banner.remove();
            return;
        }
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-download-warning';
            banner.className = 'offline-download-warning alert alert-warning shadow d-flex align-items-center py-2 px-3 mb-0';
            banner.setAttribute('role', 'status');
            banner.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i><small class="offline-dl-warn-text"></small>';
            document.body.appendChild(banner);
        }
        let what;
        if (playlistSaveState.active) {
            what = 'Saving playlist (' + Math.min(playlistSaveState.done + 1, playlistSaveState.total) + '/' + playlistSaveState.total + ')';
        } else {
            const count = localDownloadCount();
            what = 'Saving ' + count + ' track' + (count === 1 ? '' : 's');
        }
        setText(banner.querySelector('.offline-dl-warn-text'),
            what + ' — stay on this page. Navigating away will cancel the download.');
    }

    window.addEventListener('beforeunload', function (event) {
        if (hasActiveLocalWork()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // Capture-phase so this runs before the link navigates or other handlers act.
    document.addEventListener('click', function (event) {
        if (!hasActiveLocalWork()) return;
        const link = event.target.closest('a[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        // Only real in-app navigations: skip hash links, new tabs, and
        // Bootstrap toggles (dropdowns/modals), which don't leave the page.
        if (!href || href.charAt(0) === '#' || link.target === '_blank' || link.dataset.bsToggle) return;
        if (!window.confirm('A download is in progress and navigating away will cancel it. Leave this page anyway?')) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);

    // ---- Progress rendering ---------------------------------------------------
    function renderProgressUI(id) {
        const entry = progress.get(id);

        // Overlay on every rendered icon of this track (track list + playlists).
        document.querySelectorAll('[data-testid="track-item-' + id + '"] .track-icon-holder').forEach(function (holder) {
            let overlay = holder.querySelector('.offline-progress-overlay');
            if (entry) {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'offline-progress-overlay';
                    holder.appendChild(overlay);
                }
                setText(overlay, percentText(entry));
            } else if (overlay) {
                overlay.remove();
            }
        });

        // Menu item label. (The post-download state is set by
        // refreshOfflineIndicators once the entry is gone.)
        if (entry) {
            document.querySelectorAll('.offline-toggle[data-track-id="' + id + '"]').forEach(function (el) {
                setClass(el.querySelector('i'), 'fas fa-spinner fa-spin me-2');
                setText(el.querySelector('.offline-label'), 'Saving… ' + percentText(entry));
                el.classList.add('disabled');
            });
        }

        updateDownloadsPageProgress(id, entry);
        updatePlaylistButtonProgressText();
        updateDownloadWarningBanner();
    }

    // ---- Streaming fetch with progress ---------------------------------------
    async function fetchWithProgress(url, onProgress) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
        const total = parseInt(response.headers.get('Content-Length') || '0', 10) || 0;

        if (!response.body || typeof response.body.getReader !== 'function') {
            const blob = await response.blob();
            onProgress(blob.size, blob.size);
            return { blob: blob, contentType: contentType };
        }

        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
            const step = await reader.read();
            if (step.done) break;
            chunks.push(step.value);
            loaded += step.value.byteLength;
            onProgress(loaded, total);
        }
        return { blob: new Blob(chunks, { type: contentType }), contentType: contentType };
    }

    // ---- Saving / removing tracks -------------------------------------------
    function normalizeTrack(t) {
        return {
            id: parseInt(t.id, 10),
            name: t.name || '',
            artist: t.artist || '',
            icon_url: t.icon_url || '',
            stream_url: t.stream_url,
            type: t.type || 'song',
            duration: parseFloat(t.duration) || 0,
        };
    }

    // Download one track into IndexedDB. Silent (no toasts); returns success.
    async function downloadAndStore(track) {
        const id = track.id;
        if (progress.has(id)) return false;
        const key = DB.keyFor(track.stream_url);
        setProgress(id, track, 0, 0);
        let success = false;
        try {
            let lastEmit = 0;
            const result = await fetchWithProgress(track.stream_url, function (loaded, total) {
                const now = Date.now();
                if (loaded < total && now - lastEmit < 150) return; // throttle UI updates
                lastEmit = now;
                setProgress(id, track, loaded, total);
            });

            await DB.putAudio(key, result.blob, result.contentType);
            await DB.putTrack(Object.assign({}, track, {
                size: result.blob.size,
                key: key,
                savedAt: Date.now(),
            }));

            // Best-effort cache of the track artwork for offline display.
            if (track.icon_url && 'caches' in window) {
                try {
                    const iconResp = await fetch(track.icon_url, { mode: 'no-cors' });
                    const cache = await caches.open(MEDIA_CACHE_NAME);
                    await cache.put(track.icon_url, iconResp);
                } catch (e) { /* artwork is optional */ }
            }
            success = true;
        } catch (err) {
            console.error('Failed to save track offline:', err);
        } finally {
            endProgress(id, success);
        }
        return success;
    }

    async function saveTrackOffline(track) {
        const ok = await downloadAndStore(track);
        if (ok) {
            toast('"' + track.name + '" saved for offline.', 'success');
        } else {
            toast('Could not save "' + track.name + '" for offline.', 'error');
        }
        document.dispatchEvent(new CustomEvent('offlinetrackschanged'));
        await refreshOfflineIndicators();
        return ok;
    }

    async function removeTrackOffline(id, name) {
        try {
            const existing = await DB.getTrack(id);
            const key = existing ? existing.key : null;
            await DB.deleteTrack(id, key);
            toast('Removed "' + (name || 'track') + '" from offline downloads.', 'success');
            broadcast({ type: 'end', id: null, changed: true });
            document.dispatchEvent(new CustomEvent('offlinetrackschanged'));
        } catch (err) {
            console.error('Failed to remove offline track:', err);
            toast('Could not remove the offline download.', 'error');
        } finally {
            await refreshOfflineIndicators();
        }
    }

    // ---- Whole-playlist save / remove -----------------------------------------
    // The playlist page exposes its tracks as `window.playlistData`
    // (id, name, artist, stream_url, icon_url, type, duration).
    let playlistSaveState = { active: false, done: 0, total: 0, currentId: null };

    function getPlaylistTracks() {
        return Array.isArray(window.playlistData) ? window.playlistData : null;
    }

    function updatePlaylistButtonProgressText() {
        if (!playlistSaveState.active) return;
        const btn = document.getElementById('playlist-offline-btn');
        if (!btn) return;
        const entry = playlistSaveState.currentId != null ? progress.get(playlistSaveState.currentId) : null;
        let text = 'Saving ' + Math.min(playlistSaveState.done + 1, playlistSaveState.total) + '/' + playlistSaveState.total;
        if (entry && entry.fraction != null) {
            text += ' — ' + percentText(entry);
        } else {
            text += '…';
        }
        setText(btn.querySelector('.offline-label'), text);
    }

    async function refreshPlaylistOfflineButton() {
        const btn = document.getElementById('playlist-offline-btn');
        const tracks = getPlaylistTracks();
        if (!btn || !tracks || playlistSaveState.active) return;

        let savedIds;
        try {
            savedIds = new Set((await DB.getTracks()).map(function (t) { return t.id; }));
        } catch (e) {
            return;
        }
        const savedCount = tracks.filter(function (t) { return savedIds.has(t.id); }).length;
        const icon = btn.querySelector('i');
        const label = btn.querySelector('.offline-label');

        btn.disabled = tracks.length === 0;
        if (tracks.length > 0 && savedCount === tracks.length) {
            btn.dataset.offlineState = 'saved';
            setClass(icon, 'fas fa-circle-check me-2');
            setText(label, 'Remove downloads');
        } else {
            btn.dataset.offlineState = 'none';
            setClass(icon, 'fas fa-download me-2');
            setText(label, savedCount > 0
                ? 'Save remaining (' + (tracks.length - savedCount) + ')'
                : 'Save for offline');
        }
        btn.style.display = '';
    }

    async function savePlaylistOffline(btn) {
        const tracks = getPlaylistTracks();
        if (!tracks || playlistSaveState.active) return;

        let savedIds;
        try {
            savedIds = new Set((await DB.getTracks()).map(function (t) { return t.id; }));
        } catch (e) {
            savedIds = new Set();
        }
        const pending = tracks
            .map(normalizeTrack)
            .filter(function (t) { return !savedIds.has(t.id) && !progress.has(t.id); });
        if (!pending.length) {
            refreshPlaylistOfflineButton();
            return;
        }

        playlistSaveState = { active: true, done: 0, total: pending.length, currentId: null };
        btn.disabled = true;
        setClass(btn.querySelector('i'), 'fas fa-spinner fa-spin me-2');
        updateDownloadWarningBanner();

        let failures = 0;
        for (const track of pending) {
            playlistSaveState.currentId = track.id;
            updatePlaylistButtonProgressText();
            const ok = await downloadAndStore(track);
            if (!ok) failures++;
            playlistSaveState.done++;
        }

        playlistSaveState = { active: false, done: 0, total: 0, currentId: null };
        btn.disabled = false;
        updateDownloadWarningBanner();
        if (failures) {
            toast('Playlist saved with ' + failures + ' failed track' + (failures === 1 ? '' : 's') + '.', 'error');
        } else {
            toast('Playlist saved for offline.', 'success');
        }
        document.dispatchEvent(new CustomEvent('offlinetrackschanged'));
        await refreshOfflineIndicators();
    }

    async function removePlaylistOffline() {
        const tracks = getPlaylistTracks();
        if (!tracks || playlistSaveState.active) return;
        if (!window.confirm('Remove all downloaded tracks in this playlist from this device?')) return;

        for (const t of tracks) {
            try {
                const existing = await DB.getTrack(t.id);
                if (existing) await DB.deleteTrack(t.id, existing.key);
            } catch (e) { /* keep going */ }
        }
        toast('Playlist downloads removed.', 'success');
        broadcast({ type: 'end', id: null, changed: true });
        document.dispatchEvent(new CustomEvent('offlinetrackschanged'));
        await refreshOfflineIndicators();
    }

    // ---- Menu trigger wiring ------------------------------------------------
    function trackFromTrigger(el) {
        return normalizeTrack({
            id: el.dataset.trackId,
            name: el.dataset.trackName,
            artist: el.dataset.trackArtist,
            icon_url: el.dataset.trackIcon,
            stream_url: el.dataset.streamUrl,
            type: el.dataset.trackType,
            duration: el.dataset.trackDuration,
        });
    }

    function setTriggerState(el, state) {
        if (!el) return;
        const label = el.querySelector('.offline-label');
        const icon = el.querySelector('i');
        if (state === 'saved') {
            setClass(icon, 'fas fa-circle-check text-success me-2');
            setText(label, 'Remove download');
            el.classList.remove('disabled');
            el.dataset.offlineState = 'saved';
        } else {
            setClass(icon, 'fas fa-download me-2');
            setText(label, 'Save for offline');
            el.classList.remove('disabled');
            el.dataset.offlineState = 'none';
        }
    }

    async function refreshOfflineIndicators() {
        let savedIds;
        try {
            savedIds = new Set((await DB.getTracks()).map(function (t) { return t.id; }));
        } catch (e) {
            return;
        }

        // Menu labels.
        document.querySelectorAll('.offline-toggle').forEach(function (el) {
            const id = parseInt(el.dataset.trackId, 10);
            if (progress.has(id)) return; // mid-download; renderProgressUI owns it
            setTriggerState(el, savedIds.has(id) ? 'saved' : 'none');
        });

        // Saved badges on track icons.
        document.querySelectorAll('[data-testid^="track-item-"] .track-icon-holder').forEach(function (holder) {
            const item = holder.closest('[data-testid^="track-item-"]');
            const match = /track-item-(\d+)/.exec(item ? item.getAttribute('data-testid') : '');
            if (!match) return;
            const id = parseInt(match[1], 10);
            let badge = holder.querySelector('.offline-saved-badge');
            if (savedIds.has(id)) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'offline-saved-badge';
                    badge.title = 'Saved for offline';
                    badge.innerHTML = '<i class="fas fa-check"></i>';
                    holder.appendChild(badge);
                }
            } else if (badge) {
                badge.remove();
            }
        });

        await refreshPlaylistOfflineButton();
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
            saveTrackOffline(track);
        }
    });

    // Keep indicators fresh as track lists are re-rendered via AJAX. Writes are
    // no-op-guarded (setText/setClass) so our own updates don't retrigger this.
    let indicatorRefreshQueued = false;
    function queueIndicatorRefresh() {
        if (indicatorRefreshQueued) return;
        indicatorRefreshQueued = true;
        setTimeout(function () {
            indicatorRefreshQueued = false;
            refreshOfflineIndicators();
            progress.forEach(function (entry, id) { renderProgressUI(id); });
        }, 50);
    }

    function observeContainers() {
        ['track-list-container', 'playlist-tracks'].forEach(function (containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            const observer = new MutationObserver(queueIndicatorRefresh);
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

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function trackIconHtml(track, sizePx) {
        const size = sizePx + 'px';
        return track.icon_url
            ? '<img src="' + escapeHtml(track.icon_url) + '" alt="" style="width:' + size + ';height:' + size + ';border-radius:5px;object-fit:cover;" class="me-3" onerror="this.style.display=\'none\'">'
            : '<div class="bg-secondary me-3 d-flex align-items-center justify-content-center" style="width:' + size + ';height:' + size + ';border-radius:5px;"><i class="fas fa-music text-white"></i></div>';
    }

    // Live-update (or trigger a re-render for) the Downloads page entry of one
    // in-flight download.
    function updateDownloadsPageProgress(id, entry) {
        const listEl = document.getElementById('offline-track-list');
        if (!listEl) return;
        const item = document.getElementById('offline-dl-item-' + id);
        if (entry) {
            if (!item) {
                renderDownloadsPage();
                return;
            }
            const pct = entry.fraction == null ? null : Math.round(entry.fraction * 100);
            const bar = item.querySelector('.offline-dl-bar');
            if (bar) {
                bar.style.width = (pct == null ? 100 : pct) + '%';
                bar.classList.toggle('progress-bar-striped', pct == null);
                bar.classList.toggle('progress-bar-animated', pct == null);
            }
            setText(item.querySelector('.offline-dl-pct'), pct == null ? '…' : pct + '%');
        } else if (item) {
            renderDownloadsPage(); // finished or failed: move to saved list / drop
        }
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

        const savedIds = new Set(tracks.map(function (t) { return t.id; }));
        const active = [];
        progress.forEach(function (entry, id) {
            if (!savedIds.has(id)) active.push({ id: id, entry: entry });
        });

        listEl.innerHTML = '';
        if (!tracks.length && !active.length) {
            if (emptyEl) emptyEl.style.display = 'block';
            if (summaryEl) setText(summaryEl, '');
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        const totalSize = tracks.reduce(function (sum, t) { return sum + (t.size || 0); }, 0);
        if (summaryEl) {
            let summary = tracks.length + ' track' + (tracks.length === 1 ? '' : 's') +
                ' • ' + formatBytes(totalSize) + ' stored on this device';
            if (active.length) {
                summary += ' • ' + active.length + ' downloading';
            }
            setText(summaryEl, summary);
        }

        // In-flight downloads first, with a live progress bar.
        active.forEach(function (a) {
            const track = a.entry.track || {};
            const pct = a.entry.fraction == null ? null : Math.round(a.entry.fraction * 100);
            const item = document.createElement('div');
            item.className = 'list-group-item';
            item.id = 'offline-dl-item-' + a.id;
            item.innerHTML =
                '<div class="d-flex align-items-center">' +
                    trackIconHtml(track, 50) +
                    '<div class="flex-grow-1">' +
                        '<h6 class="mb-1">' + escapeHtml(track.name || 'Track ' + a.id) + '</h6>' +
                        '<small class="text-muted">Downloading… <span class="offline-dl-pct">' +
                            (pct == null ? '…' : pct + '%') + '</span></small>' +
                        '<div class="progress mt-1" style="height: 5px;">' +
                            '<div class="progress-bar offline-dl-bar' + (pct == null ? ' progress-bar-striped progress-bar-animated' : '') +
                                '" role="progressbar" style="width: ' + (pct == null ? 100 : pct) + '%;"></div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            listEl.appendChild(item);
        });

        // Saved tracks.
        tracks.forEach(function (track) {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.dataset.trackId = track.id;

            const info = document.createElement('div');
            info.className = 'd-flex align-items-center flex-grow-1';
            info.style.cursor = 'pointer';
            info.innerHTML = trackIconHtml(track, 50) +
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

    // ---- Online / offline status banner -------------------------------------
    function updateOnlineStatus() {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;
        // Toggle via Bootstrap's d-none: the banner's d-flex sets display with
        // !important, which overrides any inline style we could assign here.
        banner.classList.toggle('d-none', navigator.onLine);
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

        const playlistBtn = document.getElementById('playlist-offline-btn');
        if (playlistBtn) {
            playlistBtn.addEventListener('click', function () {
                if (playlistBtn.dataset.offlineState === 'saved') {
                    removePlaylistOffline();
                } else {
                    savePlaylistOffline(playlistBtn);
                }
            });
        }
    });

    // Expose for other scripts that re-render track lists.
    window.refreshOfflineIndicators = refreshOfflineIndicators;
})();
