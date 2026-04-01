import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import Layout from './components/Layout';
import TrackList from './pages/TrackList';
import Login from './pages/Login';
import Register from './pages/Register';
import PlaylistList from './pages/PlaylistList';
import PlaylistDetail from './pages/PlaylistDetail';
import api from './api';
import { ThemeProvider } from './contexts/ThemeContext';
import Bookmarks from './pages/Bookmarks';
import Profile from './pages/Profile';
import PlayFocus from './pages/PlayFocus';
import TranscriptList from './pages/TranscriptList';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null means checking

  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/login' || path === '/register') {
      setIsAuthenticated(false);
    } else {
      checkAuth();
    }
  }, []);

  const checkAuth = async () => {
    if (window.location.pathname === '/login' || window.location.pathname === '/register') {
      setIsAuthenticated(false);
      return;
    }
    try {
        const response = await api.get('/playback-state/');
        if (response.status === 200) {
            setIsAuthenticated(true);
        } else {
             setIsAuthenticated(false);
        }
    } catch (e) {
        setIsAuthenticated(false);
    }
  };

  if (isAuthenticated === null) {
      return <div>Loading...</div>;
  }

  return (
    <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} />} />
            <Route path="/register" element={<Register />} />
            <Route path="/play-focus" element={isAuthenticated ? <PlayFocus /> : <Navigate to="/login" />} />

            {isAuthenticated ? (
                <Route path="/" element={<Layout />}>
                    <Route index element={<TrackList />} />
                    <Route path="playlists" element={<PlaylistList />} />
                    <Route path="playlists/:id" element={<PlaylistDetail />} />
                    <Route path="bookmarks" element={<Bookmarks />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="transcripts" element={<TranscriptList />} />
                </Route>
            ) : (
                <Route path="*" element={<Navigate to="/login" />} />
            )}
          </Routes>
        </Router>
    </ThemeProvider>
  );
}

export default App;
