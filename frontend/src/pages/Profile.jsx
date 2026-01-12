import React, { useState, useEffect } from 'react';
import { Card, ProgressBar } from 'react-bootstrap';
import api from '../api';

function Profile() {
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        api.get('/profile/').then(res => setProfile(res.data)).catch(console.error);
    }, []);

    if (!profile) return <div>Loading...</div>;

    return (
        <div>
            <h2>Profile</h2>
            <Card className="mb-3">
                <Card.Body>
                    <Card.Title>{profile.username}</Card.Title>
                    <Card.Text>Storage Limit: {profile.storage_limit_gb} GB</Card.Text>
                    {/* Simplified usage calc, real app would sum tracks */}
                </Card.Body>
            </Card>
        </div>
    );
}

export default Profile;
