import React, { useState } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import api from '../api';

function PlaylistUploadModal({ show, onHide, onSuccess }) {
    const [name, setName] = useState('');
    const [files, setFiles] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!files || files.length === 0) {
            setError("Please select audio files to upload.");
            setLoading(false);
            return;
        }

        const formData = new FormData();
        formData.append('name', name);
        for (let i = 0; i < files.length; i++) {
            formData.append('tracks', files[i]);
        }

        try {
            await api.post('/playlists/upload/', formData);
            onSuccess();
        } catch (err) {
            console.error(err);
            if (err.response && err.response.data) {
                const msg = Object.values(err.response.data).flat().join(' ');
                setError(msg || 'Failed to upload playlist.');
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
                    <Modal.Title>Upload Playlist</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form.Group className="mb-3">
                        <Form.Label>Playlist Name</Form.Label>
                        <Form.Control
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                        />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Audio Files</Form.Label>
                        <Form.Control
                            type="file"
                            multiple
                            accept="audio/*"
                            onChange={e => setFiles(e.target.files)}
                            required
                        />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide}>Cancel</Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? 'Uploading...' : 'Upload'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
}

export default PlaylistUploadModal;
