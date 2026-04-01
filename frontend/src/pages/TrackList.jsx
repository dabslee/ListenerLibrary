import React, { useState, useEffect } from 'react';
import { Button, Form, Dropdown, Modal, Row, Col, Pagination, ProgressBar } from 'react-bootstrap';
import { FaPlay, FaEllipsisV, FaUpload, FaMusic, FaBook, FaFont, FaCheck } from 'react-icons/fa';
import api from '../api';
import TrackFormModal from '../components/TrackFormModal';
import TranscriptViewerModal from '../components/TranscriptViewerModal';

function TrackList() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTitle, setSearchTitle] = useState('');
  const [searchTranscript, setSearchTranscript] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [sortOption, setSortOption] = useState('name');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [artists, setArtists] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [storageUsage, setStorageUsage] = useState(0);
  const [storageLimit, setStorageLimit] = useState(0);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editTrack, setEditTrack] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [trackToDelete, setTrackToDelete] = useState(null);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [trackForTranscript, setTrackForTranscript] = useState(null);

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchTracks(1);
  }, [searchTitle, searchTranscript, artistFilter, playlistFilter, sortOption]);

  useEffect(() => {
      fetchTracks(currentPage);
  }, [currentPage]);

  const fetchMetadata = async () => {
      try {
          const [plRes, trRes, profRes] = await Promise.all([
              api.get('/playlists/'),
              api.get('/tracks/'),
              api.get('/profile/'),
          ]);
          setPlaylists(plRes.data.results || plRes.data);
          const uniqueArtists = [...new Set((trRes.data.results || trRes.data).map(t => t.artist).filter(Boolean))];
          setArtists(uniqueArtists.sort());
          setStorageUsage(profRes.data.storage_usage_bytes);
          setStorageLimit(profRes.data.storage_limit_bytes);
      } catch (e) { console.error(e); }
  };

  const fetchTracks = async (page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTitle) params.append('search', searchTitle);
      if (searchTranscript) params.append('search_transcript', searchTranscript);
      if (artistFilter) params.append('artist', artistFilter);
      if (playlistFilter) params.append('playlist', playlistFilter);
      if (sortOption) params.append('ordering', sortOption === 'last_played' ? '-usertracklastplayed__last_played' : 'name');
      params.append('page', page);

      const response = await api.get(`/tracks/?${params.toString()}`);
      if (response.data.results) {
          setTracks(response.data.results);
          setTotalPages(Math.ceil(response.data.count / 10));
      } else {
          setTracks(response.data);
          setTotalPages(1);
      }
    } catch (error) {
      console.error('Error fetching tracks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (track) => {
      if (window.playTrack) {
          window.playTrack(track);
      }
  };

  const confirmDelete = async () => {
      if (!trackToDelete) return;
      try {
          await api.post(`/tracks/${trackToDelete.id}/delete_track/`);
          fetchTracks(currentPage);
          setShowDeleteModal(false);
          setTrackToDelete(null);
      } catch (e) {
          console.error(e);
          alert('Failed to delete track');
      }
  };

  const toggleTrackInPlaylist = async (trackId, playlistId) => {
    try {
        const response = await api.post('/playlists/add_track_to_playlist/', { track_id: trackId, playlist_id: playlistId });
        // Optionally show a toast notification with response.data.message
        // Update the track in the state to reflect the change
        setTracks(prevTracks => prevTracks.map(t => {
            if (t.id === trackId) {
                const newPlaylists = t.playlists.includes(playlistId)
                    ? t.playlists.filter(id => id !== playlistId)
                    : [...t.playlists, playlistId];
                return { ...t, playlists: newPlaylists };
            }
            return t;
        }));
    } catch (error) {
        console.error("Failed to toggle track in playlist", error);
        // Optionally show an error toast
    }
  };

  const openDeleteModal = (track) => {
      setTrackToDelete(track);
      setShowDeleteModal(true);
  };

  const openEditModal = (track) => {
      setEditTrack(track);
      setShowUploadModal(true);
  };

  const openTranscriptModal = (track) => {
      setTrackForTranscript(track);
      setShowTranscriptModal(true);
  };

  const handlePageChange = (page) => {
      if (page >= 1 && page <= totalPages) {
          setCurrentPage(page);
      }
  };

  const formatBytes = (bytes, decimals = 2) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
      if (isNaN(seconds) || seconds === null) return '0:00';
      const date = new Date(0);
      date.setSeconds(seconds);
      return date.toISOString().substr(14, 5);
  };

  const storagePercentage = storageLimit > 0 ? (storageUsage / storageLimit) * 100 : 0;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Your Tracks</h2>
        <div className="d-flex flex-column flex-md-row align-items-md-center gap-3">
            <span className={`small fst-italic ${storagePercentage > 75 ? 'text-danger' : 'text-muted'}`}>
                {formatBytes(storageUsage)} / {formatBytes(storageLimit)} ({storagePercentage.toFixed(1)}%) used.
            </span>
            <Button variant="primary" onClick={() => { setEditTrack(null); setShowUploadModal(true); }}>
                <FaUpload className="me-1" /> Upload Track
            </Button>
        </div>
      </div>

      <div className="card bg-light mb-4">
        <div className="card-body">
            <Form onSubmit={(e) => e.preventDefault()}>
                <Row className="g-3 align-items-end">
                    <Col md={4}>
                        <Form.Label>Title Search</Form.Label>
                        <Form.Control
                            placeholder="Keyword..."
                            value={searchTitle}
                            onChange={(e) => { setSearchTitle(e.target.value); setCurrentPage(1); }}
                        />
                    </Col>
                    <Col md={3}>
                        <Form.Label>Artist</Form.Label>
                        <Form.Select value={artistFilter} onChange={(e) => { setArtistFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="">All Artists</option>
                            {artists.map(artist => <option key={artist} value={artist}>{artist}</option>)}
                        </Form.Select>
                    </Col>
                    <Col md={3}>
                        <Form.Label>Playlist</Form.Label>
                        <Form.Select value={playlistFilter} onChange={(e) => { setPlaylistFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="">All Tracks</option>
                            {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Form.Select>
                    </Col>
                    <Col md={2}>
                        <Form.Label>Sort By</Form.Label>
                        <Form.Select value={sortOption} onChange={(e) => { setSortOption(e.target.value); setCurrentPage(1); }}>
                            <option value="name">Alphabetical</option>
                            <option value="last_played">Last Played</option>
                        </Form.Select>
                    </Col>
                </Row>
                <Row className="g-3 align-items-end mt-2">
                    <Col>
                        <Form.Label>Transcript Search</Form.Label>
                        <Form.Control
                            placeholder="Transcript text..."
                            value={searchTranscript}
                            onChange={(e) => { setSearchTranscript(e.target.value); setCurrentPage(1); }}
                        />
                    </Col>
                </Row>
            </Form>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">Loading...</div>
      ) : (
        <>
        <div className="list-group">
            {tracks.map((track) => (
              <div key={track.id} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                <div className="flex-grow-1" style={{cursor: 'pointer'}} onClick={() => handlePlay(track)}>
                    <div className="d-flex align-items-center">
                        {track.icon_url ?
                            <img src={track.icon_url} alt={track.name} style={{width: 50, height: 50, borderRadius: 5, objectFit: 'cover'}} className="me-3" /> :
                            <div className="bg-secondary me-3 d-flex align-items-center justify-content-center" style={{width: 50, height: 50, borderRadius: 5}}>
                                <FaMusic className="text-white" />
                            </div>
                        }
                        <div>
                            <h6 className="mb-1">
                                {track.name}
                                {track.type === 'podcast' && <FaBook className="ms-2 text-secondary" title="Podcast" />}
                                {track.transcript_id && <FaFont className="ms-1 text-secondary" title="Transcribed" />}
                            </h6>
                            {track.artist && <p className="mb-1"><small className="text-muted">By {track.artist}</small></p>}
                        </div>
                    </div>
                </div>

                <div className="d-flex align-items-center" style={{minWidth: 150}}>
                    {track.type === 'podcast' && (
                        <div className="w-100 me-2">
                            <ProgressBar now={track.progress_percentage || 0} style={{height: '5px'}} />
                            <div className="d-flex justify-content-end">
                                <small className="text-muted">
                                    {formatDuration(track.position)} / {formatDuration(track.duration)}
                                </small>
                            </div>
                        </div>
                    )}
                    <Dropdown align="end" onClick={(e) => e.stopPropagation()}>
                        <Dropdown.Toggle variant="outline-secondary" size="sm" className="btn-circle">
                            <FaEllipsisV />
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Header>Add to Playlist</Dropdown.Header>
                            {playlists.map(p => (
                                <Dropdown.Item key={p.id} onClick={() => toggleTrackInPlaylist(track.id, p.id)}>
                                    <div className="d-flex justify-content-between align-items-center">
                                        {p.name}
                                        {(track.playlists || []).includes(p.id) && <FaCheck className="text-success ms-2" />}
                                    </div>
                                </Dropdown.Item>
                            ))}
                            <Dropdown.Divider />
                            <Dropdown.Item href={`/api/track/${track.id}/download/`} download>Download</Dropdown.Item>
                            <Dropdown.Item onClick={() => openEditModal(track)}>Edit</Dropdown.Item>
                            <Dropdown.Item className="text-danger" onClick={() => openDeleteModal(track)}>Delete</Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown>
                </div>
              </div>
            ))}
        </div>

        {totalPages > 1 && (
            <Pagination className="justify-content-center mt-4">
                <Pagination.First onClick={() => handlePageChange(1)} disabled={currentPage === 1} />
                <Pagination.Prev onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} />
                {[...Array(totalPages)].map((_, i) => {
                    const p = i + 1;
                    if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
                        return (
                            <Pagination.Item key={p} active={p === currentPage} onClick={() => handlePageChange(p)}>
                                {p}
                            </Pagination.Item>
                        );
                    } else if (p === currentPage - 3 || p === currentPage + 3) {
                        return <Pagination.Ellipsis key={p} disabled />;
                    }
                    return null;
                })}
                <Pagination.Next onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} />
                <Pagination.Last onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} />
            </Pagination>
        )}
        </>
      )}

      <TrackFormModal
        show={showUploadModal}
        onHide={() => setShowUploadModal(false)}
        onSuccess={() => { setShowUploadModal(false); fetchTracks(currentPage); }}
        track={editTrack}
      />

      <TranscriptViewerModal
        show={showTranscriptModal}
        onHide={() => setShowTranscriptModal(false)}
        track={trackForTranscript}
      />

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
            <Modal.Title>Confirm Deletion</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            Are you sure you want to delete the track "<strong>{trackToDelete?.name}</strong>"? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default TrackList;
