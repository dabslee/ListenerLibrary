from django.test import TestCase
from django.contrib.auth.models import User
from django.urls import reverse

from player.models import Track, Playlist, PlaylistItem


class PlaylistAccessorTest(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='password')
        self.accessor = User.objects.create_user(username='accessor', password='password')
        self.stranger = User.objects.create_user(username='stranger', password='password')

        self.track1 = Track.objects.create(name='Song One', owner=self.owner, type='song', duration=90)
        self.track2 = Track.objects.create(name='Song Two', owner=self.owner, type='song', duration=150)

        self.playlist = Playlist.objects.create(name='Shared Playlist', owner=self.owner)
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track1, order=0)
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track2, order=1)
        self.playlist.accessors.add(self.accessor)

        self.detail_url = reverse('playlist_detail', args=[self.playlist.id])

    def test_owner_can_view(self):
        self.client.login(username='owner', password='password')
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.context['is_owner'])
        # Owner sees the edit controls
        self.assertIn('Edit Playlist Details', response.content.decode())

    def test_accessor_can_view_but_not_edit(self):
        self.client.login(username='accessor', password='password')
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.context['is_owner'])
        # Accessor does not see owner-only edit controls
        self.assertNotIn('Edit Playlist Details', response.content.decode())

    def test_stranger_cannot_view(self):
        self.client.login(username='stranger', password='password')
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, 404)

    def test_accessor_can_stream_track(self):
        self.client.login(username='accessor', password='password')
        # Stranger blocked
        self.client.logout()
        self.client.login(username='stranger', password='password')
        response = self.client.get(reverse('stream_track', args=[self.track1.id]))
        self.assertEqual(response.status_code, 404)

    def test_total_duration_in_context(self):
        self.client.login(username='owner', password='password')
        response = self.client.get(self.detail_url)
        self.assertEqual(response.context['total_duration'], 240)

    def test_owner_only_edit_playlist_blocks_accessor(self):
        self.client.login(username='accessor', password='password')
        response = self.client.get(reverse('edit_playlist', args=[self.playlist.id]))
        self.assertEqual(response.status_code, 404)

    def test_accessor_sees_playlist_in_list(self):
        self.client.login(username='accessor', password='password')
        response = self.client.get(reverse('playlist_list'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Shared Playlist')

    def test_stranger_does_not_see_playlist_in_list(self):
        self.client.login(username='stranger', password='password')
        response = self.client.get(reverse('playlist_list'))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'Shared Playlist')
