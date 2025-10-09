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
    let saveInterval = null;
    let podcastPositions = {};

    // --- UTILITY FUNCTIONS ---

    // Function to get CSRF token from cookies
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

    // Function to format time from seconds to MM:SS
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // --- PLAYBACK STATE MANAGEMENT ---

    async function savePlaybackState() {
        if (!currentTrackId || isNaN(audioPlayer.currentTime) || audioPlayer.currentTime === 0) {
            return; // Don't save if nothing is playing or at the very start
        }

        try {
            await fetch('/api/update_playback_state/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken
                },
                body: JSON.stringify({
                    track_id: currentTrackId,
                    position: audioPlayer.currentTime
                })
            });
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
        // Start saving progress every 5 seconds
        if (saveInterval) clearInterval(saveInterval);
        saveInterval = setInterval(savePlaybackState, 5000);
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        // Stop saving progress when paused, but save the final state
        clearInterval(saveInterval);
        savePlaybackState();
    });

    audioPlayer.addEventListener('ended', () => {
        clearInterval(saveInterval);
        // Set position to 0 for the ended track
        audioPlayer.currentTime = 0;
        savePlaybackState();
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.duration) {
            seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
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
        currentTrackId = trackId;

        // Stop any previous save interval
        if (saveInterval) clearInterval(saveInterval);

        audioPlayer.src = trackUrl;
        playerTrackName.textContent = trackName;
        playerIcon.src = (iconUrl && iconUrl !== 'None') ? iconUrl : '';
        playerIcon.style.display = (iconUrl && iconUrl !== 'None') ? 'inline-block' : 'none';

        // Check for podcast-specific progress
        const startPosition = (trackType === 'podcast' && podcastPositions[trackId]) ? podcastPositions[trackId] : 0;

        // We must wait for metadata to load before setting currentTime
        audioPlayer.addEventListener('loadedmetadata', () => {
            audioPlayer.currentTime = startPosition;
        }, { once: true }); // Use { once: true } so this listener is removed after firing

        audioPlayer.play().catch(e => console.error("Playback error:", e));
    };

    function initializePlayer() {
        // Load podcast progress map
        const podcastDataEl = document.getElementById('podcast-positions-data');
        if (podcastDataEl) {
            podcastPositions = JSON.parse(podcastDataEl.textContent);
        }

        // Load last general playback state
        const playbackStateEl = document.getElementById('playback-state-data');
        const playbackStateText = playbackStateEl.textContent.trim();

        if (playbackStateText) {
            try {
                const state = JSON.parse(playbackStateText);
                currentTrackId = state.trackId;
                audioPlayer.src = state.trackStreamUrl;
                playerTrackName.textContent = state.trackName;
                playerIcon.src = (state.trackIcon && state.trackIcon !== 'None') ? state.trackIcon : '';
                playerIcon.style.display = (state.trackIcon && state.trackIcon !== 'None') ? 'inline-block' : 'none';

                // Wait for metadata to load before setting the time
                audioPlayer.addEventListener('loadedmetadata', () => {
                    audioPlayer.currentTime = state.position;
                    // Update time display manually since it's not playing
                    currentTimeEl.textContent = formatTime(state.position);
                }, { once: true });

            } catch (e) {
                console.error("Could not parse initial playback state:", e);
            }
        }
    }

    // Save state when the user is about to leave the page
    window.addEventListener('beforeunload', savePlaybackState);

    // Initialize the player on page load
    initializePlayer();

    // --- Standard player controls (skip, speed, error handling) ---

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