import React, { useState, useEffect, useRef } from 'react';
import { Container, Button, ProgressBar } from 'react-bootstrap';
import { FaPlay, FaPause, FaStepBackward, FaStepForward } from 'react-icons/fa';
import api from '../api';
import { Link } from 'react-router-dom';

function PlayFocus() {
    const [track, setTrack] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // This component relies on the global player state or needs to share context
    // For simplicity, we'll fetch the current state and duplicate rudimentary controls
    // Ideally, Player context should lift state up.

    useEffect(() => {
        fetchState();
        const interval = setInterval(fetchState, 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchState = async () => {
        try {
            const res = await api.get('/playback-state/');
            if (res.data && res.data.track) {
                setTrack(res.data.track);
                setCurrentTime(res.data.position); // Note: this will be stale compared to live player
                setDuration(res.data.duration);
            }
        } catch (e) { console.error(e); }
    };

    if (!track) return <Container className="vh-100 d-flex align-items-center justify-content-center">Loading...</Container>;

    return (
        <Container fluid className="vh-100 bg-dark text-white d-flex flex-column align-items-center justify-content-center">
            <Link to="/" className="position-absolute top-0 start-0 m-4 btn btn-outline-light">Back</Link>

            <div className="text-center mb-5">
                {track.icon_url && <img src={track.icon_url} style={{width: 300, height: 300, borderRadius: 8, boxShadow: '0 0 20px rgba(0,0,0,0.5)'}} className="mb-4" />}
                <h1 className="display-4 fw-bold">{track.name}</h1>
                <h3 className="text-white-50">{track.artist}</h3>
            </div>

            <div className="w-75 mb-4">
                 <ProgressBar now={(currentTime / duration) * 100} style={{height: 8}} />
                 <div className="d-flex justify-content-between mt-2 text-white-50">
                     <span>{new Date(currentTime * 1000).toISOString().substr(14, 5)}</span>
                     <span>{new Date(duration * 1000).toISOString().substr(14, 5)}</span>
                 </div>
            </div>

            <div className="d-flex gap-4">
                <Button variant="outline-light" size="lg" className="rounded-circle p-3"><FaStepBackward /></Button>
                <Button variant="light" size="lg" className="rounded-circle p-3"><FaPlay /></Button>
                <Button variant="outline-light" size="lg" className="rounded-circle p-3"><FaStepForward /></Button>
            </div>
        </Container>
    );
}

export default PlayFocus;
