import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Container, Navbar, Nav, NavDropdown } from 'react-bootstrap';
import Player from './Player';
import { useTheme } from '../contexts/ThemeContext';
import { FaUser, FaPalette, FaSignOutAlt } from 'react-icons/fa';

function Layout() {
  const { toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
      // In a real app with token auth, you'd clear the token.
      // With session auth, we might hit an endpoint or just clear local state.
      // Assuming session cookie is cleared or invalidates on backend if we had a logout endpoint.
      // For now, simple redirect to login which clears app state is visual enough,
      // but ideally we hit /accounts/logout/ if it existed as API.
      // Let's assume we just navigate away for this demo.
      window.location.href = '/accounts/logout/'; // Use Django's logout view if available or implement API logout
  };

  return (
    <div className="d-flex flex-column vh-100">
      <Navbar variant="dark" expand="lg" className="px-3 sticky-top">
        <Container fluid>
          <Navbar.Brand as={Link} to="/">Listener Library</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/">Tracks</Nav.Link>
              <Nav.Link as={Link} to="/playlists">Playlists</Nav.Link>
              <Nav.Link as={Link} to="/bookmarks">Bookmarks</Nav.Link>
            </Nav>
            <Nav>
                <NavDropdown title={<FaUser />} id="user-nav-dropdown" align="end">
                    <NavDropdown.Item as={Link} to="/profile">Profile</NavDropdown.Item>
                    <NavDropdown.Divider />
                    <NavDropdown.Item as="button" onClick={handleLogout}>
                        <FaSignOutAlt className="me-2" /> Logout
                    </NavDropdown.Item>
                </NavDropdown>

                <NavDropdown title={<FaPalette />} id="theme-nav-dropdown" align="end">
                    <NavDropdown.Item onClick={() => toggleTheme('light')}>Light</NavDropdown.Item>
                    <NavDropdown.Item onClick={() => toggleTheme('dark')}>Dark</NavDropdown.Item>
                    <NavDropdown.Item onClick={() => toggleTheme('blue')}>Blue</NavDropdown.Item>
                    <NavDropdown.Item onClick={() => toggleTheme('dark-blue')}>Dark Blue</NavDropdown.Item>
                </NavDropdown>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container fluid className="flex-grow-1 overflow-auto p-3 pb-5 mb-5">
        <Outlet />
      </Container>

      <div className="fixed-bottom bg-light border-top">
        <Player />
      </div>
    </div>
  );
}

export default Layout;
