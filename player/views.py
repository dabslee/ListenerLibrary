import os
import re
import mimetypes
import logging
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login, authenticate
from django.http import FileResponse, StreamingHttpResponse, JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from .forms import TrackForm, PlaylistForm
from .models import Track, UserPlaybackState, PodcastProgress, Playlist, PlaylistItem, UserTrackLastPlayed
from mutagen import File as MutagenFile
from django.utils import timezone
from django.db import models
from wsgiref.util import FileWrapper
from django.http import HttpResponse
from django.urls import reverse
import json
from django.conf import settings

@login_required
def track_list(request):
    # Fetch all tracks and related data efficiently.
    tracks_query = Track.objects.filter(owner=request.user).order_by('name').prefetch_related('playlists')
    playlists = Playlist.objects.filter(owner=request.user)
    artists = tracks_query.values_list('artist', flat=True).distinct().order_by('artist')

    # Calculate storage usage
    current_storage_usage = tracks_query.aggregate(total_size=models.Sum('file_size'))['total_size'] or 0
    storage_percentage = (current_storage_usage / settings.STORAGE_LIMIT_BYTES) * 100 if settings.STORAGE_LIMIT_BYTES > 0 else 0

    tracks = list(tracks_query)
    track_ids = [t.id for t in tracks]

    # Get all necessary related data in a few queries
    podcast_progress = PodcastProgress.objects.filter(user=request.user, track_id__in=track_ids)
    podcast_progress_map = {p.track_id: p.position for p in podcast_progress}

    last_played_data = UserTrackLastPlayed.objects.filter(user=request.user, track_id__in=track_ids)
    last_played_map = {lp.track_id: lp.last_played for lp in last_played_data}

    # Attach the extra data to each track object
    for track in tracks:
        last_played_dt = last_played_map.get(track.id)
        track.last_played_iso = last_played_dt.isoformat() if last_played_dt else ''

        if track.type == 'podcast':
            position = podcast_progress_map.get(track.id, 0)
            track.position = position
            track.progress_percentage = (position / track.duration) * 100 if track.duration and track.duration > 0 else 0
        else:
            track.position = 0
            track.progress_percentage = 0

    context = {
        'tracks': tracks,
        'playlists': playlists,
        'artists': artists,
        'selected_playlist_id': int(request.GET.get('playlist')) if request.GET.get('playlist') else None,
        'selected_artist': request.GET.get('artist'),
        'search_query': request.GET.get('search'),
        'sort_option': request.GET.get('sort', 'name'),
        'storage_usage': current_storage_usage,
        'storage_limit': settings.STORAGE_LIMIT_BYTES,
        'storage_percentage': storage_percentage,
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
            # Explicitly specify the backend to ensure session is created correctly.
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
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

            # Check storage limit
            audio_file = request.FILES['file']
            new_track_size = audio_file.size
            current_storage_usage = Track.objects.filter(owner=request.user).aggregate(total_size=models.Sum('file_size'))['total_size'] or 0

            if current_storage_usage + new_track_size > settings.STORAGE_LIMIT_BYTES:
                form.add_error(None, f"Uploading this track would exceed your {settings.STORAGE_LIMIT_GB}GB storage limit.")
                return render(request, 'player/upload_track.html', {'form': form})

            track.file_size = new_track_size

            # Calculate and save track duration
            try:
                audio = MutagenFile(audio_file)
                if audio:
                    track.duration = audio.info.length
            except Exception as e:
                print(f"Error reading audio file metadata: {e}")
            finally:
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

            if 'file' in request.FILES:
                audio_file = request.FILES['file']
                new_track_size = audio_file.size
                old_track_size = track.file_size or 0

                # Check storage limit
                current_storage_usage = Track.objects.filter(owner=request.user).exclude(pk=track_id).aggregate(total_size=models.Sum('file_size'))['total_size'] or 0
                if current_storage_usage + new_track_size > settings.STORAGE_LIMIT_BYTES:
                    form.add_error(None, f"Uploading this track would exceed your {settings.STORAGE_LIMIT_GB}GB storage limit.")
                    return render(request, 'player/edit_track.html', {'form': form, 'track': track})

                edited_track.file_size = new_track_size

                # Calculate duration
                try:
                    audio = MutagenFile(audio_file)
                    if audio:
                        edited_track.duration = audio.info.length
                except Exception as e:
                    print(f"Error reading audio file metadata: {e}")
                finally:
                    audio_file.seek(0)

            edited_track.save()
            form.save_m2m()
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
        playlist_id = data.get('playlist_id')
        shuffle = data.get('shuffle', False)

        if track_id is None or position is None:
            return JsonResponse({'status': 'error', 'message': 'Missing track_id or position'}, status=400)

        track = get_object_or_404(Track, pk=track_id, owner=request.user)
        playlist = None
        if playlist_id:
            playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)

        # Update general playback state
        UserPlaybackState.objects.update_or_create(
            user=request.user,
            defaults={
                'track': track,
                'last_played_position': position,
                'playlist': playlist,
                'shuffle': shuffle,
            }
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
        logging.exception("Error updating playback state")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
def playlist_tracks_api(request, playlist_id):
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)
    items = playlist.playlistitem_set.select_related('track').order_by('order')
    track_ids = [item.track.id for item in items]

    podcast_progress = PodcastProgress.objects.filter(user=request.user, track_id__in=track_ids)
    podcast_progress_map = {p.track_id: p.position for p in podcast_progress}

    tracks_data = []
    for item in items:
        track = item.track
        tracks_data.append({
            'id': track.id,
            'name': track.name,
            'artist': track.artist,
            'stream_url': request.build_absolute_uri(reverse('stream_track', args=[track.id])),
            'icon_url': request.build_absolute_uri(track.icon.url) if track.icon else None,
            'type': track.type,
            'position': podcast_progress_map.get(track.id, 0)
        })
    return JsonResponse(tracks_data, safe=False)

@login_required
def stream_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    path = track.file.path
    size = os.path.getsize(path)
    content_type, _ = mimetypes.guess_type(path)
    content_type = content_type or 'application/octet-stream'

    range_header = request.META.get('HTTP_RANGE', '').strip()
    range_match = range_re.match(range_header)
    print("Range header raw:", request.META.get('HTTP_RANGE'))
    print("Range regex match:", bool(range_match))

    if range_match:
        first_byte, last_byte = range_match.groups()
        first_byte = int(first_byte) if first_byte else 0
        last_byte = int(last_byte) if last_byte else size - 1
        if last_byte >= size:
            last_byte = size - 1
        length = last_byte - first_byte + 1

        # Use the custom RangeFileWrapper for ranged requests
        f = open(path, 'rb')
        response = StreamingHttpResponse(RangeFileWrapper(f, offset=first_byte, length=length), status=206, content_type=content_type)
        response['Content-Length'] = str(length)
        response['Content-Range'] = f'bytes {first_byte}-{last_byte}/{size}'
    else:
        # Use StreamingHttpResponse for non-range requests as well for consistency
        response = StreamingHttpResponse(open(path, 'rb'), content_type=content_type)
        response['Content-Length'] = str(size)

    response['Accept-Ranges'] = 'bytes'
    return response