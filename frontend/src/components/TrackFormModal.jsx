import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import api from '../api';

function TrackFormModal({ show, onHide, onSuccess, track = null }) {
    const [name, setName] = useState('');
    const [artist, setArtist] = useState('');
    const [type, setType] = useState('song');
    const [file, setFile] = useState(null);
    const [icon, setIcon] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (track) {
            setName(track.name);
            setArtist(track.artist || '');
            setType(track.type);
            setFile(null); // Can't preset file input
            setIcon(null);
        } else {
            setName('');
            setArtist('');
            setType('song');
            setFile(null);
            setIcon(null);
        }
        setError(null);
    }, [track, show]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('name', name);
        formData.append('artist', artist);
        formData.append('type', type);
        if (file) formData.append('file', file);
        if (icon) formData.append('icon', icon);

        try {
            if (track) {
                await api.patch(`/tracks/${track.id}/`, formData);
            } else {
                if (!file) {
                    setError("Audio file is required for new tracks.");
                    setLoading(false);
                    return;
                }
                await api.post('/tracks/', formData);
            }
            onSuccess();
        } catch (err) {
            console.error(err);
            // Parse DRF validation errors
            if (err.response && err.response.data) {
                const msg = Object.values(err.response.data).flat().join(' ');
                setError(msg || 'Failed to save track.');
            } else {
                setError('An error occurred.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Form onSubmit={handleSubmit}>
                <Modal.Header closeButton>
                    <Modal.Title>{track ? 'Edit Track' : 'Upload Track'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}

                    <Form.Group className="mb-3">
                        <Form.Label>Name</Form.Label>
                        <Form.Control type="text" value={name} onChange={e => setName(e.target.value)} required />
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Artist</Form.Label>
                        <Form.Control type="text" value={artist} onChange={e => setArtist(e.target.value)} />
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Type</Form.Label>
                        <Form.Select value={type} onChange={e => setType(e.target.value)}>
                            <option value="song">Song</option>
                            <option value="podcast">Podcast</option>
                        </Form.Select>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Audio File {track && '(Leave empty to keep current)'}</Form.Label>
                        <Form.Control type="file" accept="audio/*" onChange={e => setFile(e.target.files[0])} />
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Cover Image</Form.Label>
                        <Form.Control type="file" accept="image/*" onChange={e => setIcon(e.target.files[0])} />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide}>Cancel</Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? 'Saving...' : (track ? 'Save Changes' : 'Upload')}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
}

export default TrackFormModal;
