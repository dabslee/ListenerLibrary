import React, { useState, useEffect } from 'react';
import { Table, Button, ButtonGroup } from 'react-bootstrap';
import { FaPlay, FaTrash } from 'react-icons/fa';
import api from '../api';

function Bookmarks() {
    const [bookmarks, setBookmarks] = useState([]);

    useEffect(() => {
        fetchBookmarks();
    }, []);

    const fetchBookmarks = async () => {
        try {
            const res = await api.get('/bookmarks/');
            setBookmarks(res.data.results || res.data);
        } catch (e) {
            console.error(e);
        }
    };

    const handlePlay = async (id) => {
        try {
            await api.post(`/bookmarks/${id}/play/`);
            // Trigger global update or refresh?
            // Player component polls, so it should pick it up.
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Delete this bookmark?')) {
            try {
                await api.delete(`/bookmarks/${id}/`);
                fetchBookmarks();
            } catch (e) {
                console.error(e);
            }
        }
    };

    return (
        <div>
            <h2>Bookmarks</h2>
            <Table hover>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Track</th>
                        <th>Position</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {bookmarks.map(b => (
                        <tr key={b.id}>
                            <td>{b.name}</td>
                            <td>{b.track_details ? b.track_details.name : 'Unknown Track'}</td>
                            <td>{new Date(b.position * 1000).toISOString().substr(14, 5)}</td>
                            <td>
                                <ButtonGroup size="sm">
                                    <Button variant="outline-primary" onClick={() => handlePlay(b.id)}><FaPlay /></Button>
                                    <Button variant="outline-danger" onClick={() => handleDelete(b.id)}><FaTrash /></Button>
                                </ButtonGroup>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
    );
}

export default Bookmarks;
