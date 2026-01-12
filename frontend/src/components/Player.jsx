import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Button, ProgressBar, Modal, Form, Dropdown } from 'react-bootstrap';
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaRandom, FaList, FaExpandAlt, FaClock } from 'react-icons/fa';
import api from '../api';
import { Link } from 'react-router-dom';

function Player() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Sleep Timer
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState('');
  const [sleepTimerEndTime, setSleepTimerEndTime] = useState(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(null);

  const audioRef = useRef(new Audio());

  useEffect(() => {
    fetchPlaybackState();
    const interval = setInterval(() => {
        if (isPlaying && currentTrack) {
            updateServerState();
        }
        if (sleepTimerEndTime) {
            const remaining = Math.max(0, Math.floor((sleepTimerEndTime - Date.now()) / 1000));
            setSleepTimerRemaining(remaining);
            if (remaining === 0) {
                audioRef.current.pause();
                setIsPlaying(false);
                setSleepTimerEndTime(null);
                setSleepTimerRemaining(null);
            }
        }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, currentTrack, sleepTimerEndTime]);

  useEffect(() => {
      const audio = audioRef.current;
      audio.playbackRate = playbackSpeed;

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

      return () => {
          audio.removeEventListener('timeupdate', handleTimeUpdate);
          audio.removeEventListener('ended', handleEnded);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
  }, [currentTrack, playbackSpeed]);

  const fetchPlaybackState = async () => {
      try {
          const res = await api.get('/playback-state/');
          if (res.data && res.data.track) {
              const track = res.data.track;
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
      audioRef.current.src = track.stream_url;
      audioRef.current.currentTime = position;

      if (autoPlay) {
          audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.error(e));
      } else {
          setIsPlaying(false);
      }
  };

  useEffect(() => {
      window.playTrack = (track) => {
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

  const startSleepTimer = () => {
      const mins = parseInt(sleepTimerMinutes);
      if (mins > 0) {
          setSleepTimerEndTime(Date.now() + mins * 60 * 1000);
          setShowSleepTimer(false);
      }
  };

  const cancelSleepTimer = () => {
      setSleepTimerEndTime(null);
      setSleepTimerRemaining(null);
      setShowSleepTimer(false);
  };

  const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return "0:00";
      return new Date(seconds * 1000).toISOString().substr(14, 5);
  };

  if (!currentTrack) return <div className="p-3 text-center text-muted bg-light border-top">No track selected</div>;

  return (
    <Container fluid className="py-2 bg-light">
      <Row className="align-items-center">
        <Col xs={12} md={4} className="d-flex align-items-center mb-2 mb-md-0 px-4">
             {currentTrack.icon_url && <img src={currentTrack.icon_url} alt="cover" style={{width: 60, height: 60, marginRight: 15, borderRadius: 4}} />}
             <div className="text-truncate">
                <div className="fw-bold text-truncate">{currentTrack.name}</div>
                <div className="small text-muted text-truncate fst-italic">{currentTrack.artist}</div>
                {/* Playlist info placeholder if available */}
             </div>
        </Col>

        <Col xs={12} md={4} className="d-flex flex-column align-items-center">
            <div className="d-flex justify-content-center align-items-center mb-1 gap-1">
                <Button variant="link" className="text-secondary btn-sm"><FaStepBackward /></Button>
                <Button variant="link" className="text-secondary btn-sm"><FaRandom /></Button>
                <Button variant="primary" className="mx-2 btn-sm px-3" onClick={togglePlay}>
                    {isPlaying ? <FaPause /> : <FaPlay />}
                </Button>
                <Button variant="link" className="text-secondary btn-sm"><FaStepForward /></Button>

                <Dropdown drop="up">
                    <Dropdown.Toggle variant="link" className="text-secondary btn-sm no-caret">
                        {playbackSpeed}x
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                            <Dropdown.Item key={speed} onClick={() => setPlaybackSpeed(speed)} active={playbackSpeed === speed}>
                                {speed}x
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Menu>
                </Dropdown>
            </div>

            <div className="d-flex align-items-center w-100 gap-2">
                 <span className="small text-muted" style={{width: 40, textAlign: 'right'}}>{formatTime(currentTime)}</span>
                 <input
                    type="range"
                    className="form-range flex-grow-1"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => { audioRef.current.currentTime = e.target.value; setCurrentTime(e.target.value); }}
                 />
                 <span className="small text-muted" style={{width: 40}}>{formatTime(duration)}</span>
                 {/* Expand Button */}
                 <Button variant="outline-secondary" size="sm" className="ms-2 border-0">
                    <FaExpandAlt />
                 </Button>
            </div>
        </Col>

        <Col xs={12} md={4} className="d-none d-md-flex justify-content-end align-items-center px-4 gap-2">
            {sleepTimerRemaining !== null ? (
                <Button variant="outline-primary" size="sm" onClick={() => setShowSleepTimer(true)}>
                    <FaClock className="me-1" /> {Math.floor(sleepTimerRemaining / 60)}:{String(sleepTimerRemaining % 60).padStart(2, '0')}
                </Button>
            ) : (
                <Button variant="link" className="text-secondary" onClick={() => setShowSleepTimer(true)}>
                    <FaClock />
                </Button>
            )}
        </Col>
      </Row>

      {/* Sleep Timer Modal */}
      <Modal show={showSleepTimer} onHide={() => setShowSleepTimer(false)} centered size="sm">
          <Modal.Header closeButton>
              <Modal.Title>Sleep Timer</Modal.Title>
          </Modal.Header>
          <Modal.Body>
              {sleepTimerEndTime ? (
                  <div className="text-center">
                      <h3>{Math.floor(sleepTimerRemaining / 60)}:{String(sleepTimerRemaining % 60).padStart(2, '0')}</h3>
                      <Button variant="danger" onClick={cancelSleepTimer} className="mt-3">Cancel Timer</Button>
                  </div>
              ) : (
                  <Form>
                      <Form.Group className="mb-3">
                          <Form.Label>Minutes</Form.Label>
                          <Form.Control
                              type="number"
                              value={sleepTimerMinutes}
                              onChange={e => setSleepTimerMinutes(e.target.value)}
                              autoFocus
                          />
                      </Form.Group>
                      <div className="d-grid">
                          <Button variant="primary" onClick={startSleepTimer}>Start</Button>
                      </div>
                  </Form>
              )}
          </Modal.Body>
      </Modal>
    </Container>
  );
}

export default Player;
