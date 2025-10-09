document.addEventListener('DOMContentLoaded', function() {
    // Player UI elements
    const audioPlayer = document.getElementById('audio-player');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const seekBar = document.getElementById('seek-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const playerIcon = document.getElementById('player-icon');
    const playerTrackName = document.getElementById('player-track-name');
    const skipBackBtn = document.getElementById('skip-back-btn');
    const skipForwardBtn = document.getElementById('skip-forward-btn');
    const playbackSpeed = document.getElementById('playback-speed');

    // State variables
    let currentTrackId = null;
    let currentTrackType = null;
    let saveInterval = null;
    let podcastPositions = {};

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

    // --- PLAYBACK STATE MANAGEMENT ---

    async function savePlaybackState() {
        if (!currentTrackId || isNaN(audioPlayer.currentTime)) {
            return;
        }

        const position = audioPlayer.currentTime;

        // Optimistically update local state for instant feedback
        if (currentTrackType === 'podcast') {
            podcastPositions[currentTrackId] = position;
        }

        try {
            const response = await fetch('/api/update_playback_state/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken
                },
                body: JSON.stringify({
                    track_id: currentTrackId,
                    position: position
                })
            });
            if (!response.ok) {
                console.error('Failed to save playback state to the server.');
            }
        } catch (error) {
            console.error('Error saving playback state:', error);
        }
    }

    // --- PLAYER EVENT LISTENERS ---

    playPauseBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
        }
    });

    audioPlayer.addEventListener('play', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        if (saveInterval) clearInterval(saveInterval);
        saveInterval = setInterval(savePlaybackState, 5000);
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        clearInterval(saveInterval);
        savePlaybackState(); // Save final state on pause
    });

    audioPlayer.addEventListener('ended', () => {
        clearInterval(saveInterval);
        // When a track ends, its progress should be reset to 0 for the next play.
        if (currentTrackType === 'podcast') {
            podcastPositions[currentTrackId] = 0;
            // Also update the UI immediately
            updatePodcastProgressBar(currentTrackId, 0, audioPlayer.duration);
        }
        audioPlayer.currentTime = 0;
        savePlaybackState();
    });

    function updatePodcastProgressBar(trackId, currentTime, duration) {
        const trackListItem = document.querySelector(`[data-testid="track-item-${trackId}"]`);
        if (trackListItem) {
            const progressBar = trackListItem.querySelector('.progress-bar');
            if (progressBar) {
                const percentage = (duration > 0) ? (currentTime / duration) * 100 : 0;
                progressBar.style.width = `${percentage}%`;
                progressBar.setAttribute('aria-valuenow', percentage);
            }
        }
    }

    audioPlayer.addEventListener('timeupdate', () => {
        if (!audioPlayer.duration) return;

        const currentTime = audioPlayer.currentTime;
        const duration = audioPlayer.duration;

        seekBar.value = (currentTime / duration) * 100;
        currentTimeEl.textContent = formatTime(currentTime);

        // Real-time update for podcast progress bar in the list
        if (currentTrackType === 'podcast' && currentTrackId) {
            updatePodcastProgressBar(currentTrackId, currentTime, duration);
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

    // --- GLOBAL FUNCTIONS AND INITIALIZATION ---

    window.playTrack = function(trackUrl, trackName, iconUrl, trackId, trackType) {
        // Save state of the *previous* track before switching
        if (currentTrackId && !audioPlayer.paused) {
            savePlaybackState();
        }

        currentTrackId = trackId;
        currentTrackType = trackType;

        if (saveInterval) clearInterval(saveInterval);

        audioPlayer.src = trackUrl;
        playerTrackName.textContent = trackName;
        playerIcon.src = (iconUrl && iconUrl !== 'None' && iconUrl !== 'null') ? iconUrl : '';
        playerIcon.style.display = (iconUrl && iconUrl !== 'None' && iconUrl !== 'null') ? 'inline-block' : 'none';

        const startPosition = (trackType === 'podcast' && podcastPositions[trackId])
            ? podcastPositions[trackId]
            : 0;

        const setTimeAndPlay = () => {
            // Ensure we don't try to set time on an invalid duration
            if (isFinite(audioPlayer.duration)) {
                audioPlayer.currentTime = startPosition;
            }
            audioPlayer.play().catch(e => console.error("Playback error:", e));
        };

        // The 'canplay' event is more reliable for this, as it fires
        // when the browser has enough data to begin playback.
        audioPlayer.addEventListener('canplay', setTimeAndPlay, { once: true });
        audioPlayer.load(); // Force browser to load the new (or same) src
    };

    function initializePlayer() {
        // Load podcast progress map from the template
        const podcastDataEl = document.getElementById('podcast-positions-data');
        if (podcastDataEl) {
            try {
                podcastPositions = JSON.parse(podcastDataEl.textContent);
                podcastPositions = Object.fromEntries(
                    Object.entries(podcastPositions).map(([k, v]) => [Number(k), v])
                );
            } catch (e) {
                console.error("Could not parse podcast positions data:", e);
            }
        }

        // Load last general playback state from the template
        const playbackStateEl = document.getElementById('playback-state-data');
        const playbackStateText = playbackStateEl.textContent.trim();

        if (playbackStateText) {
            try {
                const state = JSON.parse(playbackStateText);
                currentTrackId = state.trackId;
                currentTrackType = state.trackType;
                audioPlayer.src = state.trackStreamUrl;
                playerTrackName.textContent = state.trackName;
                playerIcon.src = (state.trackIcon && state.trackIcon !== 'None' && state.trackIcon !== 'null') ? state.trackIcon : '';
                playerIcon.style.display = (state.trackIcon && state.trackIcon !== 'None' && state.trackIcon !== 'null') ? 'inline-block' : 'none';

                // Prioritize podcast-specific progress for the initial load
                const startPosition = (state.trackType === 'podcast' && podcastPositions[state.trackId])
                    ? podcastPositions[state.trackId]
                    : state.position;

                audioPlayer.addEventListener('loadedmetadata', () => {
                    if (isFinite(audioPlayer.duration)) {
                        audioPlayer.currentTime = startPosition;
                        currentTimeEl.textContent = formatTime(startPosition);
                        durationEl.textContent = formatTime(audioPlayer.duration);
                        seekBar.value = (audioPlayer.duration > 0) ? (startPosition / audioPlayer.duration) * 100 : 0;
                    }
                }, { once: true });

            } catch (e) {
                console.error("Could not parse initial playback state:", e);
            }
        }
    }

    // Save state when the user is about to leave the page
    window.addEventListener('beforeunload', savePlaybackState);

    initializePlayer();

    // --- Standard player controls ---

    skipBackBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
    });

    skipForwardBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 15);
    });

    playbackSpeed.addEventListener('change', () => {
        if (audioPlayer.src) audioPlayer.playbackRate = parseFloat(playbackSpeed.value);
    });

    audioPlayer.addEventListener('error', (e) => {
        console.error('Audio Player Error:', audioPlayer.error, 'Event:', e);
    });
});