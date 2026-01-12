import React, { useState, useEffect } from 'react';
import { Table, Button, Form, InputGroup, Dropdown, ButtonGroup, Badge } from 'react-bootstrap';
import { FaPlay, FaEllipsisV, FaUpload, FaSearch, FaFilter } from 'react-icons/fa';
import api from '../api';

function TrackList() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [artistFilter, setArtistFilter] = useState('');

  useEffect(() => {
    fetchTracks();
  }, [search, artistFilter]);

  const fetchTracks = async () => {
    setLoading(true);
    try {
      let url = `/tracks/?search=${search}`;
      if (artistFilter) url += `&artist=${artistFilter}`;

      const response = await api.get(url);
      setTracks(response.data.results || response.data);
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

  const handleDelete = async (id) => {
      if (confirm('Are you sure you want to delete this track?')) {
          try {
              await api.post(`/tracks/${id}/delete_track/`);
              fetchTracks();
          } catch (e) {
              console.error(e);
              alert('Failed to delete track');
          }
      }
  };

  return (
    <div className="p-3">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3">
        <h2 className="mb-0">Tracks</h2>

        <div className="d-flex gap-2 w-100 w-md-auto">
             <InputGroup>
                <InputGroup.Text><FaSearch /></InputGroup.Text>
                <Form.Control
                    placeholder="Search tracks..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </InputGroup>
            <Button variant="primary" className="d-flex align-items-center gap-2">
                <FaUpload /> <span className="d-none d-sm-inline">Upload</span>
            </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">Loading...</div>
      ) : (
        <div className="table-responsive">
            <Table hover className="align-middle">
              <thead>
                <tr>
                  <th style={{width: '60px'}}></th>
                  <th>Title</th>
                  <th>Artist</th>
                  <th className="d-none d-md-table-cell">Duration</th>
                  <th className="d-none d-sm-table-cell">Last Played</th>
                  <th style={{width: '50px'}}></th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track) => (
                  <tr key={track.id}>
                    <td>
                        <div className="position-relative" style={{width: 40, height: 40}}>
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
                    </td>
                    <td>
                        <div className="fw-bold">{track.name}</div>
                        <div className="d-md-none small text-muted">{track.duration ? new Date(track.duration * 1000).toISOString().substr(14, 5) : '--:--'}</div>
                    </td>
                    <td>{track.artist || <span className="text-muted fst-italic">Unknown</span>}</td>
                    <td className="d-none d-md-table-cell">
                        {track.duration ? new Date(track.duration * 1000).toISOString().substr(14, 5) : '--:--'}
                    </td>
                    <td className="d-none d-sm-table-cell small text-muted">
                        {track.last_played_iso ? new Date(track.last_played_iso).toLocaleDateString() : '-'}
                    </td>
                    <td>
                        <Dropdown align="end">
                            <Dropdown.Toggle variant="link" className="text-muted p-0 no-caret">
                                <FaEllipsisV />
                            </Dropdown.Toggle>
                            <Dropdown.Menu>
                                <Dropdown.Item onClick={() => handlePlay(track)}>Play</Dropdown.Item>
                                <Dropdown.Item>Add to Playlist</Dropdown.Item>
                                <Dropdown.Item>Edit</Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item className="text-danger" onClick={() => handleDelete(track.id)}>Delete</Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
        </div>
      )}
    </div>
  );
}

export default TrackList;
