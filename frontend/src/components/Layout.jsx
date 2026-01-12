import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Container, Navbar, Nav } from 'react-bootstrap';
import Player from './Player';

function Layout() {
  return (
    <div className="d-flex flex-column vh-100">
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand as={Link} to="/">Listener Library</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/">Tracks</Nav.Link>
              <Nav.Link as={Link} to="/playlists">Playlists</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container className="flex-grow-1 mt-3 overflow-auto">
        <Outlet />
      </Container>

      <div className="bg-light border-top">
        <Player />
      </div>
    </div>
  );
}

export default Layout;
