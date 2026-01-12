import React, { useState, useEffect } from 'react';
import { Card, Button, Row, Col } from 'react-bootstrap';
import api from '../api';

function PlaylistList() {
  const [playlists, setPlaylists] = useState([]);

  useEffect(() => {
    api.get('/playlists/')
       .then(res => setPlaylists(res.data.results || res.data))
       .catch(err => console.error(err));
  }, []);

  return (
    <div>
      <h2 className="mb-4">Playlists</h2>
      <Row xs={1} md={3} className="g-4">
        {playlists.map(playlist => (
          <Col key={playlist.id}>
            <Card>
                {playlist.image_url ? (
                    <Card.Img variant="top" src={playlist.image_url} style={{height: '200px', objectFit: 'cover'}} />
                ) : (
                    <div className="bg-secondary text-white d-flex align-items-center justify-content-center" style={{height: '200px'}}>
                        No Image
                    </div>
                )}
              <Card.Body>
                <Card.Title>{playlist.name}</Card.Title>
                <Button variant="primary">View</Button>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

export default PlaylistList;
