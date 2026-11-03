/*
 * Sorting for playlist lists (the Your Playlists page and each track's menu).
 *
 * Lists are marked .playlist-sortable; their items carry data-sort-name,
 * data-sort-updated (epoch seconds) and data-playlist-id. Controls are
 * .playlist-sort-controls containing [data-sort-key] buttons: picking a key
 * uses its natural direction, picking the active key again reverses it. The
 * choice is shared by every list and remembered on this device.
 */
(function () {
    const STORAGE_KEY = 'playlistSort';
    const DEFAULT_DIR = { name: 'asc', updated: 'desc' };
    const ICONS = {
        name: { asc: 'fa-arrow-down-a-z', desc: 'fa-arrow-down-z-a' },
        updated: { asc: 'fa-arrow-down-1-9', desc: 'fa-arrow-down-9-1' },
    };
    const TITLES = {
        name: { asc: 'Name, A to Z', desc: 'Name, Z to A' },
        updated: { asc: 'Modified, oldest first', desc: 'Modified, newest first' },
    };

    let state = load();

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && DEFAULT_DIR[saved.key] && (saved.dir === 'asc' || saved.dir === 'desc')) {
                return saved;
            }
        } catch (e) { /* storage unavailable */ }
        return { key: 'name', dir: 'asc' };
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* storage unavailable */ }
    }

    function compare(a, b) {
        let result;
        if (state.key === 'updated') {
            result = (Number(a.dataset.sortUpdated) - Number(b.dataset.sortUpdated))
                || (Number(a.dataset.playlistId) - Number(b.dataset.playlistId));
        } else {
            result = a.dataset.sortName.localeCompare(b.dataset.sortName, undefined, { sensitivity: 'base', numeric: true });
        }
        return state.dir === 'asc' ? result : -result;
    }

    function sortList(list) {
        // Items without sort data (e.g. an empty-state message) stay put.
        const items = Array.from(list.children).filter(function (el) {
            return el.dataset.sortName !== undefined;
        });
        items.sort(compare).forEach(function (el) { list.appendChild(el); });
    }

    function renderControls(controls) {
        controls.querySelectorAll('[data-sort-key]').forEach(function (button) {
            const key = button.dataset.sortKey;
            const active = key === state.key;
            const dir = active ? state.dir : DEFAULT_DIR[key];
            button.classList.toggle('btn-secondary', active);
            button.classList.toggle('btn-outline-secondary', !active);
            button.setAttribute('aria-pressed', String(active));
            button.title = 'Sort: ' + TITLES[key][dir];
            const icon = button.querySelector('.sort-dir');
            if (icon) icon.className = 'fas sort-dir ms-1 ' + ICONS[key][dir];
        });
    }

    function apply(root) {
        root = root || document;
        root.querySelectorAll('.playlist-sortable').forEach(sortList);
        root.querySelectorAll('.playlist-sort-controls').forEach(renderControls);
    }

    document.addEventListener('click', function (event) {
        const button = event.target.closest('.playlist-sort-controls [data-sort-key]');
        if (!button) return;
        event.preventDefault();
        const key = button.dataset.sortKey;
        if (key === state.key) {
            state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        } else {
            state = { key: key, dir: DEFAULT_DIR[key] };
        }
        save();
        apply(document);
    });

    document.addEventListener('DOMContentLoaded', function () { apply(document); });

    window.PlaylistSort = { apply: apply };
})();
