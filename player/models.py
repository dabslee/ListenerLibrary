from django.db import models
from django.contrib.auth.models import User
from django.db.models import F, ExpressionWrapper, FloatField

class PlaybackPosition(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    track = models.ForeignKey('Track', on_delete=models.CASCADE)
    position = models.FloatField(default=0)  # Store position in seconds

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"{self.user.username} - {self.track.name}: {self.position}s"

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
    duration = models.FloatField(default=0) # duration in seconds
    last_known_position = models.FloatField(default=0)

    def __str__(self):
        return self.name

    def get_last_position_for_user(self, user):
        if self.type == 'podcast':
            position_instance = PlaybackPosition.objects.filter(user=user, track=self).first()
            return position_instance.position if position_instance else 0
        else:
            # For songs, we might want to use the session or a simpler mechanism
            # For now, we'll just return 0, as per feature requirements
            return 0