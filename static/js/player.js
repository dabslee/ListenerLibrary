document.addEventListener('DOMContentLoaded', function() {
    // --- UI ELEMENTS ---
    const audioPlayer = document.getElementById('audio-player');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const seekBar = document.getElementById('seek-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const playerIcon = document.getElementById('player-icon');
    const playerTrackName = document.getElementById('player-track-name');
    const playerTrackArtist = document.getElementById('player-track-artist');
    const skipBackBtn = document.getElementById('skip-back-btn');
    const skipForwardBtn = document.getElementById('skip-forward-btn');
    const playbackSpeed = document.getElementById('playback-speed');
    const prevTrackBtn = document.getElementById('prev-track-btn');
    const nextTrackBtn = document.getElementById('next-track-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');

    // --- STATE VARIABLES ---
    let currentTrack = null; // Store the full track object
    let saveInterval = null;
    let podcastPositions = {};

    // Playlist State
    let originalPlaylist = [];
    let shuffledPlaylist = [];
    let playQueue = []; // This will point to either original or shuffled playlist
    let currentTrackIndex = -1;
    let isShuffle = false;

    // --- UTILITY FUNCTIONS ---
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
    const csrftoken = getCookie('csrftoken');

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function shuffleArray(array) {
        let newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    // --- PLAYBACK STATE MANAGEMENT ---
    async function savePlaybackState() {
        if (!currentTrack || isNaN(audioPlayer.currentTime)) return;
        const position = audioPlayer.currentTime;
        if (currentTrack.type === 'podcast') {
            podcastPositions[currentTrack.id] = position;
        }
        try {
            await fetch('/api/update_playback_state/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify({ track_id: currentTrack.id, position: position })
            });
        } catch (error) {
            console.error('Error saving playback state:', error);
        }
    }

    // --- CORE PLAYER LOGIC ---
    function updateMediaSession() {
        if (!currentTrack) return;

        const { name, artist, icon_url } = currentTrack;
        const iconUrl = (icon_url && icon_url !== 'None' && icon_url !== 'null') ? icon_url : '';

        // Update Page Title
        document.title = `${name} - ${artist || 'ListenerLibrary'}`;

        // Update Media Session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: name,
                artist: artist || '',
                album: 'ListenerLibrary',
                artwork: iconUrl ? [
                    { src: iconUrl, sizes: '96x96', type: 'image/png' },
                    { src: iconUrl, sizes: '128x128', type: 'image/png' },
                    { src: iconUrl, sizes: '192x192', type: 'image/png' },
                    { src: iconUrl, sizes: '256x256', type: 'image/png' },
                    { src: iconUrl, sizes: '384x384', type: 'image/png' },
                    { src: iconUrl, sizes: '512x512', type: 'image/png' },
                ] : []
            });

            // Set up action handlers
            navigator.mediaSession.setActionHandler('play', () => audioPlayer.play());
            navigator.mediaSession.setActionHandler('pause', () => audioPlayer.pause());
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                const skipTime = details.seekOffset || 15;
                audioPlayer.currentTime = Math.max(audioPlayer.currentTime - skipTime, 0);
            });
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                const skipTime = details.seekOffset || 15;
                audioPlayer.currentTime = Math.min(audioPlayer.currentTime + skipTime, audioPlayer.duration);
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
            navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.fastSeek && 'fastSeek' in audioPlayer) {
                  audioPlayer.fastSeek(details.seekTime);
                  return;
                }
                audioPlayer.currentTime = details.seekTime;
            });
        }
    }

    function loadAndPlayTrack(track) {
        if (!track) return;
        if (currentTrack && !audioPlayer.paused) savePlaybackState();

        currentTrack = track;
        if (saveInterval) clearInterval(saveInterval);

        // Update UI
        playerTrackName.textContent = track.name;
        playerTrackArtist.textContent = track.artist || 'No artist';
        const iconUrl = (track.icon_url && track.icon_url !== 'None' && track.icon_url !== 'null') ? track.icon_url : '';
        playerIcon.src = iconUrl;
        playerIcon.style.display = iconUrl ? 'inline-block' : 'none';

        // Link to the full player page
        const playerInfoLink = document.getElementById('player-info-link');
        if (playerInfoLink) {
            playerInfoLink.href = `/player/${track.id}/`;
        }

        updateMediaSession();

        // Set src and load
        const startPosition = (track.type === 'podcast' && podcastPositions[track.id]) ? podcastPositions[track.id] : 0;
        audioPlayer.src = track.stream_url;
            audioPlayer.load();

        // Set time *after* metadata is loaded
        audioPlayer.addEventListener('loadedmetadata', () => {
            if (isFinite(audioPlayer.duration)) {
                audioPlayer.currentTime = startPosition;
            }
        }, { once: true });

        // Play *after* it's possible to do so
        audioPlayer.addEventListener('canplay', () => {
            audioPlayer.play().catch(e => console.error("Playback error:", e));
        }, { once: true });
        }

    function playNextTrack() {
        if (currentTrackIndex < playQueue.length - 1) {
            currentTrackIndex++;
            loadAndPlayTrack(playQueue[currentTrackIndex]);
        }
        updateNextPrevButtons();
    }

    function playPrevTrack() {
        if (currentTrackIndex > 0) {
            currentTrackIndex--;
            loadAndPlayTrack(playQueue[currentTrackIndex]);
        }
        updateNextPrevButtons();
    }

    // --- GLOBAL FUNCTIONS ---
    window.playTrack = function(trackUrl, trackName, trackArtist, iconUrl, trackId, trackType) {
        // When a single track is played, clear the playlist context
        playQueue = [];
        originalPlaylist = [];
        shuffledPlaylist = [];
        currentTrackIndex = -1;
        updateNextPrevButtons();

        const trackObject = {
            id: trackId,
            name: trackName,
            artist: trackArtist,
            icon_url: iconUrl,
            stream_url: trackUrl,
            type: trackType
        };
        loadAndPlayTrack(trackObject);
    };

    window.playPlaylist = function(playlistItems, startIndex = 0) {
        originalPlaylist = [...playlistItems];
        shuffledPlaylist = shuffleArray(originalPlaylist);
        playQueue = isShuffle ? shuffledPlaylist : originalPlaylist;
        currentTrackIndex = startIndex;
        loadAndPlayTrack(playQueue[currentTrackIndex]);
        updateNextPrevButtons();
    };

    // --- EVENT LISTENERS ---
    playPauseBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
        }
    });

    audioPlayer.addEventListener('play', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        if (saveInterval) clearInterval(saveInterval);
        saveInterval = setInterval(savePlaybackState, 5000);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        clearInterval(saveInterval);
        savePlaybackState();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
    });

    audioPlayer.addEventListener('ended', () => {
        if (currentTrack && currentTrack.type === 'podcast') {
            podcastPositions[currentTrack.id] = 0;
            updatePodcastProgressBar(currentTrack.id, 0, audioPlayer.duration);
        }
        savePlaybackState();
        playNextTrack(); // Automatically play the next track in the queue
    });

    function updatePodcastProgressBar(trackId, currentTime, duration) {
        const trackListItem = document.querySelector(`[data-testid="track-item-${trackId}"]`);
        if (trackListItem) {
            const progressBar = trackListItem.querySelector('.progress-bar');
            const progressTime = trackListItem.querySelector('.podcast-progress-time');
            if (progressBar) {
                const percentage = (duration > 0) ? (currentTime / duration) * 100 : 0;
                progressBar.style.width = `${percentage}%`;
                progressBar.setAttribute('aria-valuenow', percentage);
                 if(progressTime){
                    progressTime.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
                }
            }
        }
    }

    audioPlayer.addEventListener('timeupdate', () => {
        if (!audioPlayer.duration || !currentTrack) return;
        const currentTime = audioPlayer.currentTime;
        const duration = audioPlayer.duration;
        seekBar.value = (currentTime / duration) * 100;
        currentTimeEl.textContent = formatTime(currentTime);
        if (currentTrack.type === 'podcast') {
            updatePodcastProgressBar(currentTrack.id, currentTime, duration);
        }
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
        durationEl.textContent = formatTime(audioPlayer.duration);
    });

    seekBar.addEventListener('input', () => {
        if (audioPlayer.duration) {
            audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
        }
    });

    // --- PLAYLIST CONTROL LISTENERS ---
    nextTrackBtn.addEventListener('click', playNextTrack);
    prevTrackBtn.addEventListener('click', playPrevTrack);

    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;
        shuffleBtn.classList.toggle('active', isShuffle);
        if (originalPlaylist.length > 0) {
            playQueue = isShuffle ? shuffledPlaylist : originalPlaylist;
            // Find the new index of the current track to maintain playback position
            if (currentTrack) {
                currentTrackIndex = playQueue.findIndex(t => t.id === currentTrack.id);
            }
        }
        updateNextPrevButtons();
    });

    function updateNextPrevButtons() {
        prevTrackBtn.disabled = currentTrackIndex <= 0;
        nextTrackBtn.disabled = (playQueue.length === 0 || currentTrackIndex >= playQueue.length - 1);
    }

    // --- INITIALIZATION ---
    function initializePlayer() {
        const podcastDataEl = document.getElementById('podcast-positions-data');
        if (podcastDataEl) {
            try {
                podcastPositions = JSON.parse(podcastDataEl.textContent);
                podcastPositions = Object.fromEntries(Object.entries(podcastPositions).map(([k, v]) => [Number(k), v]));
            } catch (e) { console.error("Could not parse podcast positions data:", e); }
        }

        const playbackStateEl = document.getElementById('playback-state-data');
        const playbackStateText = playbackStateEl.textContent.trim();
        if (playbackStateText) {
            try {
                const state = JSON.parse(playbackStateText);
                const trackObject = {
                    id: state.trackId,
                    name: state.trackName,
                    artist: state.trackArtist,
                    icon_url: state.trackIcon,
                    stream_url: state.trackStreamUrl,
                    type: state.trackType
                };
                currentTrack = trackObject;
                audioPlayer.src = currentTrack.stream_url;
                playerTrackName.textContent = currentTrack.name;
                playerTrackArtist.textContent = currentTrack.artist || 'No artist';
                const iconUrl = (currentTrack.icon_url && currentTrack.icon_url !== 'None' && currentTrack.icon_url !== 'null') ? currentTrack.icon_url : '';
                playerIcon.src = iconUrl;
                playerIcon.style.display = iconUrl ? 'inline-block' : 'none';

                // Link to the full player page
                const playerInfoLink = document.getElementById('player-info-link');
                if (playerInfoLink) {
                    playerInfoLink.href = `/player/${currentTrack.id}/`;
                }

                updateMediaSession(); // Set metadata for the loaded track

                const startPosition = (currentTrack.type === 'podcast' && podcastPositions[currentTrack.id]) ? podcastPositions[currentTrack.id] : state.position;

                audioPlayer.addEventListener('loadedmetadata', () => {
                    if (isFinite(audioPlayer.duration)) {
                        audioPlayer.currentTime = startPosition;
                        currentTimeEl.textContent = formatTime(startPosition);
                        durationEl.textContent = formatTime(audioPlayer.duration);
                        seekBar.value = (audioPlayer.duration > 0) ? (startPosition / audioPlayer.duration) * 100 : 0;
                    }
                }, { once: true });
                audioPlayer.load(); // Explicitly load the media
            } catch (e) {
                console.error("Could not parse initial playback state:", e);
                document.title = 'ListenerLibrary'; // Reset title on error
            }
        } else {
            document.title = 'ListenerLibrary'; // Reset title if no state
        }
        updateNextPrevButtons();
    }

    window.addEventListener('beforeunload', savePlaybackState);
    skipBackBtn.addEventListener('click', () => { if (audioPlayer.src) audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15); });
    skipForwardBtn.addEventListener('click', () => { if (audioPlayer.src) audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 15); });
    playbackSpeed.addEventListener('change', () => { if (audioPlayer.src) audioPlayer.playbackRate = parseFloat(playbackSpeed.value); });
    audioPlayer.addEventListener('error', (e) => console.error('Audio Player Error:', audioPlayer.error, 'Event:', e));

    // --- KEYBOARD SHORTCUTS ---
    document.addEventListener('keydown', (event) => {
        const activeElement = document.activeElement;
        const targetTagName = activeElement ? activeElement.tagName.toLowerCase() : null;

        // Ignore keyboard shortcuts if the user is focused on an input, select, textarea, or button
        if (['input', 'select', 'textarea', 'button'].includes(targetTagName)) {
            return;
        }

        // Or if a modifier key is pressed
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }

        switch (event.key) {
            case ' ': // Space bar
                event.preventDefault();
                if (playPauseBtn) playPauseBtn.click();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                if (skipBackBtn) skipBackBtn.click();
                break;
            case 'ArrowRight':
                event.preventDefault();
                if (skipForwardBtn) skipForwardBtn.click();
                break;
        }
    });

    initializePlayer();
});