document.addEventListener('DOMContentLoaded', function() {
    const audioPlayer = document.getElementById('audio-player');
    const playPauseBtn = document.getElementById('play-pause');
    const rewindBtn = document.getElementById('rewind');
    const fastForwardBtn = document.getElementById('fast-forward');
    const prevTrackBtn = document.getElementById('prev-track');
    const nextTrackBtn = document.getElementById('next-track');
    const seekBar = document.getElementById('seek-bar');
    const volumeBar = document.getElementById('volume-bar');
    const shuffleBtn = document.getElementById('shuffle');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const playerTrackIcon = document.getElementById('player-track-icon');
    const playerTrackName = document.getElementById('player-track-name');

    let currentTrack = null;
    let currentPlaylist = [];
    let currentTrackIndex = -1;
    let isShuffled = false;
    let originalPlaylist = [];
    let progressUpdateInterval;

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

    function updateProgress() {
        if (!currentTrack) return;
        fetch('/api/update_progress/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify({
                track_id: currentTrack.id,
                position: audioPlayer.currentTime,
            }),
        });
    }

    function loadTrack(track, startTime = 0) {
        currentTrack = track;
        audioPlayer.src = track.file;
        playerTrackName.textContent = track.name;
        if (track.icon) {
            playerTrackIcon.src = track.icon;
            playerTrackIcon.style.display = 'block';
        } else {
            playerTrackIcon.style.display = 'none';
        }
        audioPlayer.currentTime = startTime;
        audioPlayer.play();
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';

        if (progressUpdateInterval) clearInterval(progressUpdateInterval);
        progressUpdateInterval = setInterval(updateProgress, 5000); // Update every 5 seconds
    }

    function playPlaylist(playlist, trackIndex = 0) {
        originalPlaylist = [...playlist];
        if (isShuffled) {
            currentPlaylist = shuffle([...playlist]);
        } else {
            currentPlaylist = [...playlist];
        }
        currentTrackIndex = trackIndex;
        loadTrack(currentPlaylist[currentTrackIndex]);
    }

    function shuffle(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    playPauseBtn.addEventListener('click', () => {
        if (audioPlayer.paused) {
            audioPlayer.play();
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            audioPlayer.pause();
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    });

    audioPlayer.addEventListener('pause', () => {
        updateProgress(); // Ensure progress is saved when paused
    });

    window.addEventListener('beforeunload', () => {
        if (currentTrack) {
            updateProgress(); // Ensure progress is saved before leaving the page
        }
    });

    rewindBtn.addEventListener('click', () => {
        audioPlayer.currentTime -= 15;
    });

    fastForwardBtn.addEventListener('click', () => {
        audioPlayer.currentTime += 15;
    });

    nextTrackBtn.addEventListener('click', () => {
        if (currentPlaylist.length > 0) {
            currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length;
            loadTrack(currentPlaylist[currentTrackIndex]);
        }
    });

    prevTrackBtn.addEventListener('click', () => {
        if (currentPlaylist.length > 0) {
            currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
            loadTrack(currentPlaylist[currentTrackIndex]);
        }
    });

    shuffleBtn.addEventListener('click', () => {
        isShuffled = !isShuffled;
        shuffleBtn.classList.toggle('active', isShuffled);
        if (currentPlaylist.length > 0) {
            const currentTrackId = currentTrack.id;
            if (isShuffled) {
                currentPlaylist = shuffle([...originalPlaylist]);
            } else {
                currentPlaylist = [...originalPlaylist];
            }
            currentTrackIndex = currentPlaylist.findIndex(t => t.id === currentTrackId);
        }
    });

    audioPlayer.addEventListener('timeupdate', () => {
        seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100 || 0;
        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
        durationEl.textContent = formatTime(audioPlayer.duration);
    });

    seekBar.addEventListener('input', () => {
        audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
    });

    volumeBar.addEventListener('input', () => {
        audioPlayer.volume = volumeBar.value / 100;
    });

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    window.playTrack = (track, startTime = 0) => {
        currentPlaylist = [track];
        currentTrackIndex = 0;
        loadTrack(track, startTime);
    };

    window.playPlaylist = playPlaylist;
});