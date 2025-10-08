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
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
        }
    });

    // Skip forward 15 seconds
    skipForwardBtn.addEventListener('click', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 15);
        }
    });

    // Change playback speed
    playbackSpeed.addEventListener('change', () => {
        if (audioPlayer.src && audioPlayer.readyState > 0) {
            audioPlayer.playbackRate = parseFloat(playbackSpeed.value);
        }
    });
});