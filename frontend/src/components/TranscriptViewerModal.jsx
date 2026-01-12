import React, { useState, useEffect } from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';
import api from '../api';

function TranscriptViewerModal({ show, onHide, track }) {
    const [transcript, setTranscript] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (show && track) {
            fetchTranscript();
        } else {
            setTranscript(null);
            setError(null);
        }
    }, [show, track]);

    const fetchTranscript = async () => {
        setLoading(true);
        setError(null);
        try {
            // Check if backend provides a direct endpoint or if we rely on the one I added
            const res = await api.get(`/tracks/${track.id}/transcript/`);
            if (res.data.status === 'success') {
                setTranscript(res.data.transcript);
            } else {
                setError("Transcript not available.");
            }
        } catch (e) {
            console.error(e);
            setError("Failed to load transcript.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal show={show} onHide={onHide} size="lg" scrollable>
            <Modal.Header closeButton>
                <Modal.Title>Transcript: {track?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {loading ? (
                    <div className="text-center"><Spinner animation="border" /></div>
                ) : error ? (
                    <div className="alert alert-warning">{error}</div>
                ) : transcript ? (
                    <div>
                        {transcript.map((line, idx) => (
                            <div key={idx} className="mb-2 transcript-line">
                                <small className="text-muted d-block font-monospace">
                                    {new Date(line.start * 1000).toISOString().substr(14, 8)}
                                </small>
                                <span>{line.text}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div>No transcript data found.</div>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Close</Button>
            </Modal.Footer>
        </Modal>
    );
}

export default TranscriptViewerModal;
