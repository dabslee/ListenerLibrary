from django.test import TestCase
from django.contrib.auth.models import User
from player.models import Track, UserTrackLastPlayed
from django.utils import timezone
from datetime import timedelta

class SortingTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.user2 = User.objects.create_user(username='testuser2', password='password')

        self.track1 = Track.objects.create(name='Track 1', owner=self.user, type='song')
        self.track2 = Track.objects.create(name='Track 2', owner=self.user, type='song')
        self.track3 = Track.objects.create(name='Track 3', owner=self.user, type='song')

        # Track 1 played by user 1 yesterday
        UserTrackLastPlayed.objects.create(user=self.user, track=self.track1, last_played=timezone.now() - timedelta(days=1))
        # Track 2 played by user 1 today
        UserTrackLastPlayed.objects.create(user=self.user, track=self.track2, last_played=timezone.now())
        # Track 3 never played by user 1

        # Track 3 played by user 2 today (should not affect user 1's sorting)
        UserTrackLastPlayed.objects.create(user=self.user2, track=self.track3, last_played=timezone.now())

    def test_last_played_sorting(self):
        self.client.login(username='testuser', password='password')
        response = self.client.get('/?sort=last_played')
        self.assertEqual(response.status_code, 200)

        tracks = list(response.context['tracks'].object_list)
        # Expected order: Track 2 (today), Track 1 (yesterday), Track 3 (never)
        # Currently, Track 3 might be first or in some other order depending on DB null handling

        self.assertEqual(tracks[0].name, 'Track 2')
        self.assertEqual(tracks[1].name, 'Track 1')
        self.assertEqual(tracks[2].name, 'Track 3')
