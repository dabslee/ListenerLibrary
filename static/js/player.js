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
    const playerPlaylistInfo = document.getElementById('player-playlist-info');
    const playerPlaylistName = document.getElementById('player-playlist-name');

    // Sleep Timer UI
    const sleepTimerModal = document.getElementById('sleep-timer-modal');
    const setupTimerView = document.getElementById('setup-timer-view');
    const activeTimerView = document.getElementById('active-timer-view');
    const sleepTimerMinutesInput = document.getElementById('sleep-timer-minutes');
    const startSleepTimerBtn = document.getElementById('start-sleep-timer');
    const cancelSleepTimerBtn = document.getElementById('cancel-sleep-timer');
    const pauseResumeSleepTimerBtn = document.getElementById('pause-resume-sleep-timer');
    const sleepTimerCountdown = document.getElementById('sleep-timer-countdown');
    const sleepTimerNavDisplay = document.getElementById('sleep-timer-display');
    const sleepTimerNavCountdown = document.getElementById('sleep-timer-nav-countdown');
    const sleepTimerMobileCountdown = document.getElementById('sleep-timer-mobile-countdown');


    // --- STATE VARIABLES ---
    let currentTrack = null; // Store the full track object
    let saveInterval = null;
    let podcastPositions = {};

    // Sleep Timer State
    let sleepTimerInterval = null;
    let sleepTimerEndTime = null;
    let isSleepTimerPaused = false;
    let sleepTimerRemainingPausedTime = 0;

    // Playlist State
    let currentPlaylist = null; // {id, name}
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

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
        }
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

    // --- SLEEP TIMER LOGIC ---
    function updateTimerDisplay() {
        if (!sleepTimerEndTime || isSleepTimerPaused) return;

        const remainingSeconds = Math.round((sleepTimerEndTime - Date.now()) / 1000);

        if (remainingSeconds <= 0) {
            audioPlayer.pause();
            showToast("Playback paused by sleep timer.");
            cancelTimer(false); // Don't close the modal if it's open
            return;
        }

        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        sleepTimerCountdown.textContent = formattedTime;
        sleepTimerNavCountdown.textContent = formattedTime;
        sleepTimerMobileCountdown.textContent = formattedTime;
    }

    function startTimer(minutes) {
        if (minutes <= 0) return;

        // Reset state before starting a new timer
        cancelTimer(false);

        isSleepTimerPaused = false;
        sleepTimerEndTime = Date.now() + minutes * 60 * 1000;
        localStorage.setItem('sleepTimerEndTime', sleepTimerEndTime);
        localStorage.removeItem('isSleepTimerPaused');
        localStorage.removeItem('sleepTimerRemainingPausedTime');

        sleepTimerInterval = setInterval(updateTimerDisplay, 1000);

        updateTimerDisplay();

        setupTimerView.style.display = 'none';
        activeTimerView.style.display = 'block';

        sleepTimerNavDisplay.classList.remove('d-none', 'timer-paused');
        sleepTimerMobileCountdown.classList.remove('d-none', 'timer-paused');

        pauseResumeSleepTimerBtn.textContent = 'Pause';
        showToast(`Sleep timer set for ${minutes} minutes.`);

        const modalInstance = bootstrap.Modal.getInstance(sleepTimerModal);
        if (modalInstance) {
            modalInstance.hide();
        }
    }

    function cancelTimer(closeModal = true) {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        sleepTimerEndTime = null;
        isSleepTimerPaused = false;
        sleepTimerRemainingPausedTime = 0;

        localStorage.removeItem('sleepTimerEndTime');
        localStorage.removeItem('isSleepTimerPaused');
        localStorage.removeItem('sleepTimerRemainingPausedTime');

        setupTimerView.style.display = 'block';
        activeTimerView.style.display = 'none';

        sleepTimerNavDisplay.classList.add('d-none');
        sleepTimerNavDisplay.classList.remove('timer-paused');
        sleepTimerMobileCountdown.classList.add('d-none');
        sleepTimerMobileCountdown.classList.remove('timer-paused');

        sleepTimerMinutesInput.value = '';

        if (closeModal) {
            const modalInstance = bootstrap.Modal.getInstance(sleepTimerModal);
            if (modalInstance) modalInstance.hide();
        }
    }

    function togglePauseTimer() {
        isSleepTimerPaused = !isSleepTimerPaused;

        if (isSleepTimerPaused) {
            // Pause the timer
            if (sleepTimerInterval) clearInterval(sleepTimerInterval);
            sleepTimerRemainingPausedTime = sleepTimerEndTime - Date.now();

            localStorage.setItem('isSleepTimerPaused', 'true');
            localStorage.setItem('sleepTimerRemainingPausedTime', sleepTimerRemainingPausedTime);

            pauseResumeSleepTimerBtn.textContent = 'Resume';
            sleepTimerNavDisplay.classList.add('timer-paused');
            sleepTimerMobileCountdown.classList.add('timer-paused');
            showToast("Sleep timer paused.");
        } else {
            // Resume the timer
            sleepTimerEndTime = Date.now() + sleepTimerRemainingPausedTime;

            localStorage.setItem('sleepTimerEndTime', sleepTimerEndTime);
            localStorage.removeItem('isSleepTimerPaused');
            localStorage.removeItem('sleepTimerRemainingPausedTime');

            sleepTimerInterval = setInterval(updateTimerDisplay, 1000);
            pauseResumeSleepTimerBtn.textContent = 'Pause';
            sleepTimerNavDisplay.classList.remove('timer-paused');
            sleepTimerMobileCountdown.classList.remove('timer-paused');
            showToast("Sleep timer resumed.");
        }

        const modalInstance = bootstrap.Modal.getInstance(sleepTimerModal);
        if (modalInstance) {
            modalInstance.hide();
        }
    }


    // --- PLAYBACK STATE MANAGEMENT ---
    async function savePlaybackState() {
        if (!currentTrack || isNaN(audioPlayer.currentTime)) return;

        const position = audioPlayer.currentTime;
        const playbackState = {
            track_id: currentTrack.id,
            position: position,
            playlist_id: currentPlaylist ? currentPlaylist.id : null,
            shuffle: isShuffle,
            timestamp: new Date().toISOString()
        };

        if (navigator.onLine) {
            try {
                await fetch('/api/update_playback_state/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                    body: JSON.stringify(playbackState)
                });
            } catch (error) {
                console.error('Error saving playback state:', error);
                // If the network request fails, save locally
                localStorage.setItem('offlinePlaybackState', JSON.stringify(playbackState));
            }
        } else {
            localStorage.setItem('offlinePlaybackState', JSON.stringify(playbackState));
        }
    }

    async function syncOfflinePlaybackState() {
        const offlineStateJSON = localStorage.getItem('offlinePlaybackState');
        if (offlineStateJSON) {
            const offlineState = JSON.parse(offlineStateJSON);
            try {
                const response = await fetch('/api/update_playback_state/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                    body: JSON.stringify(offlineState)
                });
                if (response.ok) {
                    localStorage.removeItem('offlinePlaybackState');
                    showToast('Offline playback progress synced.', 'success');
                }
            } catch (error) {
                console.error('Error syncing offline playback state:', error);
            }
        }
    }

    window.addEventListener('online', syncOfflinePlaybackState);

    // --- UI UPDATE ---
    function updatePlaylistUI() {
        if (currentPlaylist && currentPlaylist.id) {
            playerPlaylistName.textContent = currentPlaylist.name;
            playerPlaylistInfo.style.display = 'block';
            prevTrackBtn.style.display = 'inline-block';
            nextTrackBtn.style.display = 'inline-block';
            shuffleBtn.style.display = 'inline-block';
            if (isShuffle) {
                shuffleBtn.classList.add('active', 'btn-primary');
                shuffleBtn.classList.remove('btn-secondary');
            } else {
                shuffleBtn.classList.remove('active', 'btn-primary');
                shuffleBtn.classList.add('btn-secondary');
            }
        } else {
            playerPlaylistInfo.style.display = 'none';
            prevTrackBtn.style.display = 'none';
            nextTrackBtn.style.display = 'none';
            shuffleBtn.style.display = 'none';
        }
        updateNextPrevButtons();
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
                album: currentPlaylist ? currentPlaylist.name : 'ListenerLibrary',
                artwork: iconUrl ? [
                    { src: iconUrl, sizes: '96x96', type: 'image/png' },
                    { src: iconUrl, sizes: '128x128', type: 'image/png' },
                    { src: iconUrl, sizes: '192x192', type: 'image/png' },
                    { src: iconUrl, sizes: '256x256', type: 'image/png' },
                    { src: iconUrl, sizes: '384x384', type: 'image/png' },
                    { src: iconUrl, sizes: '512x512', type: 'image/png' },
                ] : []
            });

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

        // If a track is currently playing, save its state before switching
        if (currentTrack && !audioPlayer.paused) {
            savePlaybackState();
        }

        currentTrack = track;
        if (saveInterval) clearInterval(saveInterval);

        // Update UI elements immediately
        playerTrackName.textContent = track.name;
        playerTrackArtist.textContent = track.artist || 'No artist';
        const iconUrl = (track.icon_url && track.icon_url !== 'None' && track.icon_url !== 'null') ? track.icon_url : '';
        playerIcon.src = iconUrl;
        playerIcon.style.display = iconUrl ? 'inline-block' : 'none';

        updateMediaSession();

        // Always use the position from the track object if available (for both songs and podcasts)
        const startPosition = track.position || 0;

        // --- More Robust Playback Logic ---
        // 1. Stop any current playback and reset the player's state
        audioPlayer.pause();
        audioPlayer.removeAttribute('src'); // Fully disassociate the old source
        audioPlayer.load(); // This resets the media element

        // 2. Set the new source
        audioPlayer.src = track.stream_url;

        // 3. Load the new source
        audioPlayer.load();

        // 4. Play and then seek
        // The play() method returns a promise. We wait for it to resolve before seeking.
        // This is the most reliable way to ensure the player is ready for a seek command.
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(_ => {
                // Playback has started, now it's safe to seek.
                audioPlayer.currentTime = startPosition;
            }).catch(error => {
                // Autoplay was prevented.
                console.error("Playback was prevented:", error);
                // We can't automatically start, but we can still set the time for when the user clicks play.
                audioPlayer.currentTime = startPosition;
            });
        }
    }

    function playNextTrack() {
        if (playQueue.length === 0 || currentTrackIndex >= playQueue.length - 1) return;
        currentTrackIndex++;
        loadAndPlayTrack(playQueue[currentTrackIndex]);
        updateNextPrevButtons();
    }

    function playPrevTrack() {
        if (playQueue.length === 0 || currentTrackIndex <= 0) return;
        currentTrackIndex--;
        loadAndPlayTrack(playQueue[currentTrackIndex]);
        updateNextPrevButtons();
    }

    // --- GLOBAL FUNCTIONS ---
    window.playTrack = function(trackUrl, trackName, trackArtist, iconUrl, trackId, trackType, position = 0) {
        currentPlaylist = null;
        playQueue = [];
        originalPlaylist = [];
        shuffledPlaylist = [];
        currentTrackIndex = -1;
        isShuffle = false;
        updatePlaylistUI();

        const trackObject = {
            id: trackId,
            name: trackName,
            artist: trackArtist,
            icon_url: iconUrl,
            stream_url: trackUrl,
            type: trackType,
            position: position
        };
        loadAndPlayTrack(trackObject);
    };

    window.playPlaylist = function(playlistId, playlistName, playlistItems, startIndex = 0) {
        currentPlaylist = { id: playlistId, name: playlistName };
        originalPlaylist = [...playlistItems];
        shuffledPlaylist = shuffleArray(originalPlaylist);
        playQueue = isShuffle ? shuffledPlaylist : originalPlaylist;

        const startTrack = playlistItems[startIndex];
        currentTrackIndex = playQueue.findIndex(t => t.id === startTrack.id);
        if (currentTrackIndex === -1) currentTrackIndex = 0;

        loadAndPlayTrack(playQueue[currentTrackIndex]);
        updatePlaylistUI();
    };

    window.loadPlaybackState = function(state) {
        currentTrack = {
            id: state.trackId,
            name: state.trackName,
            artist: state.trackArtist,
            icon_url: state.trackIcon,
            stream_url: state.trackStreamUrl,
            type: state.trackType,
            position: state.position
        };
        isShuffle = state.shuffle;
        currentPlaylist = state.playlist;

        if (currentPlaylist && currentPlaylist.id) {
            fetch(`/api/playlist_tracks/${currentPlaylist.id}/`)
                .then(response => response.json())
                .then(tracks => {
                    originalPlaylist = tracks;
                    shuffledPlaylist = shuffleArray(originalPlaylist);
                    playQueue = isShuffle ? shuffledPlaylist : originalPlaylist;
                    currentTrackIndex = playQueue.findIndex(t => t.id === currentTrack.id);
                    loadAndPlayTrack(currentTrack);
                    updatePlaylistUI();
                });
        } else {
            originalPlaylist = [];
            shuffledPlaylist = [];
            playQueue = [];
            currentTrackIndex = -1;
            loadAndPlayTrack(currentTrack);
            updatePlaylistUI();
        }
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
        playNextTrack();
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


    seekBar.addEventListener('input', () => {
        if (audioPlayer.duration) {
            audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
        }
    });

    nextTrackBtn.addEventListener('click', playNextTrack);
    prevTrackBtn.addEventListener('click', playPrevTrack);

    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;

        if (originalPlaylist.length > 0) {
            playQueue = isShuffle ? shuffledPlaylist : originalPlaylist;
            if (currentTrack) {
                currentTrackIndex = playQueue.findIndex(t => t.id === currentTrack.id);
            }
        }
        updatePlaylistUI();
        savePlaybackState();
    });

    function updateNextPrevButtons() {
        const hasQueue = playQueue.length > 0;
        prevTrackBtn.disabled = !hasQueue || currentTrackIndex <= 0;
        nextTrackBtn.disabled = !hasQueue || currentTrackIndex >= playQueue.length - 1;
    }

    // --- INITIALIZATION ---
    function initializeSleepTimer() {
        const savedEndTime = localStorage.getItem('sleepTimerEndTime');
        const savedIsPaused = localStorage.getItem('isSleepTimerPaused');
        const savedRemainingPausedTime = localStorage.getItem('sleepTimerRemainingPausedTime');

        if (savedEndTime) {
            sleepTimerEndTime = parseInt(savedEndTime, 10);

            if (savedIsPaused === 'true' && savedRemainingPausedTime) {
                // Timer was paused
                isSleepTimerPaused = true;
                sleepTimerRemainingPausedTime = parseInt(savedRemainingPausedTime, 10);
                const remainingSeconds = Math.round(sleepTimerRemainingPausedTime / 1000);
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

                sleepTimerCountdown.textContent = formattedTime;
                sleepTimerNavCountdown.textContent = formattedTime;
                sleepTimerMobileCountdown.textContent = formattedTime;

                sleepTimerNavDisplay.classList.remove('d-none');
                sleepTimerNavDisplay.classList.add('timer-paused');
                sleepTimerMobileCountdown.classList.remove('d-none');
                sleepTimerMobileCountdown.classList.add('timer-paused');
                pauseResumeSleepTimerBtn.textContent = 'Resume';

            } else {
                // Timer was running
                isSleepTimerPaused = false;
                const remainingSeconds = Math.round((sleepTimerEndTime - Date.now()) / 1000);
                if (remainingSeconds > 0) {
                    sleepTimerInterval = setInterval(updateTimerDisplay, 1000);
                    updateTimerDisplay();
                    sleepTimerNavDisplay.classList.remove('d-none', 'timer-paused');
                    sleepTimerMobileCountdown.classList.remove('d-none', 'timer-paused');
                    pauseResumeSleepTimerBtn.textContent = 'Pause';
                } else {
                    // Timer expired while away
                    cancelTimer(false);
                }
            }
        }
    }

    async function initializePlayer() {
        const podcastDataEl = document.getElementById('podcast-positions-data');
        if (podcastDataEl) {
            try {
                podcastPositions = JSON.parse(podcastDataEl.textContent);
                podcastPositions = Object.fromEntries(Object.entries(podcastPositions).map(([k, v]) => [Number(k), v]));
            } catch (e) { console.error("Could not parse podcast positions data:", e); }
        }

        const playbackStateEl = document.getElementById('playback-state-data');
        const playbackStateText = playbackStateEl.textContent.trim();

        if (!playbackStateText) {
            document.title = 'ListenerLibrary';
            updatePlaylistUI();
            return;
        }

        try {
            const state = JSON.parse(playbackStateText);
            currentTrack = {
                id: state.trackId,
                name: state.trackName,
                artist: state.trackArtist,
                icon_url: state.trackIcon,
                stream_url: state.trackStreamUrl,
                type: state.trackType,
                position: state.position
            };
            isShuffle = state.shuffle;
            currentPlaylist = state.playlist;

            playerTrackName.textContent = currentTrack.name;
            playerTrackArtist.textContent = currentTrack.artist || 'No artist';
            const iconUrl = (currentTrack.icon_url && currentTrack.icon_url !== 'None' && currentTrack.icon_url !== 'null') ? currentTrack.icon_url : '';
            playerIcon.src = iconUrl;
            playerIcon.style.display = iconUrl ? 'inline-block' : 'none';
            updateMediaSession();

            audioPlayer.src = currentTrack.stream_url;
            const startPosition = (currentTrack.type === 'podcast' && currentTrack.position)
                ? currentTrack.position
                : 0;

            audioPlayer.addEventListener('canplay', () => {
                if (isFinite(audioPlayer.duration)) {
                    audioPlayer.currentTime = startPosition;
                    currentTimeEl.textContent = formatTime(startPosition);
                    durationEl.textContent = formatTime(audioPlayer.duration);
                    seekBar.value = (audioPlayer.duration > 0) ? (startPosition / audioPlayer.duration) * 100 : 0;
                }
                // audioPlayer.play().catch(e => console.error("Playback error:", e));
            }, { once: true });
            audioPlayer.load();

            if (currentPlaylist && currentPlaylist.id) {
                try {
                    const response = await fetch(`/api/playlist_tracks/${currentPlaylist.id}/`);
                    if (!response.ok) throw new Error('Failed to fetch playlist');
                    const tracks = await response.json();

                    originalPlaylist = tracks;
                    shuffledPlaylist = shuffleArray(originalPlaylist);
                    playQueue = isShuffle ? shuffledPlaylist : originalPlaylist;
                    currentTrackIndex = playQueue.findIndex(t => t.id === currentTrack.id);
                } catch (e) {
                    console.error("Failed to load playlist tracks:", e);
                    currentPlaylist = null;
                }
            }

        } catch (e) {
            console.error("Could not parse initial playback state:", e);
            document.title = 'ListenerLibrary';
        } finally {
            updatePlaylistUI();
        }
    }

    window.addEventListener('beforeunload', savePlaybackState);
    skipBackBtn.addEventListener('click', () => { if (audioPlayer.src) audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15); });
    skipForwardBtn.addEventListener('click', () => { if (audioPlayer.src) audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 15); });
    playbackSpeed.addEventListener('change', () => { if (audioPlayer.src) audioPlayer.playbackRate = parseFloat(playbackSpeed.value); });
    audioPlayer.addEventListener('error', (e) => console.error('Audio Player Error:', audioPlayer.error, 'Event:', e));

    document.addEventListener('keydown', (event) => {
        const activeElement = document.activeElement;
        const targetTagName = activeElement ? activeElement.tagName.toLowerCase() : null;
        if (['input', 'select', 'textarea', 'button'].includes(targetTagName)) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        switch (event.key) {
            case ' ': event.preventDefault(); if (playPauseBtn) playPauseBtn.click(); break;
            case 'ArrowLeft': event.preventDefault(); if (skipBackBtn) skipBackBtn.click(); break;
            case 'ArrowRight': event.preventDefault(); if (skipForwardBtn) skipForwardBtn.click(); break;
        }
    });

    // --- SLEEP TIMER EVENT LISTENERS ---
    startSleepTimerBtn.addEventListener('click', () => {
        const minutes = parseInt(sleepTimerMinutesInput.value, 10);
        if (!isNaN(minutes) && minutes > 0) {
            startTimer(minutes);
        } else {
            showToast("Please enter a valid number of minutes.", "var(--bs-danger)");
        }
    });

    cancelSleepTimerBtn.addEventListener('click', () => {
        cancelTimer(true);
        showToast("Sleep timer cancelled.");
    });

    pauseResumeSleepTimerBtn.addEventListener('click', togglePauseTimer);

    sleepTimerModal.addEventListener('show.bs.modal', () => {
        // When modal opens, show the correct view based on timer state
        if (sleepTimerEndTime) {
            setupTimerView.style.display = 'none';
            activeTimerView.style.display = 'block';
            updateTimerDisplay(); // Ensure countdown is up-to-date
        } else {
            setupTimerView.style.display = 'block';
            activeTimerView.style.display = 'none';
        }
    });

    sleepTimerNavDisplay.addEventListener('click', () => {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(sleepTimerModal);
        modalInstance.show();
    });


    initializePlayer();
    initializeSleepTimer();

    // --- OFFLINE LOGIC ---
    function updateOfflineIcon(button, status) {
        const icon = button.querySelector('i');
        button.dataset.offlineStatus = status;

        switch (status) {
            case 'offline':
                icon.className = 'fas fa-cloud text-success';
                button.title = 'Remove from offline';
                break;
            case 'downloading':
                icon.className = 'fas fa-spinner fa-spin';
                button.title = 'Downloading...';
                button.disabled = true;
                break;
            case 'not_offline':
            default:
                icon.className = 'fas fa-cloud-download-alt';
                button.title = 'Save for offline';
                button.disabled = false;
                break;
        }
    }

    async function toggleOfflineStatus(button) {
        const trackId = button.dataset.trackId;
        const initialStatus = button.dataset.offlineStatus;
        const trackUrl = `/track/${trackId}/stream/`;

        // Optimistically update UI to downloading
        updateOfflineIcon(button, 'downloading');

        try {
            // Request persistent storage if not already granted
            if (navigator.storage && navigator.storage.persist) {
                const isPersisted = await navigator.storage.persisted();
                if (!isPersisted) {
                    const result = await navigator.storage.persist();
                    if (!result) {
                        showToast("Could not get permission for persistent storage. Offline tracks might be cleared by the browser.", "warning");
                    }
                }
            }

            const response = await fetch('/api/toggle_offline/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify({ track_id: trackId })
            });

            if (!response.ok) throw new Error('Server error');

            const data = await response.json();

            if (data.status === 'success') {
                if (navigator.serviceWorker.controller) {
                    const action = data.action === 'added' ? 'cache-track' : 'delete-track';
                    navigator.serviceWorker.controller.postMessage({
                        action: action,
                        url: trackUrl
                    });
                }
            } else {
                throw new Error(data.message || 'Failed to toggle status');
            }
        } catch (error) {
            console.error('Error toggling offline status:', error);
            showToast('An error occurred during the process.', 'error');
            updateOfflineIcon(button, initialStatus); // Revert on error
        }
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            const { status, url } = event.data;
            const trackId = url.match(/track\/(\d+)\/stream/)[1];
            const button = document.querySelector(`.offline-toggle-btn[data-track-id="${trackId}"]`);
            if (!button) return;

            if (status === 'success') {
                const currentStatus = button.dataset.offlineStatus;
                // 'downloading' implies the next state is 'offline'
                const newStatus = (currentStatus === 'downloading') ? 'offline' : 'not_offline';
                updateOfflineIcon(button, newStatus);
                showToast(`Track successfully made ${newStatus === 'offline' ? 'available offline' : 'online only'}.`, 'success');
            } else {
                showToast('Failed to update offline status.', 'error');
                // Revert to the state before 'downloading'
                const previousStatus = button.dataset.offlineStatus === 'downloading' ? 'not_offline' : 'offline';
                updateOfflineIcon(button, previousStatus);
            }
        });
    }

    // Use event delegation for offline buttons
    document.addEventListener('click', function(e) {
        const button = e.target.closest('.offline-toggle-btn');
        if (button) {
            e.stopPropagation();
            toggleOfflineStatus(button);
        }
    });

    // Initial icon setup
    document.querySelectorAll('.offline-toggle-btn').forEach(button => {
        updateOfflineIcon(button, button.dataset.offlineStatus);
    });

    // --- OFFLINE MODE TOGGLE ---
    const offlineModeToggle = document.getElementById('offline-mode-toggle');

    function setOfflineMode(isOffline) {
        document.body.classList.toggle('offline-mode', isOffline);

        // Filter track list
        document.querySelectorAll('.track-item').forEach(item => {
            const button = item.querySelector('.offline-toggle-btn');
            const isTrackOffline = button && button.dataset.offlineStatus === 'offline';
            if (isOffline && !isTrackOffline) {
                item.classList.add('d-none'); // Hide non-offline tracks
            } else {
                item.classList.remove('d-none');
            }
        });

        // Disable/enable server-dependent UI elements
        const elementsToDisable = [
            document.getElementById('search-input'),
            document.getElementById('artist-filter'),
            document.getElementById('playlist-filter'),
            document.getElementById('sort-select'),
            ...document.querySelectorAll('.playlist-management-btn'), // Add this class to playlist buttons
            ...document.querySelectorAll('.bookmark-management-btn'), // Add this class to bookmark buttons
        ];

        elementsToDisable.forEach(el => {
            if (el) el.disabled = isOffline;
        });

        showToast(isOffline ? 'Offline mode enabled.' : 'Offline mode disabled.', 'info');
    }

    if (offlineModeToggle) {
        offlineModeToggle.addEventListener('change', function() {
            setOfflineMode(this.checked);
        });
    }
});