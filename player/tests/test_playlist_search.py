from django.test import TestCase
from django.contrib.auth.models import User
from player.models import Track, Playlist, PlaylistItem, Transcript
from django.urls import reverse

class PlaylistSearchTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.login(username='testuser', password='password')

        self.track1 = Track.objects.create(name='Apple', artist='Artist A', owner=self.user, type='song')
        self.track2 = Track.objects.create(name='Banana', artist='Artist B', owner=self.user, type='song')
        self.track3 = Track.objects.create(name='Cherry', artist='Artist C', owner=self.user, type='podcast')

        self.transcript3 = Transcript.objects.create(track=self.track3, content='This is a cherry podcast transcript', status='completed')

        self.playlist = Playlist.objects.create(name='My Playlist', owner=self.user)
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track1, order=0)
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track2, order=1)
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track3, order=2)

        self.url = reverse('playlist_detail', args=[self.playlist.id])

    def test_playlist_title_search(self):
        # Search for 'Apple'
        response = self.client.get(self.url, {'search_title': 'Apple'})
        self.assertEqual(response.status_code, 200)
        items = response.context['playlist_items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].track.name, 'Apple')

    def test_playlist_transcript_search(self):
        # Search for 'cherry' in transcript
        response = self.client.get(self.url, {'search_transcript': 'cherry'})
        self.assertEqual(response.status_code, 200)
        items = response.context['playlist_items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].track.name, 'Cherry')

    def test_playlist_search_ajax(self):
        # Search for 'Banana' via AJAX
        response = self.client.get(self.url, {'search_title': 'Banana'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('Banana', data['html'])
        self.assertNotIn('Apple', data['html'])
        self.assertEqual(len(data['playlist_data']), 1)
        self.assertEqual(data['playlist_data'][0]['name'], 'Banana')
