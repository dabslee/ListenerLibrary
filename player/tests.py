import os
import json
from io import BytesIO
from pydub import AudioSegment

from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile

from .models import Track, UserPlaybackState, PodcastProgress


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

    def _generate_silent_audio(self, duration_ms, format="mp3"):
        """Generates a silent audio segment and returns it as a file-like object."""
        silence = AudioSegment.silent(duration=duration_ms)
        file_obj = BytesIO()
        silence.export(file_obj, format=format)
        file_obj.seek(0)
        return file_obj

    def test_track_list_view(self):
        response = self.client.get(reverse('track_list'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.track.name)
        self.assertContains(response, self.track.artist)

    def test_upload_track_calculates_duration(self):
        """Test that uploading a track correctly calculates its duration."""
        from mutagen import File as MutagenFile

        # Generate a 3-second silent audio file in memory
        duration_ms = 3000
        audio_file_obj = self._generate_silent_audio(duration_ms=duration_ms)

        # Use mutagen to get the "true" duration from the generated file
        # This makes the test robust against minor encoding variations
        audio_file_obj.seek(0)
        audio_info = MutagenFile(audio_file_obj)
        expected_duration = audio_info.info.length
        audio_file_obj.seek(0)

        upload_file = SimpleUploadedFile(
            "silent_track.mp3",
            audio_file_obj.read(),
            content_type="audio/mpeg"
        )

        response = self.client.post(reverse('upload_track'), {
            'name': 'Silent Track',
            'artist': 'The Sound of Silence',
            'type': 'song',
            'file': upload_file,
        })

        self.assertEqual(response.status_code, 302)

        # Verify that the duration saved in the database matches what mutagen reported
        new_track = Track.objects.get(name='Silent Track')
        self.assertAlmostEqual(new_track.duration, expected_duration, places=5)

    def test_update_playback_state_api(self):
        """Test the API endpoint for updating playback state for a standard song."""
        url = reverse('update_playback_state')
        position = 42.5

        response = self.client.post(
            url,
            data=json.dumps({'track_id': self.track.id, 'position': position}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'success')

        playback_state = UserPlaybackState.objects.get(user=self.user)
        self.assertEqual(playback_state.track, self.track)
        self.assertEqual(playback_state.last_played_position, position)

        self.assertFalse(PodcastProgress.objects.filter(user=self.user, track=self.track).exists())

    def test_update_playback_state_for_podcast(self):
        """Test that the API also updates PodcastProgress for podcast tracks."""
        podcast_file = self._generate_silent_audio(duration_ms=120000) # 2 minutes
        upload_file = SimpleUploadedFile("podcast.mp3", podcast_file.read(), content_type="audio/mpeg")
        podcast_track = Track.objects.create(
            name='Test Podcast',
            type='podcast',
            file=upload_file,
            owner=self.user,
            duration=120.0
        )

        url = reverse('update_playback_state')
        position = 77.7

        response = self.client.post(
            url,
            data=json.dumps({'track_id': podcast_track.id, 'position': position}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        playback_state = UserPlaybackState.objects.get(user=self.user)
        self.assertEqual(playback_state.track, podcast_track)
        self.assertEqual(playback_state.last_played_position, position)

        podcast_progress = PodcastProgress.objects.get(user=self.user, track=podcast_track)
        self.assertEqual(podcast_progress.position, position)

    def test_update_playback_state_invalid_data(self):
        """Test API with invalid or missing data."""
        url = reverse('update_playback_state')

        response = self.client.post(url, data=json.dumps({'track_id': self.track.id}), content_type='application/json')
        self.assertEqual(response.status_code, 400)

        response = self.client.post(url, data=json.dumps({'position': 50}), content_type='application/json')
        self.assertEqual(response.status_code, 400)

        response = self.client.post(url, data='this is not json', content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_stream_track_view(self):
        # Test a normal request (no range header)
        response = self.client.get(reverse('stream_track', args=[self.track.id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Content-Length'), str(len(self.track_content)))
        self.assertEqual(b"".join(response.streaming_content), self.track_content)
        self.assertEqual(response.get('Accept-Ranges'), 'bytes')

        # Test a request with a range header
        range_header = 'bytes=6-10'
        response = self.client.get(reverse('stream_track', args=[self.track.id]), HTTP_RANGE=range_header)
        self.assertEqual(response.status_code, 206)

        expected_content = self.track_content[6:11]
        self.assertEqual(response.get('Content-Length'), str(len(expected_content)))
        self.assertEqual(response.get('Content-Range'), f'bytes 6-10/{len(self.track_content)}')
        self.assertEqual(b"".join(response.streaming_content), expected_content)