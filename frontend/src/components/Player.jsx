import React, { useState, useEffect, useRef } from 'react';
import { Button, Dropdown } from 'react-bootstrap';
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaRandom, FaExpandAlt, FaBackward, FaForward } from 'react-icons/fa';
import api from '../api';
import { Link } from 'react-router-dom';

function Player() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [playlist, setPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);

  const audioRef = useRef(new Audio());

  useEffect(() => {
    const handleGlobalPlayTrack = (track, associatedPlaylist = null, playQueue = []) => {
        if (!track.stream_url && track.id) {
           track.stream_url = `/stream/${track.id}/`;
        }
        loadTrack(track, 0, true);
        updateServerState(track, 0, associatedPlaylist, isShuffle);
        if (associatedPlaylist) {
            setPlaylist(associatedPlaylist);
            setPlaylistTracks(playQueue);
        } else {
            setPlaylist(null);
            setPlaylistTracks([]);
        }
    };

    window.playTrack = handleGlobalPlayTrack;
    window.playPlaylist = (playlist, tracks, startIndex = 0) => {
        if (tracks.length > 0) {
            const trackToPlay = tracks[startIndex];
            handleGlobalPlayTrack(trackToPlay, playlist, tracks);
        }
    };

    window.pauseAudio = () => {
        audioRef.current.pause();
        setIsPlaying(false);
    };

    fetchPlaybackState();
    const interval = setInterval(() => {
        if (isPlaying && currentTrack) {
            updateServerState();
        }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, currentTrack]);

  useEffect(() => {
      const audio = audioRef.current;
      audio.playbackRate = playbackSpeed;

      const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
      const handleLoadedMetadata = () => setDuration(audio.duration);
      const handleEnded = () => playNext();

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('ended', handleEnded);

      return () => {
          audio.removeEventListener('timeupdate', handleTimeUpdate);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('ended', handleEnded);
      };
  }, [currentTrack, playbackSpeed, playlist, isShuffle]);


  const fetchPlaybackState = async () => {
      try {
          const res = await api.get('/playback-state/');
          if (res.data && res.data.track) {
              const state = res.data;
              const track = state.track;
              track.stream_url = state.trackStreamUrl || `/stream/${track.id}/`;
              loadTrack(track, state.position, false);
              setIsShuffle(state.shuffle || false);
              if (state.playlist) {
                  setPlaylist(state.playlist);
                  const tracksRes = await api.get(`/playlists/${state.playlist.id}/tracks/`);
                  setPlaylistTracks(tracksRes.data);
              }
          }
      } catch (e) { console.error("Error fetching playback state", e); }
  };

  const loadTrack = (track, position = 0, autoPlay = true) => {
      setCurrentTrack(track);
      audioRef.current.src = track.stream_url;
      audioRef.current.currentTime = position;
      if (autoPlay) {
          audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.error(e));
      } else {
          setIsPlaying(false);
      }
  };

  const updateServerState = async (track = currentTrack, position = audioRef.current.currentTime, pl = playlist, shuffle = isShuffle) => {
      if (!track) return;
      try {
          await api.post('/api/playback-state/', {
              track_id: track.id,
              position: position,
              playlist_id: pl ? pl.id : null,
              shuffle: shuffle
          });
      } catch (e) { console.error("Error updating state", e); }
  };

  const togglePlay = () => {
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const seek = (seconds) => {
    audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
  };

  const playNext = () => {
    if (!playlist || playlistTracks.length === 0) return;
    let currentIndex = playlistTracks.findIndex(t => t.id === currentTrack.id);
    let nextIndex;
    if (isShuffle) {
        nextIndex = Math.floor(Math.random() * playlistTracks.length);
    } else {
        nextIndex = (currentIndex + 1) % playlistTracks.length;
    }
    window.playTrack(playlistTracks[nextIndex], playlist, playlistTracks);
  };

  const playPrev = () => {
    if (!playlist || playlistTracks.length === 0) return;
    let currentIndex = playlistTracks.findIndex(t => t.id === currentTrack.id);
    const prevIndex = (currentIndex - 1 + playlistTracks.length) % playlistTracks.length;
    window.playTrack(playlistTracks[prevIndex], playlist, playlistTracks);
  };


  const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return "0:00";
      return new Date(seconds * 1000).toISOString().substr(14, 5);
  };

  if (!currentTrack) return <div className="p-3 text-center text-muted bg-light border-top">No track selected</div>;

  return (
    <footer className="fixed-bottom border-top py-2">
      <div className="row align-items-center py-3 px-5">
        <div className="d-flex flex-md-row flex-column align-items-center justify-content-between gap-4">
            <div className="d-flex align-items-center col-md-4">
                {currentTrack.icon_url && <img src={currentTrack.icon_url} className="me-4" style={{width: 60, height: 60, display: 'block', borderRadius: 4}} />}
                <div>
                    <span className="fw-bold">{currentTrack.name}</span>
                    <br/>
                    <span className="text-muted fst-italic">{currentTrack.artist || 'No artist'}</span>
                    {playlist && <div className="text-muted small"><i className="fas fa-headphones me-1"></i> <span className="fw-bold">{playlist.name}</span></div>}
                </div>
            </div>

            <div className="player-buttons-group d-flex align-items-center gap-1">
                {playlist && <Button variant="secondary" size="sm" onClick={playPrev}><FaStepBackward /></Button>}
                <Button variant="secondary" size="sm" onClick={() => seek(-10)}><FaBackward /></Button>
                <Button variant="primary" size="sm" onClick={togglePlay}>{isPlaying ? <FaPause /> : <FaPlay />}</Button>
                <Button variant="secondary" size="sm" onClick={() => seek(10)}><FaForward /></Button>
                {playlist && <Button variant="secondary" size="sm" onClick={playNext}><FaStepForward /></Button>}
                {playlist && <Button variant={isShuffle ? "primary" : "secondary"} size="sm" onClick={() => setIsShuffle(!isShuffle)}><FaRandom /></Button>}

                <Dropdown drop="up" onSelect={(key) => setPlaybackSpeed(parseFloat(key))}>
                    <Dropdown.Toggle variant="secondary" size="sm" className="no-caret">{playbackSpeed}x</Dropdown.Toggle>
                    <Dropdown.Menu>
                        {[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map(speed =>
                            <Dropdown.Item key={speed} eventKey={speed} active={playbackSpeed === speed}>{speed}x</Dropdown.Item>
                        )}
                    </Dropdown.Menu>
                </Dropdown>
            </div>

            <div className="seek-bar-group d-flex align-items-center gap-1 flex-grow-1">
                 <span className="time-display">{formatTime(currentTime)}</span>
                 <input type="range" className="form-range mx-2" min={0} max={duration || 100} value={currentTime}
                    onChange={(e) => { audioRef.current.currentTime = e.target.value; setCurrentTime(e.target.value); }}
                 />
                 <span className="time-display">{formatTime(duration)}</span>
                 <Link to="/play-focus" className="btn btn-outline-secondary btn-sm ms-2" title="Expand Player"><FaExpandAlt /></Link>
            </div>
        </div>
      </div>
    </footer>
  );
}

export default Player;
