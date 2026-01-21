from django.test import TestCase
from django.contrib.auth.models import User
from player.models import Track, Transcript, Playlist, PlaylistItem
from django.urls import reverse

class TranscriptSearchAPITest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.login(username='testuser', password='password')

        self.track = Track.objects.create(name='Test Track', owner=self.user, type='podcast')
        self.transcript_content = """1
00:00:01,000 --> 00:00:04,000
Hello this is a test transcript.

2
00:00:05,000 --> 00:00:08,000
Searching for the keyword apple here.
"""
        self.transcript = Transcript.objects.create(track=self.track, content=self.transcript_content, status='completed')

        self.playlist = Playlist.objects.create(name='Test Playlist', owner=self.user)
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track, order=0)

    def test_search_transcripts_success(self):
        url = reverse('search_transcripts')
        response = self.client.get(url, {'q': 'apple'})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['track_id'], self.track.id)
        self.assertIn('apple', data[0]['text'])
        self.assertEqual(data[0]['start_time'], 5.0)

    def test_search_transcripts_with_playlist(self):
        url = reverse('search_transcripts')
        response = self.client.get(url, {'q': 'apple', 'playlist_id': self.playlist.id})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)

        # Test with a different playlist (empty or not containing the track)
        other_playlist = Playlist.objects.create(name='Other', owner=self.user)
        response = self.client.get(url, {'q': 'apple', 'playlist_id': other_playlist.id})
        self.assertEqual(len(response.json()), 0)

    def test_search_transcripts_min_length(self):
        url = reverse('search_transcripts')
        response = self.client.get(url, {'q': 'a'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 0)
