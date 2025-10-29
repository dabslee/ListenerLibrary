from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from django.core.validators import MinValueValidator

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    storage_limit_gb = models.FloatField(default=settings.DEFAULT_USER_STORAGE_LIMIT_GB, validators=[MinValueValidator(0.0)])

    def __str__(self):
        return self.user.username

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    instance.userprofile.save()


class Track(models.Model):
    TYPE_CHOICES = (
        ('song', 'Song'),
        ('podcast', 'Podcast'),
    )
    name = models.CharField(max_length=255)
    artist = models.CharField(max_length=255, blank=True, null=True)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    file = models.FileField(upload_to='tracks/')
    icon = models.ImageField(upload_to='track_icons/', null=True, blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    duration = models.FloatField(default=0)
    file_size = models.BigIntegerField(default=0)

    def __str__(self):
        return self.name


class UserPlaybackState(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.SET_NULL, null=True, blank=True)
    last_played_position = models.FloatField(default=0)
    shuffle = models.BooleanField(default=False)
    playlist = models.ForeignKey('Playlist', on_delete=models.SET_NULL, null=True, blank=True)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Playback State"


class PodcastProgress(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    position = models.FloatField()

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"Progress for {self.user.username} on {self.track.name}"


class Playlist(models.Model):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    image = models.ImageField(upload_to='playlist_images/', null=True, blank=True)
    tracks = models.ManyToManyField(Track, through='PlaylistItem', related_name='playlists')

    def __str__(self):
        return self.name

import sys
class PlaylistItem(models.Model):
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=2147483647)

    class Meta:
        ordering = ['order']
        unique_together = ('playlist', 'track')

    def __str__(self):
        return f"{self.track.name} in {self.playlist.name}"


class UserTrackLastPlayed(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    last_played = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"{self.user.username} last played {self.track.name} at {self.last_played}"


class Bookmark(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    track = models.ForeignKey(Track, on_delete=models.SET_NULL, null=True, blank=True)
    position = models.FloatField(default=0)
    shuffle = models.BooleanField(default=False)
    playlist = models.ForeignKey('Playlist', on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username}'s bookmark: {self.name}"


class UserOfflineTrack(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"{self.user.username}'s offline track: {self.track.name}"