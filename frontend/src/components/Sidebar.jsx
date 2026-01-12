import React, { useState, useEffect } from 'react';
import { Nav, NavDropdown } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { FaMusic, FaList, FaBookmark, FaUser } from 'react-icons/fa';

function Sidebar() {
    const location = useLocation();

    return (
        <Nav className="flex-column p-3 bg-light border-end vh-100" style={{width: '240px', position: 'fixed', top: 56, bottom: 0, overflowY: 'auto'}}>
            <Nav.Link as={Link} to="/" active={location.pathname === '/'}>
                <FaMusic className="me-2" /> Tracks
            </Nav.Link>
            <Nav.Link as={Link} to="/playlists" active={location.pathname.startsWith('/playlists')}>
                <FaList className="me-2" /> Playlists
            </Nav.Link>
            <Nav.Link as={Link} to="/bookmarks" active={location.pathname.startsWith('/bookmarks')}>
                <FaBookmark className="me-2" /> Bookmarks
            </Nav.Link>
            <Nav.Link as={Link} to="/profile" active={location.pathname === '/profile'}>
                <FaUser className="me-2" /> Profile
            </Nav.Link>
        </Nav>
    );
}

export default Sidebar;
