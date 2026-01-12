import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Button, Table, Dropdown } from 'react-bootstrap';
import { FaPlay, FaArrowLeft, FaEllipsisV } from 'react-icons/fa';
import api from '../api';

function PlaylistDetail() {
  const { id } = useParams();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

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
    } finally {
        setLoading(false);
    }
  };

  const handlePlay = (track, index) => {
      // Logic to play playlist starting from index
      // Need to bridge to window.playPlaylist or similar
      // For now, just play track
      if (window.playTrack) window.playTrack(track);
  };

  if (loading) return <Container className="py-4">Loading...</Container>;
  if (!playlist) return <Container className="py-4">Playlist not found</Container>;

  return (
    <Container className="py-4">
      <div className="mb-4">
        <Link to="/playlists" className="text-decoration-none text-muted mb-2 d-inline-block">
            <FaArrowLeft className="me-1" /> Back to Playlists
        </Link>
        <div className="d-flex align-items-end gap-4 mt-3">
             <div className="shadow-lg rounded overflow-hidden" style={{width: 200, height: 200, flexShrink: 0}}>
                 {playlist.image_url ?
                    <img src={playlist.image_url} className="w-100 h-100 object-fit-cover" /> :
                    <div className="w-100 h-100 bg-secondary d-flex align-items-center justify-content-center text-white">No Image</div>
                 }
             </div>
             <div>
                 <div className="text-uppercase small fw-bold text-muted">Playlist</div>
                 <h1 className="display-4 fw-bold mb-3">{playlist.name}</h1>
                 <div className="d-flex align-items-center gap-3">
                     <Button size="lg" variant="primary" className="rounded-pill px-4">
                        <FaPlay className="me-2" /> Play
                     </Button>
                     <Dropdown>
                        <Dropdown.Toggle variant="outline-secondary" className="rounded-circle p-2 no-caret">
                            <FaEllipsisV />
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item>Edit Details</Dropdown.Item>
                            <Dropdown.Item className="text-danger">Delete Playlist</Dropdown.Item>
                        </Dropdown.Menu>
                     </Dropdown>
                 </div>
             </div>
        </div>
      </div>

      <Table hover className="align-middle">
        <thead>
            <tr>
                <th style={{width: 50}}>#</th>
                <th>Title</th>
                <th>Artist</th>
                <th>Duration</th>
                <th style={{width: 50}}></th>
            </tr>
        </thead>
        <tbody>
            {tracks.map((track, idx) => (
                <tr key={track.id} onDoubleClick={() => handlePlay(track, idx)}>
                    <td className="text-muted">{idx + 1}</td>
                    <td>
                        <div className="fw-bold">{track.name}</div>
                    </td>
                    <td>{track.artist}</td>
                    <td className="text-muted font-monospace small">
                        {track.duration ? new Date(track.duration * 1000).toISOString().substr(14, 5) : '--:--'}
                    </td>
                    <td>
                        <Button variant="link" className="text-muted p-0" onClick={() => handlePlay(track, idx)}>
                            <FaPlay size={12} />
                        </Button>
                    </td>
                </tr>
            ))}
        </tbody>
      </Table>
    </Container>
  );
}

export default PlaylistDetail;
