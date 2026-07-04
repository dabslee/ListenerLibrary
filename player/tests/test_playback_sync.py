import json
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.test import TestCase
from django.utils import timezone

from player.models import PodcastProgress, Track, UserPlaybackState, UserTrackLastPlayed


def ms(dt):
    return int(dt.timestamp() * 1000)


class PlaybackSyncTests(TestCase):
    """Recency-based conflict resolution for playback state sync.

    Devices replaying progress captured while offline send a recorded_at
    timestamp; the server keeps whichever state (cloud or replayed) is newer.
    """

    def setUp(self):
        self.user = User.objects.create_user('listener', password='pw')
        self.podcast = Track.objects.create(
            name='Podcast', owner=self.user, type='podcast', duration=600,
            file=ContentFile(b'x', name='p.mp3'),
        )
        self.song = Track.objects.create(
            name='Song', owner=self.user, type='song', duration=180,
            file=ContentFile(b'x', name='s.mp3'),
        )
        self.client.force_login(self.user)

    def post_state(self, **payload):
        return self.client.post(
            '/api/update_playback_state/',
            data=json.dumps(payload),
            content_type='application/json',
        )

    def test_no_recorded_at_behaves_as_before(self):
        response = self.post_state(track_id=self.song.id, position=12.5)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['applied_state'])
        state = UserPlaybackState.objects.get(user=self.user)
        self.assertEqual(state.track_id, self.song.id)
        self.assertEqual(state.last_played_position, 12.5)

    def test_newer_replay_overwrites_older_cloud_state(self):
        old = timezone.now() - timedelta(hours=2)
        UserPlaybackState.objects.create(
            user=self.user, track=self.song, last_played_position=5, recorded_at=old,
        )
        newer = timezone.now() - timedelta(hours=1)
        response = self.post_state(
            track_id=self.podcast.id, position=99, recorded_at=ms(newer),
        )
        self.assertTrue(response.json()['applied_state'])
        state = UserPlaybackState.objects.get(user=self.user)
        self.assertEqual(state.track_id, self.podcast.id)
        self.assertEqual(state.last_played_position, 99)

    def test_stale_replay_does_not_overwrite_newer_cloud_state(self):
        recent = timezone.now() - timedelta(minutes=5)
        UserPlaybackState.objects.create(
            user=self.user, track=self.song, last_played_position=50, recorded_at=recent,
        )
        PodcastProgress.objects.create(
            user=self.user, track=self.podcast, position=300, recorded_at=recent,
        )
        stale = timezone.now() - timedelta(hours=3)
        response = self.post_state(
            track_id=self.podcast.id, position=10, recorded_at=ms(stale),
        )
        data = response.json()
        self.assertFalse(data['applied_state'])
        self.assertFalse(data['applied_podcast'])
        state = UserPlaybackState.objects.get(user=self.user)
        self.assertEqual(state.track_id, self.song.id)
        self.assertEqual(state.last_played_position, 50)
        progress = PodcastProgress.objects.get(user=self.user, track=self.podcast)
        self.assertEqual(progress.position, 300)

    def test_podcast_only_updates_progress_but_not_current_track(self):
        UserPlaybackState.objects.create(
            user=self.user, track=self.song, last_played_position=42,
            recorded_at=timezone.now() - timedelta(hours=5),
        )
        response = self.post_state(
            track_id=self.podcast.id, position=120,
            recorded_at=ms(timezone.now()), podcast_only=True,
        )
        data = response.json()
        self.assertFalse(data['applied_state'])
        self.assertTrue(data['applied_podcast'])
        # Current-track state untouched even though the replay was newer.
        state = UserPlaybackState.objects.get(user=self.user)
        self.assertEqual(state.track_id, self.song.id)
        progress = PodcastProgress.objects.get(user=self.user, track=self.podcast)
        self.assertEqual(progress.position, 120)

    def test_last_played_only_moves_forward(self):
        recent = timezone.now() - timedelta(minutes=1)
        UserTrackLastPlayed.objects.create(
            user=self.user, track=self.podcast, last_played=recent,
        )
        stale = timezone.now() - timedelta(days=1)
        self.post_state(track_id=self.podcast.id, position=1, recorded_at=ms(stale))
        last = UserTrackLastPlayed.objects.get(user=self.user, track=self.podcast)
        self.assertEqual(last.last_played, recent)

    def test_future_timestamp_clamped_to_now(self):
        future = timezone.now() + timedelta(days=365)
        self.post_state(track_id=self.song.id, position=1, recorded_at=ms(future))
        state = UserPlaybackState.objects.get(user=self.user)
        self.assertLessEqual(state.recorded_at, timezone.now())
        # A fast clock must not lock out subsequent normal updates.
        response = self.post_state(track_id=self.podcast.id, position=2)
        self.assertTrue(response.json()['applied_state'])

    def test_invalid_recorded_at_falls_back_to_now(self):
        response = self.post_state(
            track_id=self.song.id, position=3, recorded_at='not-a-number',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['applied_state'])
