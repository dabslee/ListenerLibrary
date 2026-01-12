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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null means checking

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
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
            <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
               <Route index element={<TrackList />} />
               <Route path="playlists" element={<PlaylistList />} />
               <Route path="playlists/:id" element={<PlaylistDetail />} />
               <Route path="bookmarks" element={<Bookmarks />} />
               <Route path="profile" element={<Profile />} />
            </Route>
          </Routes>
        </Router>
    </ThemeProvider>
  );
}

export default App;
