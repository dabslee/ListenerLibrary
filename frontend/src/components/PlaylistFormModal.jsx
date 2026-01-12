import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import api from '../api';

function PlaylistFormModal({ show, onHide, onSuccess, playlist = null }) {
    const [name, setName] = useState('');
    const [image, setImage] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (playlist) {
            setName(playlist.name);
            setImage(null);
        } else {
            setName('');
            setImage(null);
        }
        setError(null);
    }, [playlist, show]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('name', name);
        if (image) formData.append('image', image);

        try {
            if (playlist) {
                await api.patch(`/playlists/${playlist.id}/`, formData);
            } else {
                await api.post('/playlists/', formData);
            }
            onSuccess();
        } catch (err) {
            console.error(err);
            setError('Failed to save playlist.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Form onSubmit={handleSubmit}>
                <Modal.Header closeButton>
                    <Modal.Title>{playlist ? 'Edit Playlist' : 'Create Playlist'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form.Group className="mb-3">
                        <Form.Label>Name</Form.Label>
                        <Form.Control type="text" value={name} onChange={e => setName(e.target.value)} required />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Cover Image</Form.Label>
                        <Form.Control type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide}>Cancel</Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? 'Saving...' : 'Save'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
}

export default PlaylistFormModal;
