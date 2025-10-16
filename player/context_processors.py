from .models import UserPlaybackState, Bookmark

def global_context(request):
    if request.user.is_authenticated:
        state = UserPlaybackState.objects.select_related('track', 'playlist').get(user=request.user)
        bookmarks = Bookmark.objects.filter(user=request.user).order_by('name')
        return {'playback_state': state, 'bookmarks': bookmarks}
    return {'playback_state': None, 'bookmarks': []}