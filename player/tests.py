from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import Track
import os

class PlayerTestCase(TestCase):
    def setUp(self):
        # Create a user
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        # Create a client and log in
        self.client = Client()
        self.client.login(username='testuser', password='testpassword')

        # Create a dummy uploaded file for the initial track
        track_file = SimpleUploadedFile("test_track.mp3", b"dummy audio content", content_type="audio/mpeg")

        # Create a track object
        self.track = Track.objects.create(
            name='Test Track',
            type='song',
            file=track_file,
            owner=self.user
        )

    def tearDown(self):
        # Clean up any files created during tests
        for track in Track.objects.all():
            if track.file and hasattr(track.file, 'path') and os.path.exists(track.file.path):
                os.remove(track.file.path)
            if track.icon and hasattr(track.icon, 'path') and os.path.exists(track.icon.path):
                os.remove(track.icon.path)

    def test_track_list_view(self):
        response = self.client.get(reverse('track_list'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.track.name)

    def test_upload_track_view(self):
        # Test GET request
        response = self.client.get(reverse('upload_track'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Upload a New Track')

        # Test POST request with a new file
        upload_file = SimpleUploadedFile("new_track.mp3", b"more dummy content", content_type="audio/mpeg")
        response = self.client.post(reverse('upload_track'), {
            'name': 'New Uploaded Track',
            'type': 'podcast',
            'file': upload_file,
        })

        # Should redirect to track_list on success
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Track.objects.filter(name='New Uploaded Track').exists())

    def test_edit_track_view(self):
        # Test GET request
        response = self.client.get(reverse('edit_track', args=[self.track.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Edit Track')
        self.assertContains(response, self.track.name)

        # Test POST request to update the name
        new_name = "Updated Test Track"
        response = self.client.post(reverse('edit_track', args=[self.track.id]), {
            'name': new_name,
            'type': self.track.type,
            # Intentionally not passing a file to ensure the existing one is kept
        })

        # Should redirect to track_list on success
        self.assertEqual(response.status_code, 302)
        # Check if the track was updated
        updated_track = Track.objects.get(id=self.track.id)
        self.assertEqual(updated_track.name, new_name)

    def test_delete_track_view(self):
        # Test GET request
        response = self.client.get(reverse('delete_track', args=[self.track.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Are you sure you want to permanently delete the track")
        self.assertContains(response, self.track.name)

        # Test POST request to delete the track
        response = self.client.post(reverse('delete_track', args=[self.track.id]))
        self.assertEqual(response.status_code, 302) # Redirects to track_list
        self.assertFalse(Track.objects.filter(id=self.track.id).exists())