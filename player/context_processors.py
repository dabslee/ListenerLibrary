from .models import UserPlaybackState, Bookmark
from .forms import BookmarkForm

def global_context(request):
    if request.user.is_authenticated:
        state = UserPlaybackState.objects.select_related('track', 'playlist').get(user=request.user) if UserPlaybackState.objects.filter(user=request.user).exists() else None
        bookmarks = Bookmark.objects.filter(user=request.user).order_by('name')
        return {'playback_state': state, 'bookmarks': bookmarks, 'bookmark_form': BookmarkForm(prefix="bookmarkform")}
    return {'playback_state': None, 'bookmarks': [], 'bookmark_form': BookmarkForm(prefix="bookmarkform")}