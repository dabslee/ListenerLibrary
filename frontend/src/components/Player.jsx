import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Button, ProgressBar } from 'react-bootstrap';
import { FaPlay, FaPause, FaStepBackward, FaStepForward } from 'react-icons/fa';
import api from '../api';

function Player() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(new Audio());

  // Check for saved playback state on mount
  useEffect(() => {
    fetchPlaybackState();

    // Interval to update server with progress
    const interval = setInterval(() => {
        if (isPlaying && currentTrack) {
            updateServerState();
        }
    }, 15000); // 15 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      const audio = audioRef.current;

      const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
      const handleEnded = () => setIsPlaying(false);
      const handleLoadedMetadata = () => setDuration(audio.duration);

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);

      return () => {
          audio.removeEventListener('timeupdate', handleTimeUpdate);
          audio.removeEventListener('ended', handleEnded);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
  }, []);

  const fetchPlaybackState = async () => {
      try {
          const res = await api.get('/playback-state/');
          if (res.data && res.data.track) {
              loadTrack(res.data.track, res.data.last_played_position, false);
          }
      } catch (e) {
          console.error("Error fetching playback state", e);
      }
  };

  const loadTrack = (track, position = 0, autoPlay = true) => {
      setCurrentTrack(track);
      audioRef.current.src = track.file_url || `/stream/${track.id}/`; // Fallback if file_url not perfectly absolute
      audioRef.current.currentTime = position;
      if (autoPlay) {
          audioRef.current.play();
          setIsPlaying(true);
      }
  };

  // Expose a global way to play a track (simple event bus or context would be better, but sticking to basics)
  useEffect(() => {
      window.playTrack = (track) => {
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
              // playlist_id: ...
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
      // Logic for seeking
  };

  if (!currentTrack) return <div className="p-3 text-center">No track selected</div>;

  return (
    <Container className="py-3">
      <Row className="align-items-center">
        <Col xs={3} className="text-truncate">
            <strong>{currentTrack.name}</strong><br/>
            <small>{currentTrack.artist}</small>
        </Col>
        <Col xs={6}>
            <div className="d-flex justify-content-center mb-2">
                <Button variant="link" className="text-dark"><FaStepBackward /></Button>
                <Button variant="outline-primary" className="mx-3 rounded-circle" onClick={togglePlay}>
                    {isPlaying ? <FaPause /> : <FaPlay />}
                </Button>
                <Button variant="link" className="text-dark"><FaStepForward /></Button>
            </div>
            <ProgressBar now={(currentTime / duration) * 100} style={{ height: '5px', cursor: 'pointer' }} />
        </Col>
        <Col xs={3} className="text-end">
            {new Date(currentTime * 1000).toISOString().substr(14, 5)} /
            {new Date(duration * 1000).toISOString().substr(14, 5)}
        </Col>
      </Row>
    </Container>
  );
}

export default Player;
