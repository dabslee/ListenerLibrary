import React, { useState, useEffect } from 'react';
import { Button, Modal, Table, Badge } from 'react-bootstrap';
import { FaEye, FaUpload, FaPlus } from 'react-icons/fa';
import api from '../api';

function TranscriptList() {
    const [transcripts, setTranscripts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedTranscript, setSelectedTranscript] = useState(null);

    useEffect(() => {
        fetchTranscripts();
    }, []);

    const fetchTranscripts = async () => {
        try {
            const response = await api.get('/transcripts/');
            setTranscripts(response.data.results || response.data);
        } catch (error) {
            console.error('Failed to fetch transcripts', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewTranscript = (transcript) => {
        setSelectedTranscript(transcript);
        setShowModal(true);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return <Badge bg="success">Completed</Badge>;
            case 'pending':
                return <Badge bg="warning">Pending</Badge>;
            case 'failed':
                return <Badge bg="danger">Failed</Badge>;
            default:
                return <Badge bg="secondary">{status}</Badge>;
        }
    };

    return (
        <>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2>Transcripts</h2>
            </div>
            {loading ? <p>Loading...</p> : (
                <Table striped bordered hover>
                    <thead>
                        <tr>
                            <th>Track</th>
                            <th>Status</th>
                            <th>Created At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transcripts.map(t => (
                            <tr key={t.id}>
                                <td>{t.track_name}</td>
                                <td>{getStatusBadge(t.status)}</td>
                                <td>{new Date(t.created_at).toLocaleString()}</td>
                                <td>
                                    {t.status === 'completed' && (
                                        <Button variant="outline-primary" size="sm" onClick={() => handleViewTranscript(t)}>
                                            <FaEye />
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}

            <Modal show={showModal} onHide={() => setShowModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>{selectedTranscript?.track_name}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <pre>{selectedTranscript?.content}</pre>
                </Modal.Body>
            </Modal>
        </>
    );
}

export default TranscriptList;
