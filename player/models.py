from django.db import models
from django.contrib.auth.models import User

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

    def __str__(self):
        return self.name

class PlaybackState(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    current_track = models.ForeignKey(Track, on_delete=models.SET_NULL, null=True, blank=True)
    current_time = models.FloatField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Playback State"

class PodcastProgress(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    progress = models.FloatField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"{self.user.username}'s progress in {self.track.name}"