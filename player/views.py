import json
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from django.http import FileResponse, JsonResponse
from django.views.decorators.http import require_http_methods
from .forms import TrackForm
from .models import Track, PlaybackState, PodcastProgress

@login_required
def track_list(request):
    tracks = Track.objects.filter(owner=request.user).order_by('name')
    podcast_progress_qs = PodcastProgress.objects.filter(user=request.user, track__in=tracks)

    podcast_progress_map = {progress.track_id: progress.progress for progress in podcast_progress_qs}

    tracks_data = []
    for track in tracks:
        progress = podcast_progress_map.get(track.id, 0)
        progress_percentage = 0
        if track.duration and track.duration > 0:
            progress_percentage = (progress / track.duration) * 100

        track_info = {
            'id': track.id,
            'name': track.name,
            'artist': track.artist,
            'type': track.type,
            'file_url': track.file.url,
            'icon_url': track.icon.url if track.icon else None,
            'duration': track.duration,
            'progress': progress,
            'progress_percentage': progress_percentage,
        }
        tracks_data.append(track_info)

    context = {
        'tracks_data': tracks_data,
    }
    return render(request, 'player/track_list.html', context)

@login_required
def profile(request):
    return render(request, 'registration/profile.html')

def register(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('track_list')
    else:
        form = UserCreationForm()
    return render(request, 'registration/register.html', {'form': form})

@login_required
def upload_track(request):
    if request.method == 'POST':
        form = TrackForm(request.POST, request.FILES)
        if form.is_valid():
            track = form.save(commit=False)
            track.owner = request.user
            track.save()
            return redirect('track_list')
    else:
        form = TrackForm()
    return render(request, 'player/upload_track.html', {'form': form})

@login_required
def delete_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    if request.method == 'POST':
        track.delete()
        return redirect('track_list')
    return render(request, 'player/delete_track.html', {'track': track})

@login_required
def edit_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    if request.method == 'POST':
        form = TrackForm(request.POST, request.FILES, instance=track)
        if form.is_valid():
            form.save()
            return redirect('track_list')
    else:
        form = TrackForm(instance=track)
    return render(request, 'player/edit_track.html', {'form': form, 'track': track})

@login_required
def download_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    return FileResponse(track.file, as_attachment=True, filename=track.file.name)

@login_required
@require_http_methods(["GET", "POST"])
def update_playback_state(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        track_id = data.get('track_id')
        current_time = data.get('current_time')

        if track_id is None or current_time is None:
            return JsonResponse({'status': 'error', 'message': 'Missing track_id or current_time'}, status=400)

        track = get_object_or_404(Track, pk=track_id, owner=request.user)

        # Update general playback state
        playback_state, _ = PlaybackState.objects.update_or_create(
            user=request.user,
            defaults={'current_track': track, 'current_time': current_time}
        )

        # Update podcast-specific progress
        if track.type == 'podcast':
            podcast_progress, _ = PodcastProgress.objects.update_or_create(
                user=request.user,
                track=track,
                defaults={'progress': current_time}
            )

        return JsonResponse({'status': 'success'})

    if request.method == 'GET':
        try:
            playback_state = PlaybackState.objects.get(user=request.user)
            podcast_progress = PodcastProgress.objects.filter(user=request.user)

            progress_data = {item.track_id: item.progress for item in podcast_progress}

            return JsonResponse({
                'current_track_id': playback_state.current_track.id if playback_state.current_track else None,
                'current_time': playback_state.current_time,
                'podcast_progress': progress_data,
            })
        except PlaybackState.DoesNotExist:
            return JsonResponse({
                'current_track_id': None,
                'current_time': 0,
                'podcast_progress': {},
            })