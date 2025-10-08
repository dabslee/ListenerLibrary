document.addEventListener('DOMContentLoaded', function() {
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

    let currentTrackId = null;
    let podcastProgress = {};
    let saveInterval;

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

    function savePlaybackState() {
        if (!currentTrackId || isNaN(audioPlayer.currentTime)) return;

        fetch('/api/playback/state/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify({
                track_id: currentTrackId,
                current_time: audioPlayer.currentTime,
            }),
        });
    }

    function loadInitialPlayerState() {
        fetch('/api/playback/state/')
            .then(response => response.json())
            .then(data => {
                podcastProgress = data.podcast_progress || {};
                if (data.current_track_id) {
                    const trackElement = document.querySelector(`.track-item[data-track-id='${data.current_track_id}']`);
                    if (trackElement) {
                        const track = JSON.parse(trackElement.dataset.track);
                        currentTrackId = track.id;
                        audioPlayer.src = track.url;
                        playerTrackName.textContent = track.name;
                        if (track.icon) {
                            playerIcon.src = track.icon;
                            playerIcon.style.display = 'inline-block';
                        } else {
                            playerIcon.style.display = 'none';
                        }

                        // Restore time but don't play yet
                        audioPlayer.currentTime = data.current_time;

                        // Set up the save interval
                        clearInterval(saveInterval);
                        saveInterval = setInterval(savePlaybackState, 5000);
                    }
                }
                // Update progress bars for all visible podcast tracks
                document.querySelectorAll('.progress-bar-indicator').forEach(bar => {
                    const trackId = bar.dataset.trackId;
                    const duration = parseFloat(bar.dataset.duration);
                    if (podcastProgress[trackId] && duration > 0) {
                        const width = (podcastProgress[trackId] / duration) * 100;
                        bar.style.width = `${width}%`;
                    }
                });
            });
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

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
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.duration) {
            seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);

            // Update live progress bar for the currently playing track
            const progressBar = document.querySelector(`.progress-bar-indicator[data-track-id='${currentTrackId}']`);
            if (progressBar) {
                const width = (audioPlayer.currentTime / audioPlayer.duration) * 100;
                progressBar.style.width = `${width}%`;
            }
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

    window.playTrack = function(trackId, trackUrl, trackName, iconUrl, trackType) {
        currentTrackId = trackId;
        audioPlayer.src = trackUrl;
        playerTrackName.textContent = trackName;

        if (iconUrl && iconUrl !== 'None' && iconUrl !== 'null') {
            playerIcon.src = iconUrl;
            playerIcon.style.display = 'inline-block';
        } else {
            playerIcon.style.display = 'none';
        }

        // Check for podcast-specific progress
        if (trackType === 'podcast' && podcastProgress[trackId]) {
            audioPlayer.currentTime = podcastProgress[trackId];
        } else {
            audioPlayer.currentTime = 0; // Start from beginning for songs
        }

        audioPlayer.play();

        clearInterval(saveInterval);
        saveInterval = setInterval(savePlaybackState, 5000); // Save every 5 seconds
    }

    skipBackBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
        }
    });

    skipForwardBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 15);
        }
    });

    playbackSpeed.addEventListener('change', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.playbackRate = parseFloat(playbackSpeed.value);
        }
    });

    // Save state when leaving the page
    window.addEventListener('beforeunload', savePlaybackState);

    // Load initial state when the page loads
    loadInitialPlayerState();
});