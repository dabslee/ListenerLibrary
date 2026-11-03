from datetime import timedelta

from django.test import TestCase
from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone

from player.models import Track, Playlist, PlaylistItem


class PlaylistUpdatedAtTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='owner', password='password')
        self.client.login(username='owner', password='password')
        self.track1 = Track.objects.create(name='Song One', owner=self.user, type='song')
        self.track2 = Track.objects.create(name='Song Two', owner=self.user, type='song')
        self.playlist = Playlist.objects.create(name='Mix', owner=self.user)
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track1, order=0)
        self.backdate()

    def backdate(self):
        self.old = timezone.now() - timedelta(days=1)
        Playlist.objects.filter(pk=self.playlist.pk).update(updated_at=self.old)

    def assertTouched(self):
        self.playlist.refresh_from_db()
        self.assertGreater(self.playlist.updated_at, self.old)

    def test_adding_and_removing_track_touches_playlist(self):
        url = reverse('add_track_to_playlist')
        self.client.post(url, {'track_id': self.track2.id, 'playlist_id': self.playlist.id})
        self.assertTouched()
        self.backdate()
        self.client.post(url, {'track_id': self.track2.id, 'playlist_id': self.playlist.id})
        self.assertTouched()

    def test_remove_endpoint_touches_playlist(self):
        self.client.post(reverse('remove_track_from_playlist', args=[self.playlist.id, self.track1.id]))
        self.assertTouched()

    def test_reorder_touches_playlist(self):
        PlaylistItem.objects.create(playlist=self.playlist, track=self.track2, order=1)
        self.backdate()
        self.client.post(reverse('reorder_playlist', args=[self.playlist.id]),
                         {'track_ids[]': [self.track2.id, self.track1.id]})
        self.assertTouched()

    def test_playlist_list_has_sort_data(self):
        response = self.client.get(reverse('playlist_list'))
        self.assertContains(response, 'playlist-sort-controls')
        self.assertContains(response, f'data-sort-updated="{int(self.old.timestamp())}"')
