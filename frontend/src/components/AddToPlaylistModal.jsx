import React, { useState, useEffect } from 'react';
import { Modal, ListGroup, Button, Form } from 'react-bootstrap';
import api from '../api';

function AddToPlaylistModal({ show, onHide, trackId }) {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (show) {
            fetchPlaylists();
        }
    }, [show]);

    const fetchPlaylists = async () => {
        setLoading(true);
        try {
            const res = await api.get('/playlists/');
            setPlaylists(res.data.results || res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (playlistId) => {
        try {
            await api.post(`/playlists/${playlistId}/add_track/`, { track_id: trackId });
            // Ideally we show feedback or close, but "add/remove" toggle logic is more complex
            // API currently just "adds" or "removes" based on endpoints.
            // The DRF viewset has explicit add_track and remove_track actions.
            // Let's assume add for now.
            onHide();
        } catch (e) {
            if (e.response && e.response.data.status === 'exists') {
                alert('Track already in playlist');
            } else {
                console.error(e);
            }
        }
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>Add to Playlist</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {loading ? <div>Loading...</div> : (
                    <ListGroup>
                        {playlists.map(p => (
                            <ListGroup.Item key={p.id} action onClick={() => handleToggle(p.id)}>
                                {p.name}
                            </ListGroup.Item>
                        ))}
                        {playlists.length === 0 && <div>No playlists found.</div>}
                    </ListGroup>
                )}
            </Modal.Body>
        </Modal>
    );
}

export default AddToPlaylistModal;
