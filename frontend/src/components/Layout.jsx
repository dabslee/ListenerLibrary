import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Container, Navbar, Nav, NavDropdown, Row, Col } from 'react-bootstrap';
import Player from './Player';
import Sidebar from './Sidebar';
import { useTheme } from '../contexts/ThemeContext';
import { FaPalette } from 'react-icons/fa';

function Layout() {
  const { toggleTheme } = useTheme();

  return (
    <div className="d-flex flex-column vh-100">
      <Navbar variant="dark" expand="lg" className="px-3 sticky-top">
        <Container fluid>
          <Navbar.Brand as={Link} to="/">Listener Library</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav" className="justify-content-end">
            <Nav>
                <NavDropdown title={<FaPalette />} id="basic-nav-dropdown" align="end">
                    <NavDropdown.Item onClick={() => toggleTheme('light')}>Light</NavDropdown.Item>
                    <NavDropdown.Item onClick={() => toggleTheme('dark')}>Dark</NavDropdown.Item>
                    <NavDropdown.Item onClick={() => toggleTheme('blue')}>Blue</NavDropdown.Item>
                    <NavDropdown.Item onClick={() => toggleTheme('dark-blue')}>Dark Blue</NavDropdown.Item>
                </NavDropdown>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container fluid className="flex-grow-1 overflow-hidden">
          <Row className="h-100">
              <Col md={3} lg={2} className="d-none d-md-block p-0">
                  <Sidebar />
              </Col>
              <Col xs={12} md={9} lg={10} className="p-0 d-flex flex-column h-100">
                 <div className="flex-grow-1 overflow-auto p-3 pb-5 mb-5">
                    <Outlet />
                 </div>
              </Col>
          </Row>
      </Container>

      <div className="fixed-bottom bg-light border-top">
        <Player />
      </div>
    </div>
  );
}

export default Layout;
