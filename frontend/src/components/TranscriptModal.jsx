import React from 'react';
import { Modal, Button } from 'react-bootstrap';

function TranscriptModal({ show, onHide, transcript }) {
    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>{transcript?.track_name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <pre>{transcript?.content}</pre>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Close
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default TranscriptModal;
