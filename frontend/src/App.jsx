import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import Layout from './components/Layout';
import TrackList from './pages/TrackList';
import Login from './pages/Login';
import PlaylistList from './pages/PlaylistList';
import api from './api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null means checking

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
        // Use the configured api instance which sends credentials
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
    <Router>
      <Routes>
        <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} />} />
        <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
           <Route index element={<TrackList />} />
           <Route path="playlists" element={<PlaylistList />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
