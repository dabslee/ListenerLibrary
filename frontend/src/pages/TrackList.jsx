import React, { useState, useEffect } from 'react';
import { Table, Button, Form, InputGroup } from 'react-bootstrap';
import { FaPlay } from 'react-icons/fa';
import api from '../api';

function TrackList() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTracks();
  }, [search]);

  const fetchTracks = async () => {
    try {
      const response = await api.get(`/tracks/?search=${search}`);
      setTracks(response.data); // DRF pagination might wrap this in 'results', need to check settings
      // Default pagination is on in settings? ViewSet uses PageNumberPagination by default if configured?
      // I didn't configure DEFAULT_PAGINATION_CLASS in settings, so it defaults to None (all items) or what viewset says.
      // TrackViewSet doesn't set pagination_class explicitly but views.py used Paginator.
      // Let's assume list of objects for now, or fix if results key exists.
      if (response.data.results) {
          setTracks(response.data.results);
      } else {
          setTracks(response.data);
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

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Tracks</h2>
        <InputGroup className="w-auto">
            <Form.Control
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
        </InputGroup>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <Table hover responsive>
          <thead>
            <tr>
              <th style={{width: '50px'}}></th>
              <th>Title</th>
              <th>Artist</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr key={track.id} className="align-middle">
                <td>
                    <Button variant="light" size="sm" onClick={() => handlePlay(track)}>
                        <FaPlay />
                    </Button>
                </td>
                <td>{track.name}</td>
                <td>{track.artist}</td>
                <td>{new Date(track.duration * 1000).toISOString().substr(14, 5)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default TrackList;
