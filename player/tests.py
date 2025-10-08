import json
import os
from unittest.mock import patch, Mock
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import Track, PlaybackState, PodcastProgress

class PlayerTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        self.client = Client()
        self.client.login(username='testuser', password='testpassword')

        self.track_content = b"dummy audio content"
        track_file = SimpleUploadedFile("test_track.mp3", self.track_content, content_type="audio/mpeg")

        self.song = Track.objects.create(
            name='Test Song',
            artist='Test Artist',
            type='song',
            file=track_file,
            owner=self.user,
            duration=180
        )

        podcast_file = SimpleUploadedFile("test_podcast.mp3", self.track_content, content_type="audio/mpeg")
        self.podcast = Track.objects.create(
            name='Test Podcast',
            type='podcast',
            file=podcast_file,
            owner=self.user,
            duration=1200
        )

    def tearDown(self):
        for track in Track.objects.all():
            if track.file and hasattr(track.file, 'path') and os.path.exists(track.file.path):
                os.remove(track.file.path)
            if track.icon and hasattr(track.icon, 'path') and os.path.exists(track.icon.path):
                os.remove(track.icon.path)

    def test_track_list_view(self):
        response = self.client.get(reverse('track_list'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.song.name)
        self.assertContains(response, self.podcast.name)

    def test_track_list_view_with_progress(self):
        # Create progress for the podcast
        PodcastProgress.objects.create(user=self.user, track=self.podcast, progress=600)

        response = self.client.get(reverse('track_list'))
        self.assertEqual(response.status_code, 200)

        # Check that the progress percentage is correctly calculated and rendered
        self.assertContains(response, 'width: 50.0%')

    @patch('player.forms.MP3')
    def test_upload_track_with_duration(self, mock_mp3):
        # Mock the mutagen library to return a specific duration
        mock_audio = Mock()
        mock_audio.info.length = 240.5
        mock_mp3.return_value = mock_audio

        upload_file = SimpleUploadedFile("new_track.mp3", b"more dummy content", content_type="audio/mpeg")
        response = self.client.post(reverse('upload_track'), {
            'name': 'New Uploaded Track',
            'type': 'song',
            'file': upload_file,
        })

        self.assertEqual(response.status_code, 302)
        new_track = Track.objects.get(name='New Uploaded Track')
        self.assertEqual(new_track.duration, 240.5)

    def test_api_update_playback_state_post(self):
        # Test POSTing a song's progress
        response = self.client.post(
            reverse('update_playback_state'),
            json.dumps({'track_id': self.song.id, 'current_time': 90}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        playback_state = PlaybackState.objects.get(user=self.user)
        self.assertEqual(playback_state.current_track, self.song)
        self.assertEqual(playback_state.current_time, 90)
        # No podcast progress should be created for a song
        self.assertFalse(PodcastProgress.objects.filter(track=self.song).exists())

        # Test POSTing a podcast's progress
        response = self.client.post(
            reverse('update_playback_state'),
            json.dumps({'track_id': self.podcast.id, 'current_time': 300}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        podcast_progress = PodcastProgress.objects.get(user=self.user, track=self.podcast)
        self.assertEqual(podcast_progress.progress, 300)

    def test_api_update_playback_state_get(self):
        # First, set a state to retrieve
        PlaybackState.objects.create(user=self.user, current_track=self.song, current_time=45)
        PodcastProgress.objects.create(user=self.user, track=self.podcast, progress=150)

        response = self.client.get(reverse('update_playback_state'))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data['current_track_id'], self.song.id)
        self.assertEqual(data['current_time'], 45)
        self.assertEqual(data['podcast_progress'][str(self.podcast.id)], 150)

    def test_api_get_initial_state_no_state(self):
        # Test GET when no PlaybackState exists for the user
        response = self.client.get(reverse('update_playback_state'))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNone(data['current_track_id'])
        self.assertEqual(data['current_time'], 0)
        self.assertEqual(data['podcast_progress'], {})

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
        response = self.client.get(reverse('edit_track', args=[self.song.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Edit Track')
        self.assertContains(response, self.song.name)

        # Test POST request to update the name and artist
        new_name = "Updated Test Track"
        new_artist = "Updated Artist"
        response = self.client.post(reverse('edit_track', args=[self.song.id]), {
            'name': new_name,
            'artist': new_artist,
            'type': self.song.type,
            # Intentionally not passing a file to ensure the existing one is kept
        })

        # Should redirect to track_list on success
        self.assertEqual(response.status_code, 302)
        # Check if the track was updated
        updated_track = Track.objects.get(id=self.song.id)
        self.assertEqual(updated_track.name, new_name)
        self.assertEqual(updated_track.artist, new_artist)

    def test_delete_track_view(self):
        # Test GET request
        response = self.client.get(reverse('delete_track', args=[self.song.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Are you sure you want to permanently delete the track")
        self.assertContains(response, self.song.name)

        # Test POST request to delete the track
        response = self.client.post(reverse('delete_track', args=[self.song.id]))
        self.assertEqual(response.status_code, 302) # Redirects to track_list
        self.assertFalse(Track.objects.filter(id=self.song.id).exists())

    def test_download_track_view(self):
        response = self.client.get(reverse('download_track', args=[self.song.id]))
        self.assertEqual(response.status_code, 200)
        expected_filename = os.path.basename(self.song.file.name)
        self.assertEqual(response.get('Content-Disposition'), f'attachment; filename="{expected_filename}"')
        self.assertEqual(b"".join(response.streaming_content), self.track_content)