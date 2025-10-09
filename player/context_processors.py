import json
from .models import UserPlaybackState, PodcastProgress

def playback_context(request):
    if not request.user.is_authenticated:
        return {}

    context = {
        'playback_state': None,
        'podcast_positions_json': '{}',
    }

    # Get last overall playback state
    try:
        playback_state = UserPlaybackState.objects.select_related('track').get(user=request.user)
        context['playback_state'] = playback_state
    except UserPlaybackState.DoesNotExist:
        pass

    # Get all podcast-specific progress points
    podcast_progress_list = PodcastProgress.objects.filter(user=request.user)
    podcast_positions_map = {p.track_id: p.position for p in podcast_progress_list}
    context['podcast_positions_json'] = podcast_positions_map

    return context