import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Button, ProgressBar, Dropdown, Form } from 'react-bootstrap';
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaRandom, FaList } from 'react-icons/fa';
import api from '../api';

function Player() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const audioRef = useRef(new Audio());

  useEffect(() => {
    fetchPlaybackState();
    const interval = setInterval(() => {
        if (isPlaying && currentTrack) {
            updateServerState();
        }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      const audio = audioRef.current;

      const handleTimeUpdate = () => {
          setCurrentTime(audio.currentTime);
          if (isFinite(audio.duration)) {
             setDuration(audio.duration);
          }
      };

      const handleEnded = () => {
          setIsPlaying(false);
          // Auto play next would go here (requires queue management)
      };

      const handleLoadedMetadata = () => {
          setDuration(audio.duration);
          if (currentTrack && currentTrack.position && Math.abs(audio.currentTime - currentTrack.position) > 1) {
              audio.currentTime = currentTrack.position;
          }
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      // Media Session API handlers would go here

      return () => {
          audio.removeEventListener('timeupdate', handleTimeUpdate);
          audio.removeEventListener('ended', handleEnded);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
  }, [currentTrack]);

  const fetchPlaybackState = async () => {
      try {
          const res = await api.get('/playback-state/');
          if (res.data && res.data.track) {
              const track = res.data.track;
              // Ensure we have correct URL
              track.stream_url = res.data.trackStreamUrl || `/stream/${track.id}/`;
              track.position = res.data.position;
              loadTrack(track, track.position, false);
          }
      } catch (e) {
          console.error("Error fetching playback state", e);
      }
  };

  const loadTrack = (track, position = 0, autoPlay = true) => {
      setCurrentTrack(track);
      // Logic to prevent reloading if same track?
      // For now, simple reload
      audioRef.current.src = track.stream_url;
      audioRef.current.currentTime = position;

      if (autoPlay) {
          audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.error(e));
      } else {
          setIsPlaying(false);
      }
  };

  // Expose global for now as a bridge
  useEffect(() => {
      window.playTrack = (track) => {
          // ensure stream_url is present
          if (!track.stream_url && track.id) {
             track.stream_url = `/stream/${track.id}/`;
          }
          loadTrack(track, 0, true);
          updateServerState(track, 0);
      };
  }, []);

  const updateServerState = async (track = currentTrack, position = audioRef.current.currentTime) => {
      if (!track) return;
      try {
          await api.post('/playback-state/update_state/', {
              track_id: track.id,
              position: position,
              shuffle: isShuffle
          });
      } catch (e) {
          console.error("Error updating state", e);
      }
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
      // Logic for seeking via progress bar click
      // Requires calculating click position relative to width
      // Simplified: use a range input for seek bar
  };

  if (!currentTrack) return <div className="p-3 text-center text-muted">No track selected</div>;

  return (
    <Container className="py-2">
      <Row className="align-items-center">
        <Col xs={12} md={3} className="d-flex align-items-center mb-2 mb-md-0">
             {currentTrack.icon_url && <img src={currentTrack.icon_url} alt="cover" style={{width: 50, height: 50, marginRight: 10, borderRadius: 4}} />}
             <div className="text-truncate">
                <div className="fw-bold text-truncate">{currentTrack.name}</div>
                <div className="small text-muted text-truncate">{currentTrack.artist}</div>
             </div>
        </Col>
        <Col xs={12} md={6}>
            <div className="d-flex justify-content-center align-items-center mb-1">
                <Button variant="link" className="text-secondary p-0 mx-2"><FaRandom /></Button>
                <Button variant="link" className="text-dark p-0 mx-2"><FaStepBackward /></Button>
                <Button variant="outline-primary" className="mx-3 rounded-circle d-flex align-items-center justify-content-center" style={{width: 40, height: 40}} onClick={togglePlay}>
                    {isPlaying ? <FaPause /> : <FaPlay style={{marginLeft: 2}} />}
                </Button>
                <Button variant="link" className="text-dark p-0 mx-2"><FaStepForward /></Button>
                <Button variant="link" className="text-secondary p-0 mx-2"><FaList /></Button>
            </div>
            <div className="d-flex align-items-center">
                 <span className="small text-muted me-2">{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                 <ProgressBar now={(currentTime / duration) * 100} className="flex-grow-1" style={{ height: '4px', cursor: 'pointer' }} />
                 <span className="small text-muted ms-2">{new Date((duration || 0) * 1000).toISOString().substr(14, 5)}</span>
            </div>
        </Col>
        <Col xs={12} md={3} className="d-none d-md-flex justify-content-end align-items-center">
            {/* Volume control could go here */}
        </Col>
      </Row>
    </Container>
  );
}

export default Player;
