from django.db import models
from django.contrib.auth.models import User
from mutagen.mp3 import MP3

class Track(models.Model):
    TYPE_CHOICES = (
        ('song', 'Song'),
        ('podcast', 'Podcast'),
    )
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    file = models.FileField(upload_to='tracks/')
    icon = models.ImageField(upload_to='track_icons/', null=True, blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    duration = models.FloatField(default=0)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.file and not self.duration: # only calculate if not already set
            try:
                audio = MP3(self.file)
                self.duration = audio.info.length
            except Exception:
                self.duration = 0
        super().save(*args, **kwargs)

class Playlist(models.Model):
    name = models.CharField(max_length=255)
    tracks = models.ManyToManyField(Track, related_name='playlists')
    icon = models.ImageField(upload_to='playlist_icons/', null=True, blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return self.name

class ListeningHistory(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.SET_NULL, null=True, blank=True)
    position = models.FloatField(default=0)
    last_played = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Listening History"

class PodcastProgress(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    position = models.FloatField(default=0)

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"{self.user.username}'s progress in {self.track.name}"

class Profile(models.Model):
    THEME_STYLE_CHOICES = (
        ('matte', 'Matte'),
        ('glossy', 'Glossy'),
    )
    THEME_MODE_CHOICES = (
        ('light', 'Light'),
        ('dark', 'Dark'),
    )
    THEME_COLOR_CHOICES = (
        ('maroon', 'Maroon'),
        ('blue', 'Blue'),
        ('green', 'Green'),
        ('purple', 'Purple'),
        ('gray', 'Gray'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    theme_style = models.CharField(max_length=10, choices=THEME_STYLE_CHOICES, default='matte')
    theme_mode = models.CharField(max_length=10, choices=THEME_MODE_CHOICES, default='light')
    theme_color = models.CharField(max_length=10, choices=THEME_COLOR_CHOICES, default='blue')

    def __str__(self):
        return f"{self.user.username}'s Profile"