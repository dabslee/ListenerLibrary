import React, { useState } from 'react';
import { Container, Form, Button, Card, Alert } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

function Register() {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (password !== passwordConfirmation) {
            setError("Passwords do not match.");
            setLoading(false);
            return;
        }

        try {
            await api.post('/register/', {
                username,
                email,
                password,
                password_confirmation: passwordConfirmation
            });
            // Auto login logic typically handled by backend session or token return
            // Assuming session auth, backend logs user in on success
            navigate('/');
            window.location.reload(); // Reload to pick up session state
        } catch (err) {
            if (err.response && err.response.data) {
                const msg = Object.values(err.response.data).flat().join(' ');
                setError(msg);
            } else {
                setError('Registration failed.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container className="d-flex justify-content-center align-items-center vh-100">
            <Card style={{ width: '400px' }}>
                <Card.Header className="text-center">
                    <h4>Sign Up</h4>
                </Card.Header>
                <Card.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="mb-3">
                            <Form.Label>Username</Form.Label>
                            <Form.Control
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Email (Optional)</Form.Label>
                            <Form.Control
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Password</Form.Label>
                            <Form.Control
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Confirm Password</Form.Label>
                            <Form.Control
                                type="password"
                                value={passwordConfirmation}
                                onChange={e => setPasswordConfirmation(e.target.value)}
                                required
                            />
                        </Form.Group>
                        <div className="d-grid gap-2">
                            <Button variant="primary" type="submit" disabled={loading}>
                                {loading ? 'Registering...' : 'Sign Up'}
                            </Button>
                        </div>
                    </Form>
                </Card.Body>
                <Card.Footer className="text-center text-muted">
                    Already have an account? <Link to="/login">Login</Link>
                </Card.Footer>
            </Card>
        </Container>
    );
}

export default Register;
