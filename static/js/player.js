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

    // Function to format time from seconds to MM:SS
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) {
            return "0:00";
        }
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Play/Pause button functionality
    playPauseBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) { // check if a track is loaded
            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
        }
    });

    // Update play/pause icon based on player state
    audioPlayer.addEventListener('play', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    });

    // Update seek bar and time displays
    audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.duration) {
            seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
            console.log("timeupdate: currentTime is now", audioPlayer.currentTime);
        }
    });

    // Update duration when metadata loads
    audioPlayer.addEventListener('loadedmetadata', () => {
        durationEl.textContent = formatTime(audioPlayer.duration);
    });

    // Seek functionality
    seekBar.addEventListener('input', () => {
        if (audioPlayer.duration) {
            audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
        }
    });

    // Global function to be called from the template
    window.playTrack = function(trackUrl, trackName, iconUrl) {
        audioPlayer.src = trackUrl;
        playerTrackName.textContent = trackName;

        if (iconUrl && iconUrl !== 'None' && iconUrl !== 'null') {
            playerIcon.src = iconUrl;
            playerIcon.style.display = 'inline-block';
        } else {
            playerIcon.style.display = 'none';
        }

        audioPlayer.play();
    }

    // Skip back 15 seconds
    skipBackBtn.addEventListener('click', () => {
        console.log("back pressed");
        // A readyState of 3+ indicates that we have data for the current and future playback positions.
        if (audioPlayer.src && audioPlayer.readyState >= 3 && !isNaN(audioPlayer.duration)) {
            console.log("moving backward");
            console.log("current time before skip", audioPlayer.currentTime);
            const newTime = Math.max(0, audioPlayer.currentTime - 15);
            audioPlayer.currentTime = newTime;
            console.log("attempted to set currentTime to", newTime);
        } else {
             console.log("Cannot skip back: player not ready or duration is NaN.", {
                src: audioPlayer.src,
                readyState: audioPlayer.readyState,
                duration: audioPlayer.duration
            });
        }
    });

    // Skip forward 15 seconds
    skipForwardBtn.addEventListener('click', () => {
        console.log("forward pressed");
        if (audioPlayer.src && audioPlayer.readyState >= 3 && !isNaN(audioPlayer.duration)) {
            console.log("moving forward");
            console.log("current time before skip", audioPlayer.currentTime);
            console.log("duration before skip", audioPlayer.duration);
            const newTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 15);
            audioPlayer.currentTime = newTime;
            console.log("attempted to set currentTime to", newTime);
        } else {
            console.log("Cannot skip forward: player not ready or duration is NaN.", {
                src: audioPlayer.src,
                readyState: audioPlayer.readyState,
                duration: audioPlayer.duration
            });
        }
    });

    // Change playback speed
    playbackSpeed.addEventListener('change', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.playbackRate = parseFloat(playbackSpeed.value);
        }
    });

    // Comprehensive error handling for the audio element
    audioPlayer.addEventListener('error', (e) => {
        let errorMessage = 'An unknown error occurred.';
        if (audioPlayer.error) {
            switch (audioPlayer.error.code) {
                case 1: // MEDIA_ERR_ABORTED
                    errorMessage = 'The media playback was aborted.';
                    break;
                case 2: // MEDIA_ERR_NETWORK
                    errorMessage = 'A network error caused the media download to fail.';
                    break;
                case 3: // MEDIA_ERR_DECODE
                    errorMessage = 'The media playback was aborted due to a corruption problem or because the media used features your browser did not support.';
                    break;
                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                    errorMessage = 'The media could not be loaded, either because the server or network failed or because the format is not supported.';
                    break;
                default:
                    errorMessage = 'An unknown error occurred.';
            }
        }
        console.error('Audio Player Error:', errorMessage, 'Event:', e);
        // Optionally, display a user-friendly error message
        // playerTrackName.textContent = `Error: Could not play track.`;
    });
});