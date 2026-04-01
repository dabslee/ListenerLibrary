import React, { useState, useEffect } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaUpload, FaMusic, FaPen, FaTrash } from 'react-icons/fa';
import api from '../api';
import PlaylistFormModal from '../components/PlaylistFormModal';
import PlaylistUploadModal from '../components/PlaylistUploadModal';

function PlaylistList() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editPlaylist, setEditPlaylist] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState(null);


  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    try {
        const res = await api.get('/playlists/');
        setPlaylists(res.data.results || res.data);
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const openEditModal = (playlist) => {
    setEditPlaylist(playlist);
    setShowCreateModal(true);
  };

  const openDeleteModal = (playlist) => {
    setPlaylistToDelete(playlist);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!playlistToDelete) return;
    try {
        await api.delete(`/playlists/${playlistToDelete.id}/`);
        fetchPlaylists();
        setShowDeleteModal(false);
        setPlaylistToDelete(null);
    } catch (e) {
        console.error(e);
        alert('Failed to delete playlist');
    }
  };


  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Your Playlists</h2>
        <div className="d-flex justify-content-end gap-2">
            <Button variant="primary" onClick={() => setShowUploadModal(true)}>
                <FaUpload className="me-1" />Upload Playlist
            </Button>
            <Button variant="primary" onClick={() => { setEditPlaylist(null); setShowCreateModal(true); }}>
                <FaPlus className="me-1" />Create New Playlist
            </Button>
        </div>
      </div>

      <div className="list-group">
        {loading ? <p>Loading...</p> : playlists.map(playlist => (
            <div key={playlist.id} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                <Link to={`/playlists/${playlist.id}`} className="text-decoration-none d-flex align-items-center flex-grow-1 me-3">
                    {playlist.image_url ? (
                        <img src={playlist.image_url} alt={playlist.name} style={{width: 50, height: 50, borderRadius: 5, objectFit: 'cover'}} className="me-3" />
                    ) : (
                        <div className="bg-secondary me-3 d-flex align-items-center justify-content-center" style={{width: 50, height: 50, borderRadius: 5}}>
                            <FaMusic className="text-white" />
                        </div>
                    )}
                    <div>
                        <h5 className="mb-1">{playlist.name}</h5>
                    </div>
                </Link>

                <div className="d-flex">
                    <Button variant="outline-primary" size="sm" className="me-2" onClick={() => openEditModal(playlist)}>
                        <FaPen />
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => openDeleteModal(playlist)}>
                        <FaTrash />
                    </Button>
                </div>
            </div>
        ))}
        {!loading && playlists.length === 0 && (
            <div className="alert alert-info mt-4">
                You haven't created any playlists yet. <a href="#" onClick={(e) => {e.preventDefault(); setShowCreateModal(true);}}>Create your first playlist!</a>
            </div>
        )}
      </div>

      <PlaylistFormModal
        show={showCreateModal}
        playlist={editPlaylist}
        onHide={() => { setShowCreateModal(false); setEditPlaylist(null); }}
        onSuccess={() => { setShowCreateModal(false); setEditPlaylist(null); fetchPlaylists(); }}
      />

      <PlaylistUploadModal
        show={showUploadModal}
        onHide={() => setShowUploadModal(false)}
        onSuccess={() => { setShowUploadModal(false); fetchPlaylists(); }}
      />

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
            <Modal.Title>Confirm Deletion</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            Are you sure you want to delete the playlist "<strong>{playlistToDelete?.name}</strong>"? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default PlaylistList;
