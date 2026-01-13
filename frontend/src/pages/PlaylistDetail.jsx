import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Container, Button, Modal, Row, Col, ProgressBar } from 'react-bootstrap';
import { FaPlay, FaPen, FaMusic, FaBook, FaFont, FaGripVertical, FaTimes } from 'react-icons/fa';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import api from '../api';
import PlaylistFormModal from '../components/PlaylistFormModal';

function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [trackToRemove, setTrackToRemove] = useState(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
        const [playlistRes, tracksRes] = await Promise.all([
            api.get(`/playlists/${id}/`),
            api.get(`/playlists/${id}/tracks/`)
        ]);
        setPlaylist(playlistRes.data);
        setTracks(tracksRes.data);
    } catch (e) {
        console.error(e);
        if (e.response && e.response.status === 404) navigate('/playlists');
    } finally {
        setLoading(false);
    }
  };

  const handlePlayPlaylist = (startIndex = 0) => {
      if (window.playPlaylist && tracks.length > 0) {
          window.playPlaylist(playlist, tracks, startIndex);
      }
  };

  const handleOnDragEnd = async (result) => {
    if (!result.destination) return;
    const items = Array.from(tracks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setTracks(items);

    const trackIds = items.map(t => t.id);
    try {
        await api.post(`/playlists/${id}/reorder/`, { track_ids: trackIds });
    } catch (error) {
        console.error("Failed to reorder playlist", error);
        // Optionally revert state on error
        fetchData();
    }
  };

  const openRemoveModal = (track) => {
    setTrackToRemove(track);
    setShowRemoveModal(true);
  };

  const confirmRemoveTrack = async () => {
    if (!trackToRemove) return;
    try {
        await api.post(`/playlists/remove_track/${id}/${trackToRemove.id}/`);
        fetchData(); // Refetch to get updated track list
        setShowRemoveModal(false);
        setTrackToRemove(null);
    } catch (error) {
        console.error("Failed to remove track", error);
    }
  };

  const formatDuration = (seconds) => {
      if (isNaN(seconds) || seconds === null) return '0:00';
      const date = new Date(0);
      date.setSeconds(seconds);
      return date.toISOString().substr(14, 5);
  };

  if (loading) return <Container className="py-4">Loading...</Container>;
  if (!playlist) return <Container className="py-4">Playlist not found</Container>;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
          <h2>{playlist.name}</h2>
          <div className="d-flex flex-wrap justify-content-end gap-1">
              <Button variant="success" onClick={() => handlePlayPlaylist(0)}><FaPlay className="me-2" />Play All</Button>
              <Button variant="primary" onClick={() => setShowEditModal(true)}><FaPen className="me-2" />Edit Playlist Details</Button>
          </div>
      </div>

      <Row>
        <Col md={4}>
            {playlist.image_url ?
                <img src={playlist.image_url} alt={playlist.name} className="img-fluid rounded mb-3" /> :
                <div className="bg-secondary d-flex align-items-center justify-content-center rounded mb-3" style={{width: '100%', height: 300}}>
                    <FaMusic className="fa-3x text-white" />
                </div>
            }
        </Col>
        <Col md={8}>
            <h3>Tracks</h3>
            <DragDropContext onDragEnd={handleOnDragEnd}>
                <Droppable droppableId="tracks">
                    {(provided) => (
                        <div className="list-group" {...provided.droppableProps} ref={provided.innerRef}>
                            {tracks.map((track, index) => (
                                <Draggable key={track.id} draggableId={String(track.id)} index={index}>
                                    {(provided) => (
                                        <div className="list-group-item d-flex flex-column flex-lg-row justify-content-between"
                                            ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                                            <div className="flex-grow-1 d-flex align-items-center" style={{cursor: 'pointer'}} onClick={() => handlePlayPlaylist(index)}>
                                                <FaGripVertical className="me-3" style={{cursor: 'move'}} />
                                                {track.icon_url ?
                                                    <img src={track.icon_url} alt={track.name} style={{width: 40, height: 40, borderRadius: 4, objectFit: 'cover'}} className="me-3" /> :
                                                    <div className="bg-secondary me-3 d-flex align-items-center justify-content-center" style={{width: 40, height: 40, borderRadius: 4}}>
                                                        <FaMusic className="text-white" />
                                                    </div>
                                                }
                                                <div>
                                                    <h6 className="mb-0">{track.name}
                                                        {track.type === 'podcast' && <FaBook className="ms-2 text-secondary" title="Podcast" />}
                                                        {track.transcript && <FaFont className="ms-1 text-secondary" title="Transcribed" />}
                                                    </h6>
                                                    {track.artist && <small className="text-muted">By {track.artist}</small>}
                                                </div>
                                            </div>
                                            <div className="d-flex flex-row align-items-center justify-content-end" style={{minWidth: 150}}>
                                                 {track.type === 'podcast' && (
                                                    <div className="w-100 me-3 mt-2 mt-lg-0">
                                                        <ProgressBar now={track.progress_percentage || 0} style={{height: '5px'}} />
                                                        <div className="d-flex justify-content-end">
                                                            <small className="text-muted">
                                                                {formatDuration(track.position)} / {formatDuration(track.duration)}
                                                            </small>
                                                        </div>
                                                    </div>
                                                )}
                                                <Button variant="outline-danger" size="sm" onClick={(e) => { e.stopPropagation(); openRemoveModal(track); }} title="Remove from Playlist">
                                                    <FaTimes />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
            {tracks.length === 0 && <p className="text-muted mt-3">This playlist is empty.</p>}
        </Col>
      </Row>

      <PlaylistFormModal
          show={showEditModal}
          playlist={playlist}
          onHide={() => setShowEditModal(false)}
          onSuccess={(updatedPlaylist) => {
              setShowEditModal(false);
              setPlaylist(updatedPlaylist);
          }}
      />

      <Modal show={showRemoveModal} onHide={() => setShowRemoveModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Removal</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to remove the track "<strong>{trackToRemove?.name}</strong>" from this playlist?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRemoveModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmRemoveTrack}>Remove</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default PlaylistDetail;
