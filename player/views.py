import os
import re
import mimetypes
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from django.http import FileResponse, StreamingHttpResponse, JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from .forms import TrackForm, PlaylistForm
from .models import Track, UserPlaybackState, PodcastProgress, Playlist, PlaylistItem, UserTrackLastPlayed
from mutagen import File as MutagenFile
from django.utils import timezone
from django.db import models

import json

@login_required
def track_list(request):
    # Fetch all tracks and related data efficiently.
    # Prefetch playlists to avoid N+1 queries in the template for data-playlists.
    tracks_query = Track.objects.filter(owner=request.user).order_by('name').prefetch_related('playlists')

    playlists = Playlist.objects.filter(owner=request.user)
    artists = Track.objects.filter(owner=request.user).values_list('artist', flat=True).distinct().order_by('artist')

    # We need all tracks for client-side filtering, so convert to list here.
    tracks = list(tracks_query)
    track_ids = [t.id for t in tracks]

    # Get all necessary related data in a few queries
    podcast_progress = PodcastProgress.objects.filter(user=request.user, track_id__in=track_ids)
    podcast_progress_map = {p.track_id: p.position for p in podcast_progress}

    last_played_data = UserTrackLastPlayed.objects.filter(user=request.user, track_id__in=track_ids)
    last_played_map = {lp.track_id: lp.last_played for lp in last_played_data}

    # Attach the extra data to each track object
    for track in tracks:
        # Add last_played_iso for client-side sorting
        last_played_dt = last_played_map.get(track.id)
        track.last_played_iso = last_played_dt.isoformat() if last_played_dt else ''

        # Add progress bar data
        if track.type == 'podcast':
            position = podcast_progress_map.get(track.id, 0)
            track.position = position
            if track.duration and track.duration > 0:
                track.progress_percentage = (position / track.duration) * 100
            else:
                track.progress_percentage = 0
        else:
            track.position = 0
            track.progress_percentage = 0

    # The GET params are still read to set the initial state of the filter controls.
    # The actual filtering is done by JS.
    context = {
        'tracks': tracks,
        'playlists': playlists,
        'artists': artists,
        'selected_playlist_id': int(request.GET.get('playlist')) if request.GET.get('playlist') else None,
        'selected_artist': request.GET.get('artist'),
        'search_query': request.GET.get('search'),
        'sort_option': request.GET.get('sort', 'name'),
    }
    return render(request, 'player/track_list.html', context)

@login_required
def play_focus(request):
    return render(request, 'player/play_focus.html')

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

            # Calculate and save track duration
            audio_file = request.FILES['file']
            try:
                audio = MutagenFile(audio_file)
                if audio:
                    track.duration = audio.info.length
            except Exception as e:
                # Handle cases where mutagen can't read the file
                # For now, we'll just leave duration as 0
                print(f"Error reading audio file metadata: {e}")
            finally:
                # Reset file pointer for Django's saving mechanism
                audio_file.seek(0)

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
            edited_track = form.save(commit=False)

            # If a new file is uploaded, calculate its duration
            if 'file' in request.FILES:
                audio_file = request.FILES['file']
                try:
                    audio = MutagenFile(audio_file)
                    if audio:
                        edited_track.duration = audio.info.length
                except Exception as e:
                    print(f"Error reading audio file metadata: {e}")
                finally:
                    audio_file.seek(0)

            edited_track.save()
            form.save_m2m() # To save many-to-many fields if any
            return redirect('track_list')
    else:
        form = TrackForm(instance=track)
    return render(request, 'player/edit_track.html', {'form': form, 'track': track})

@login_required
def download_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    return FileResponse(track.file, as_attachment=True, filename=track.file.name)


@login_required
def playlist_list(request):
    playlists = Playlist.objects.filter(owner=request.user)
    return render(request, 'player/playlist_list.html', {'playlists': playlists})

@login_required
def create_playlist(request):
    if request.method == 'POST':
        form = PlaylistForm(request.POST, request.FILES)
        if form.is_valid():
            playlist = form.save(commit=False)
            playlist.owner = request.user
            playlist.save()
            return redirect('playlist_list')
    else:
        form = PlaylistForm()
    return render(request, 'player/create_playlist.html', {'form': form})

@login_required
def playlist_detail(request, playlist_id):
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)
    # Use select_related to fetch track details efficiently to prevent N+1 queries
    playlist_items = playlist.playlistitem_set.select_related('track').all()

    # Get track IDs to fetch their progress in one go
    track_ids = [item.track.id for item in playlist_items]

    # Fetch podcast progress for all relevant tracks
    podcast_progress = PodcastProgress.objects.filter(user=request.user, track_id__in=track_ids)
    podcast_progress_map = {p.track_id: p.position for p in podcast_progress}

    # Attach progress data to each track object
    for item in playlist_items:
        track = item.track
        if track.type == 'podcast':
            position = podcast_progress_map.get(track.id, 0)
            track.position = position
            if track.duration and track.duration > 0:
                track.progress_percentage = (position / track.duration) * 100
            else:
                track.progress_percentage = 0
        else:
            # Ensure non-podcast tracks have default values
            track.position = 0
            track.progress_percentage = 0

    context = {
        'playlist': playlist,
        'playlist_items': playlist_items,
    }
    return render(request, 'player/playlist_detail.html', context)

