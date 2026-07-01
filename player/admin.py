from django.contrib import admin
from .models import (
    UserProfile, Track, UserPlaybackState, PodcastProgress, Bookmark,
    Transcript, UserTrackLastPlayed, Playlist, PlaylistItem,
)


class PlaylistItemInline(admin.TabularInline):
    model = PlaylistItem
    extra = 1
    raw_id_fields = ('track',)
    ordering = ('order',)


@admin.register(Playlist)
class PlaylistAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'accessor_count', 'track_count')
    search_fields = ('name', 'owner__username')
    list_filter = ('owner',)
    autocomplete_fields = ('owner',)
    filter_horizontal = ('accessors',)
    inlines = [PlaylistItemInline]

    def accessor_count(self, obj):
        return obj.accessors.count()
    accessor_count.short_description = 'Accessors'

    def track_count(self, obj):
        return obj.tracks.count()
    track_count.short_description = 'Tracks'


admin.site.register(Track)
admin.site.register(UserPlaybackState)
admin.site.register(PodcastProgress)
admin.site.register(Bookmark)
admin.site.register(UserProfile)
admin.site.register(Transcript)
admin.site.register(UserTrackLastPlayed)
