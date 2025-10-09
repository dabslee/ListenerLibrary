from .models import UserPlaybackState

def playback_state(request):
    if request.user.is_authenticated:
        try:
            state = UserPlaybackState.objects.select_related('track', 'playlist').get(user=request.user)
        except UserPlaybackState.DoesNotExist:
            state = None
        return {'playback_state': state}
    return {'playback_state': None}