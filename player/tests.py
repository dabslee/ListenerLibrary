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
        self.track_content = b"dummy audio content"
        track_file = SimpleUploadedFile("test_track.mp3", self.track_content, content_type="audio/mpeg")

        # Create a track object
        self.track = Track.objects.create(
            name='Test Track',
            artist='Test Artist',
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
        self.assertContains(response, self.track.artist)

    def test_upload_track_view(self):
        # Test GET request
        response = self.client.get(reverse('upload_track'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Upload a New Track')

        # Test POST request with a new file
        upload_file = SimpleUploadedFile("new_track.mp3", b"more dummy content", content_type="audio/mpeg")
        response = self.client.post(reverse('upload_track'), {
            'name': 'New Uploaded Track',
            'artist': 'A New Artist',
            'type': 'podcast',
            'file': upload_file,
        })

        # Should redirect to track_list on success
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Track.objects.filter(name='New Uploaded Track', artist='A New Artist').exists())

    def test_edit_track_view(self):
        # Test GET request
        response = self.client.get(reverse('edit_track', args=[self.track.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Edit Track')
        self.assertContains(response, self.track.name)

        # Test POST request to update the name and artist
        new_name = "Updated Test Track"
        new_artist = "Updated Artist"
        response = self.client.post(reverse('edit_track', args=[self.track.id]), {
            'name': new_name,
            'artist': new_artist,
            'type': self.track.type,
            # Intentionally not passing a file to ensure the existing one is kept
        })

        # Should redirect to track_list on success
        self.assertEqual(response.status_code, 302)
        # Check if the track was updated
        updated_track = Track.objects.get(id=self.track.id)
        self.assertEqual(updated_track.name, new_name)
        self.assertEqual(updated_track.artist, new_artist)

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

    def test_download_track_view(self):
        response = self.client.get(reverse('download_track', args=[self.track.id]))
        self.assertEqual(response.status_code, 200)
        expected_filename = os.path.basename(self.track.file.name)
        self.assertEqual(response.get('Content-Disposition'), f'attachment; filename="{expected_filename}"')
        self.assertEqual(b"".join(response.streaming_content), self.track_content)

    def test_stream_track_view(self):
        # Test a normal request (no range header)
        response = self.client.get(reverse('stream_track', args=[self.track.id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Content-Length'), str(len(self.track_content)))
        self.assertEqual(b"".join(response.streaming_content), self.track_content)
        self.assertEqual(response.get('Accept-Ranges'), 'bytes')

        # Test a request with a range header
        range_header = 'bytes=6-10' # Request bytes 6, 7, 8, 9, 10
        response = self.client.get(reverse('stream_track', args=[self.track.id]), HTTP_RANGE=range_header)
        self.assertEqual(response.status_code, 206)

        expected_content = self.track_content[6:11]
        self.assertEqual(response.get('Content-Length'), str(len(expected_content)))
        self.assertEqual(response.get('Content-Range'), f'bytes 6-10/{len(self.track_content)}')
        self.assertEqual(b"".join(response.streaming_content), expected_content)