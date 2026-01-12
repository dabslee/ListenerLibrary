import React, { useState, useEffect } from 'react';
import { Table, Button, Form, InputGroup, Dropdown, Modal, Row, Col, Pagination } from 'react-bootstrap';
import { FaPlay, FaEllipsisV, FaUpload, FaSearch, FaFilter, FaCheck, FaTrash, FaDownload, FaFileAlt } from 'react-icons/fa';
import api from '../api';
import TrackFormModal from '../components/TrackFormModal';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import TranscriptViewerModal from '../components/TranscriptViewerModal';

function TrackList() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTitle, setSearchTitle] = useState('');
  const [searchTranscript, setSearchTranscript] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [sortOption, setSortOption] = useState('name');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [artists, setArtists] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editTrack, setEditTrack] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [trackToDelete, setTrackToDelete] = useState(null);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const [trackForPlaylist, setTrackForPlaylist] = useState(null);
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
          const [plRes, trRes] = await Promise.all([
              api.get('/playlists/'),
              api.get('/tracks/')
          ]);
          setPlaylists(plRes.data.results || plRes.data);
          const uniqueArtists = [...new Set((trRes.data.results || trRes.data).map(t => t.artist).filter(Boolean))];
          setArtists(uniqueArtists.sort());
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
          // DRF default PageNumberPagination returns 'count'
          // Assuming default page size is 10 (as per views.py Paginator(tracks_query, 10))
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

  const openDeleteModal = (track) => {
      setTrackToDelete(track);
      setShowDeleteModal(true);
  };

  const openEditModal = (track) => {
      setEditTrack(track);
      setShowUploadModal(true);
  };

  const openAddToPlaylistModal = (track) => {
      setTrackForPlaylist(track);
      setShowAddToPlaylistModal(true);
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

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Your Tracks</h2>
        <div className="d-flex flex-column flex-md-row align-items-md-center gap-3">
            <span className="small fst-italic text-muted">Storage usage info...</span>
            <Button variant="primary" onClick={() => { setEditTrack(null); setShowUploadModal(true); }}>
                <FaUpload className="me-1" /> Upload Track
            </Button>
        </div>
      </div>

      <div className="card mb-4">
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
                            {artists.map(artist => (
                                <option key={artist} value={artist}>{artist}</option>
                            ))}
                        </Form.Select>
                    </Col>
                    <Col md={3}>
                        <Form.Label>Playlist</Form.Label>
                        <Form.Select value={playlistFilter} onChange={(e) => { setPlaylistFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="">All Tracks</option>
                            {playlists.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
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
                    <Col md={12}>
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
        <div className="list-group mb-3">
            {tracks.map((track) => (
              <div key={track.id} className="list-group-item list-group-item-action d-flex align-items-center p-2">
                  <div className="me-3 position-relative" style={{width: 50, height: 50, flexShrink: 0}}>
                        {track.icon_url ?
                            <img src={track.icon_url} className="w-100 h-100 rounded" style={{objectFit: 'cover'}} /> :
                            <div className="w-100 h-100 bg-secondary rounded d-flex align-items-center justify-content-center text-white small">N/A</div>
                        }
                        <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-50 opacity-0 hover-opacity-100 rounded"
                              style={{cursor: 'pointer', transition: 'opacity 0.2s'}}
                              onClick={() => handlePlay(track)}>
                              <FaPlay className="text-white" />
                        </div>
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                      <div className="d-flex justify-content-between">
                          <h6 className="mb-0 text-truncate" style={{maxWidth: '80%'}}>{track.name}</h6>
                          <small className="text-muted ms-2">{track.duration ? new Date(track.duration * 1000).toISOString().substr(14, 5) : '--:--'}</small>
                      </div>
                      <div className="small text-muted text-truncate">{track.artist || 'Unknown'}</div>
                      {track.type === 'podcast' && track.progress_percentage > 0 && (
                          <div className="progress mt-1" style={{height: '3px'}}>
                              <div className="progress-bar" role="progressbar" style={{width: `${track.progress_percentage}%`}}></div>
                          </div>
                      )}
                  </div>
                  <div className="ms-2">
                        <Dropdown align="end">
                            <Dropdown.Toggle variant="link" className="text-muted p-0 no-caret">
                                <FaEllipsisV />
                            </Dropdown.Toggle>
                            <Dropdown.Menu>
                                <Dropdown.Item onClick={() => handlePlay(track)}>Play</Dropdown.Item>
                                <Dropdown.Item onClick={() => openAddToPlaylistModal(track)}>Add to Playlist</Dropdown.Item>
                                <Dropdown.Item onClick={() => openTranscriptModal(track)}>Transcript</Dropdown.Item>
                                <Dropdown.Item onClick={() => openEditModal(track)}>Edit</Dropdown.Item>
                                <Dropdown.Item href={track.file_url} download target="_blank">Download</Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item className="text-danger" onClick={() => openDeleteModal(track)}>Delete</Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown>
                  </div>
              </div>
            ))}
        </div>

        {totalPages > 1 && (
            <Pagination className="justify-content-center">
                <Pagination.First onClick={() => handlePageChange(1)} disabled={currentPage === 1} />
                <Pagination.Prev onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} />

                {/* Simplified logic: Show window around current page */}
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

      <AddToPlaylistModal
        show={showAddToPlaylistModal}
        onHide={() => setShowAddToPlaylistModal(false)}
        trackId={trackForPlaylist?.id}
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
    </div>
  );
}

export default TrackList;
