from django.contrib import admin
from .models import UserProfile, Track, UserPlaybackState, PodcastProgress, Bookmark, Transcript

admin.site.register(Track)
admin.site.register(UserPlaybackState)
admin.site.register(PodcastProgress)
admin.site.register(Bookmark)
admin.site.register(UserProfile)
admin.site.register(Transcript)