@login_required
def edit_playlist(request, playlist_id):
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)
    if request.method == 'POST':
        form = PlaylistForm(request.POST, request.FILES, instance=playlist)
        if form.is_valid():
            form.save()
            return redirect('playlist_list')
    else:
        form = PlaylistForm(instance=playlist)
    return render(request, 'player/edit_playlist.html', {'form': form, 'playlist': playlist})

@login_required
def delete_playlist(request, playlist_id):
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)
    if request.method == 'POST':
        playlist.delete()
        return redirect('playlist_list')
    return render(request, 'player/delete_playlist.html', {'playlist': playlist})

@login_required
@require_POST
def reorder_playlist(request, playlist_id):
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)
    track_ids = request.POST.getlist('track_ids[]')
    for index, track_id in enumerate(track_ids):
        PlaylistItem.objects.filter(playlist=playlist, track_id=track_id).update(order=index)
    return JsonResponse({'status': 'success'})

@login_required
@require_POST
def add_track_to_playlist(request):
    track_id = request.POST.get('track_id')
    playlist_id = request.POST.get('playlist_id')

    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)

    # Check if the item already exists
    if PlaylistItem.objects.filter(playlist=playlist, track=track).exists():
        return JsonResponse({'status': 'warning', 'message': 'Track already in playlist.'})

    # Get the highest order value and add 1
    max_order = playlist.playlistitem_set.aggregate(models.Max('order'))['order__max'] or 0

    PlaylistItem.objects.create(playlist=playlist, track=track, order=max_order + 1)

    return JsonResponse({'status': 'success', 'message': f'Added {track.name} to {playlist.name}.'})

@login_required
@require_POST
def remove_track_from_playlist(request, playlist_id, track_id):
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)
    track = get_object_or_404(Track, pk=track_id, owner=request.user)

    item = get_object_or_404(PlaylistItem, playlist=playlist, track=track)
    item.delete()

    return JsonResponse({'status': 'success', 'message': 'Track removed from playlist.'})


range_re = re.compile(r'bytes\s*=\s*(\d+)\s*-\s*(\d*)', re.I)

class RangeFileWrapper:
    def __init__(self, filelike, blksize=8192, offset=0, length=None):
        self.filelike = filelike
        self.filelike.seek(offset, os.SEEK_SET)
        self.remaining = length
        self.blksize = blksize

    def __iter__(self):
        return self

    def __next__(self):
        if self.remaining is None:
            data = self.filelike.read(self.blksize)
            if data:
                return data
            raise StopIteration()
        else:
            if self.remaining <= 0:
                raise StopIteration()
            data = self.filelike.read(min(self.remaining, self.blksize))
            if not data:
                raise StopIteration()
            self.remaining -= len(data)
            return data

@csrf_exempt
@require_POST
@login_required
def update_playback_state(request):
    try:
        data = json.loads(request.body)
        track_id = data.get('track_id')
        position = data.get('position')

        if track_id is None or position is None:
            return JsonResponse({'status': 'error', 'message': 'Missing track_id or position'}, status=400)

        track = get_object_or_404(Track, pk=track_id, owner=request.user)

        # Update general playback state
        UserPlaybackState.objects.update_or_create(
            user=request.user,
            defaults={'track': track, 'last_played_position': position}
        )

        # Update last played timestamp
        UserTrackLastPlayed.objects.update_or_create(
            user=request.user,
            track=track,
            defaults={'last_played': timezone.now()}
        )

        # Update podcast-specific progress
        if track.type == 'podcast':
            PodcastProgress.objects.update_or_create(
                user=request.user,
                track=track,
                defaults={'position': position}
            )

        return JsonResponse({'status': 'success'})
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
def stream_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    path = track.file.path

    range_header = request.META.get('HTTP_RANGE', '').strip()
    range_match = range_re.match(range_header)

    size = os.path.getsize(path)
    content_type, _ = mimetypes.guess_type(path)
    content_type = content_type or 'application/octet-stream'

    if range_match:
        first_byte, last_byte = range_match.groups()
        first_byte = int(first_byte) if first_byte else 0
        last_byte = int(last_byte) if last_byte else size - 1
        if last_byte >= size:
            last_byte = size - 1
        length = last_byte - first_byte + 1

        resp = StreamingHttpResponse(RangeFileWrapper(open(path, 'rb'), offset=first_byte, length=length), status=206, content_type=content_type)
        resp['Content-Length'] = str(length)
        resp['Content-Range'] = f'bytes {first_byte}-{last_byte}/{size}'
    else:
        resp = StreamingHttpResponse(open(path, 'rb'), content_type=content_type)
        resp['Content-Length'] = str(size)

    resp['Accept-Ranges'] = 'bytes'
    return resp