import React, { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Container, Navbar, Nav, NavDropdown, Modal, Form, Button } from 'react-bootstrap';
import { FaSignOutAlt, FaPlay, FaTrash } from 'react-icons/fa';
import Player from './Player';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api';

function Layout() {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState('');
  const [sleepTimer, setSleepTimer] = useState(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(0);
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [newBookmarkName, setNewBookmarkName] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
        try {
            const response = await api.get('/profile/');
            setUsername(response.data.username);
        } catch (error) { console.error('Failed to fetch user profile', error); }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (showBookmarksModal) {
        fetchBookmarks();
    }
  }, [showBookmarksModal]);

  const fetchBookmarks = async () => {
    try {
        const response = await api.get('/bookmarks/');
        setBookmarks(response.data.results || response.data);
    } catch (error) { console.error('Failed to fetch bookmarks', error); }
  };

  const handleCreateBookmark = async (e) => {
    e.preventDefault();
    try {
        await api.post('/bookmarks/', { name: newBookmarkName });
        setNewBookmarkName('');
        fetchBookmarks();
    } catch (error) { console.error('Failed to create bookmark', error); }
  };

  const handlePlayBookmark = async (bookmarkId) => {
    try {
        const response = await api.post(`/bookmarks/${bookmarkId}/play/`);
        if (window.loadPlaybackState && response.data.playback_state) {
            window.loadPlaybackState(response.data.playback_state);
        }
        setShowBookmarksModal(false);
    } catch (error) { console.error('Failed to play bookmark', error); }
  };

  const handleDeleteBookmark = async (bookmarkId) => {
    if (window.confirm('Are you sure you want to delete this bookmark?')) {
        try {
            await api.delete(`/bookmarks/${bookmarkId}/`);
            fetchBookmarks();
        } catch (error) { console.error('Failed to delete bookmark', error); }
    }
  };

  const handleLogout = () => {
      window.location.href = '/accounts/logout/';
  };

  const handleStartSleepTimer = () => {
    const minutes = parseInt(sleepTimerMinutes, 10);
    if (minutes > 0) {
      const endTime = Date.now() + minutes * 60 * 1000;
      const timer = setInterval(() => {
        const remaining = Math.round((endTime - Date.now()) / 1000);
        if (remaining <= 0) {
          if (window.pauseAudio) window.pauseAudio();
          clearInterval(timer);
          setSleepTimer(null);
        }
        setSleepTimerRemaining(remaining);
      }, 1000);
      setSleepTimer({ timer, endTime, isPaused: false });
      setShowSleepTimerModal(false);
    }
  };

  const handlePauseResumeSleepTimer = () => {
    if (!sleepTimer) return;
    if (sleepTimer.isPaused) {
      const newEndTime = Date.now() + sleepTimerRemaining * 1000;
      const timer = setInterval(() => {
        const remaining = Math.round((newEndTime - Date.now()) / 1000);
        if (remaining <= 0) {
          if (window.pauseAudio) window.pauseAudio();
          clearInterval(timer);
          setSleepTimer(null);
        }
        setSleepTimerRemaining(remaining);
      }, 1000);
      setSleepTimer({ timer, endTime: newEndTime, isPaused: false });
    } else {
      clearInterval(sleepTimer.timer);
      setSleepTimer({ ...sleepTimer, isPaused: true });
    }
  };

  const handleCancelSleepTimer = () => {
    if (sleepTimer) {
      clearInterval(sleepTimer.timer);
    }
    setSleepTimer(null);
    setSleepTimerRemaining(0);
    setShowSleepTimerModal(false);
  };

  const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds === null) return '0:00';
    const date = new Date(0);
    date.setSeconds(seconds);
    const minutes = date.getUTCMinutes();
    const secs = date.getUTCSeconds();
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="d-flex flex-column vh-100">
      <Navbar variant="dark" expand="lg" className="px-3 sticky-top">
        <Container fluid>
          <Navbar.Brand as={Link} to="/" className="d-flex align-items-center">
            <img src="/static/images/logo.png" alt="ListenerLibrary Logo" width="30" height="30" className="d-inline-block align-top me-2" />
            ListenerLibrary
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/play-focus">Player</Nav.Link>
              <Nav.Link as={Link} to="/">Tracks</Nav.Link>
              <Nav.Link as={Link} to="/playlists">Playlists</Nav.Link>
            </Nav>
            <Nav>
                <NavDropdown title={username || 'User'} id="user-nav-dropdown" align="end">
                    <div className="px-2">
                        <small className="text-secondary ps-1">Theme</small>
                        <Form.Select size="sm" value={theme} onChange={(e) => toggleTheme(e.target.value)}>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                            <option value="blue">Light blue</option>
                            <option value="dark-blue">Dark blue</option>
                        </Form.Select>
                    </div>
                    <NavDropdown.Divider />
                    <NavDropdown.Item onClick={() => setShowSleepTimerModal(true)}>Sleep Timer</NavDropdown.Item>
                    <NavDropdown.Item onClick={() => setShowBookmarksModal(true)}>Bookmarks</NavDropdown.Item>
                    <NavDropdown.Item as={Link} to="/transcripts">Transcription</NavDropdown.Item>
                    <NavDropdown.Divider />
                    <NavDropdown.Item as={Link} to="/profile">Profile</NavDropdown.Item>
                    <NavDropdown.Item onClick={handleLogout}>
                        <FaSignOutAlt className="me-2" /> Logout
                    </NavDropdown.Item>
                </NavDropdown>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container fluid className="flex-grow-1 overflow-auto p-3 pb-5 mb-5">
        <Outlet />
      </Container>

      <div className="fixed-bottom border-top">
        <Player />
      </div>

      <Modal show={showSleepTimerModal} onHide={() => setShowSleepTimerModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Sleep Timer</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {sleepTimer ? (
            <div>
              <p>Time remaining: {Math.floor(sleepTimerRemaining / 60)}:{('0' + sleepTimerRemaining % 60).slice(-2)}</p>
              <Button variant="secondary" onClick={handlePauseResumeSleepTimer}>{sleepTimer.isPaused ? 'Resume' : 'Pause'}</Button>
              <Button variant="danger" onClick={handleCancelSleepTimer}>Cancel Timer</Button>
            </div>
          ) : (
            <div>
              <p>Set a timer to stop playback after a certain amount of time.</p>
              <div className="input-group">
                <Form.Control
                  type="number"
                  placeholder="Minutes"
                  value={sleepTimerMinutes}
                  onChange={(e) => setSleepTimerMinutes(e.target.value)}
                />
                <Button variant="primary" onClick={handleStartSleepTimer}>Start</Button>
              </div>
            </div>
          )}
        </Modal.Body>
      </Modal>

      <Modal show={showBookmarksModal} onHide={() => setShowBookmarksModal(false)} centered>
          <Modal.Header closeButton><Modal.Title>Bookmarks</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleCreateBookmark}>
                <div className="input-group mb-3">
                    <Form.Control
                        placeholder="Add new bookmark at current position..."
                        value={newBookmarkName}
                        onChange={(e) => setNewBookmarkName(e.target.value)}
                    />
                    <Button variant="primary" type="submit">Save</Button>
                </div>
            </Form>
            <div className="list-group" style={{maxHeight: 300, overflowY: 'auto'}}>
                {bookmarks.length > 0 ? bookmarks.map(b => (
                    <div key={b.id} className="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <h6 className="mb-1">{b.name}</h6>
                            <small className="text-muted">"{b.track_name}" at {formatDuration(b.position)}</small>
                        </div>
                        <div>
                            <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handlePlayBookmark(b.id)}><FaPlay /></Button>
                            <Button variant="outline-danger" size="sm" onClick={() => handleDeleteBookmark(b.id)}><FaTrash /></Button>
                        </div>
                    </div>
                )) : <p className="text-muted">No bookmarks saved yet.</p>}
            </div>
          </Modal.Body>
      </Modal>
    </div>
  );
}

export default Layout;
