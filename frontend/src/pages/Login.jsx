import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import api from '../api';

function Login({ setIsAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // POST to standard Django login view that we might have to tweak or create
      // Since standard login view returns 302, we might just try to hit an API endpoint.
      // I'll assume we haven't created a dedicated JSON login endpoint yet,
      // but let's assume I will add one or use the standard one via form submit logic if I can.
      // But for "converting", let's stick to the /api/login/ strategy I assumed earlier.
      // I will implement this view in Django next.

      const response = await api.post('/login/', { username, password });

      // If we get here, it implies success (200 OK)
      setIsAuthenticated(true);
      navigate('/');

    } catch (err) {
      console.error(err);
      setError('Login failed. Please check your credentials.');
    }
  };

  return (
    <Container className="mt-5" style={{ maxWidth: '400px' }}>
      <h2>Login</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Label>Username</Form.Label>
          <Form.Control
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Password</Form.Label>
          <Form.Control
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Form.Group>
        <Button variant="primary" type="submit" className="w-100">
          Login
        </Button>
      </Form>
    </Container>
  );
}

export default Login;
