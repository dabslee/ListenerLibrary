import React, { useState, useEffect } from 'react';
import { Card, Button, Row, Col, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaPlus, FaPlay } from 'react-icons/fa';
import api from '../api';

function PlaylistList() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/playlists/')
       .then(res => setPlaylists(res.data.results || res.data))
       .catch(err => console.error(err))
       .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Playlists</h2>
        <Button variant="success" className="d-flex align-items-center gap-2">
            <FaPlus /> Create Playlist
        </Button>
      </div>

      {loading ? <div>Loading...</div> : (
          <Row xs={1} sm={2} md={3} lg={4} className="g-4">
            {playlists.map(playlist => (
              <Col key={playlist.id}>
                <Card className="h-100 shadow-sm border-0 hover-shadow transition-all">
                    <div className="position-relative">
                        {playlist.image_url ? (
                            <Card.Img variant="top" src={playlist.image_url} style={{height: '200px', objectFit: 'cover'}} />
                        ) : (
                            <div className="bg-light d-flex align-items-center justify-content-center text-muted" style={{height: '200px'}}>
                                No Cover
                            </div>
                        )}
                        <Button
                            variant="primary"
                            className="position-absolute bottom-0 end-0 m-3 rounded-circle d-flex align-items-center justify-content-center shadow"
                            style={{width: 40, height: 40}}
                        >
                            <FaPlay style={{marginLeft: 2}} />
                        </Button>
                    </div>
                  <Card.Body>
                    <Card.Title className="text-truncate">{playlist.name}</Card.Title>
                    <Card.Text className="text-muted small">
                        {playlist.tracks ? playlist.tracks.length : 0} tracks
                    </Card.Text>
                    <Link to={`/playlists/${playlist.id}`} className="stretched-link"></Link>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
      )}
    </div>
  );
}

export default PlaylistList;
