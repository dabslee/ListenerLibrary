import os
import re
import mimetypes
import logging
from django.core.paginator import Paginator
from django.shortcuts import render, redirect, get_object_or_404
from django.template.loader import render_to_string
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login, authenticate
from django.http import FileResponse, StreamingHttpResponse, JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from .forms import TrackForm, PlaylistForm, BookmarkForm, PlaylistUploadForm, TranscriptUploadForm
from .models import Track, UserPlaybackState, PodcastProgress, Playlist, PlaylistItem, UserTrackLastPlayed, Bookmark, Transcript
from mutagen import File as MutagenFile
import pysrt
from django.utils import timezone
from django.db import models, transaction
from wsgiref.util import FileWrapper
from django.http import HttpResponse
from django.urls import reverse
import json
from django.conf import settings

@login_required
def track_list(request):
    # Initial query
    tracks_query = Track.objects.filter(owner=request.user).select_related('transcript').prefetch_related('playlists')

    # Filtering
    title_search_query = request.GET.get('search_title') or request.GET.get('search')
    transcript_search_query = request.GET.get('search_transcript')
    selected_artist = request.GET.get('artist')
    selected_playlist_id = request.GET.get('playlist')
    sort_option = request.GET.get('sort', 'name')

    if title_search_query:
        tracks_query = tracks_query.filter(
            models.Q(name__icontains=title_search_query) |
            models.Q(artist__icontains=title_search_query)
        )
    if transcript_search_query:
        tracks_query = tracks_query.filter(transcript__content__icontains=transcript_search_query)
    if selected_artist:
        tracks_query = tracks_query.filter(artist=selected_artist)
    if selected_playlist_id:
        tracks_query = tracks_query.filter(playlists__id=selected_playlist_id)

    # Sorting
    if sort_option == 'last_played':
        tracks_query = tracks_query.order_by('-usertracklastplayed__last_played')
    else: # 'name'
        tracks_query = tracks_query.order_by('name')

    playlists = Playlist.objects.filter(owner=request.user)
    artists = Track.objects.filter(owner=request.user).values_list('artist', flat=True).distinct().order_by('artist')

    # Pagination
    paginator = Paginator(tracks_query, 10)  # Show 10 tracks per page
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    # Prepare track data with progress and last played info
    track_ids = [t.id for t in page_obj.object_list]
    podcast_progress = PodcastProgress.objects.filter(user=request.user, track_id__in=track_ids)
    podcast_progress_map = {p.track_id: p.position for p in podcast_progress}
    last_played_data = UserTrackLastPlayed.objects.filter(user=request.user, track_id__in=track_ids)
    last_played_map = {lp.track_id: lp.last_played for lp in last_played_data}

    for track in page_obj.object_list:
        last_played_dt = last_played_map.get(track.id)
        track.last_played_iso = last_played_dt.isoformat() if last_played_dt else ''
        if track.type == 'podcast':
            position = podcast_progress_map.get(track.id, 0)
            track.position = position
            track.progress_percentage = (position / track.duration) * 100 if track.duration and track.duration > 0 else 0
        else:
            track.position = 0
            track.progress_percentage = 0

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        track_html = render_to_string(
            'player/partials/track_list_items.html',
            {'tracks': page_obj.object_list, 'playlists': playlists}
        )
        pagination_html = render_to_string(
            'player/partials/pagination.html',
            {'tracks': page_obj}
        )
        return JsonResponse({'track_html': track_html, 'pagination_html': pagination_html})

    # Calculate storage usage for initial load
    current_storage_usage = tracks_query.aggregate(total_size=models.Sum('file_size'))['total_size'] or 0
    user_storage_limit_bytes = request.user.userprofile.storage_limit_gb * 1024 * 1024 * 1024
    storage_percentage = (current_storage_usage / user_storage_limit_bytes) * 100 if user_storage_limit_bytes > 0 else 0

    bookmarks = Bookmark.objects.filter(user=request.user).order_by('name')
    bookmark_form = BookmarkForm()

    context = {
        'tracks': page_obj,
        'playlists': playlists,
        'artists': artists,
        'selected_playlist_id': int(request.GET.get('playlist')) if request.GET.get('playlist') else None,
        'selected_artist': request.GET.get('artist'),
        'search_title_query': title_search_query,
        'transcript_search_query': transcript_search_query,
        'sort_option': request.GET.get('sort', 'name'),
        'storage_usage': current_storage_usage,
        'storage_limit': user_storage_limit_bytes,
        'storage_percentage': storage_percentage,
        'bookmarks': bookmarks,
        'bookmark_form': bookmark_form,
    }
    return render(request, 'player/track_list.html', context)

@login_required
def play_focus(request):
    return render(request, 'player/play_focus.html')

@login_required
def profile(request):
    return render(request, 'registration/profile.html')

from .models import UserProfile
from django.db.models import Sum

def register(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        total_storage_limit = UserProfile.objects.aggregate(Sum('storage_limit_gb'))['storage_limit_gb__sum'] or 0
        if total_storage_limit + settings.DEFAULT_USER_STORAGE_LIMIT_GB > settings.STORAGE_LIMIT_GB_TOTAL:
            form.add_error(None, "Registration is currently disabled due to storage limitations.")
            return render(request, 'registration/register.html', {'form': form})

        if form.is_valid():
            user = form.save()
            # UserProfile is created automatically by the post_save signal
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
            return redirect('track_list')
    else:
        form = UserCreationForm()
    return render(request, 'registration/register.html', {'form': form})

@login_required
def upload_track(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    request_transcript_checked = False
    transcript_form = TranscriptUploadForm()
    transcript_form.fields['source_file'].required = False

    if request.method == 'POST':
        form = TrackForm(request.POST, request.FILES)
        transcript_form = TranscriptUploadForm(request.POST, request.FILES)
        transcript_form.fields['source_file'].required = False
        request_transcript = request.POST.get('request_transcript') == 'on'
        request_transcript_checked = request_transcript
        transcript_file = request.FILES.get('source_file')
        transcript_error = None
        transcript_content = None

        if transcript_file:
            if not transcript_file.name.lower().endswith('.srt'):
                transcript_error = "Only .srt files are supported for upload."
            else:
                try:
                    transcript_content = transcript_file.read().decode('utf-8')
                    pysrt.from_string(transcript_content)
                except Exception as e:
                    transcript_error = f"Invalid SRT file: {e}"
                finally:
                    transcript_file.seek(0)

        if form.is_valid() and not transcript_error:
            track = form.save(commit=False)
            track.owner = request.user

            audio_file = request.FILES['file']
            new_track_size = audio_file.size
            current_storage_usage = Track.objects.filter(owner=request.user).aggregate(total_size=models.Sum('file_size'))['total_size'] or 0
            user_storage_limit_bytes = request.user.userprofile.storage_limit_gb * 1024 * 1024 * 1024

            if current_storage_usage + new_track_size > user_storage_limit_bytes:
                form.add_error(None, f"Uploading this track would exceed your {request.user.userprofile.storage_limit_gb}GB storage limit.")
                if is_ajax:
                    return JsonResponse({'status': 'error', 'errors': form.errors.get_json_data()}, status=400)
                return render(request, 'player/upload_track.html', {'form': form})

            track.file_size = new_track_size

            try:
                audio = MutagenFile(audio_file)
                if audio:
                    track.duration = audio.info.length
            except Exception as e:
                logging.error(f"Error reading audio file metadata: {e}")
            finally:
                audio_file.seek(0)

            track.save()

            if transcript_file and not transcript_error:
                transcript = Transcript(
                    track=track,
                    source_file=transcript_file,
                    content=transcript_content or ''
                )
                transcript.status = 'completed'
                transcript.error_message = None
                transcript.save()
            elif request_transcript:
                Transcript.objects.update_or_create(
                    track=track,
                    defaults={
                        'status': 'pending',
                        'source_file': None,
                        'error_message': None,
                        'content': ''
                    }
                )

            if is_ajax:
                return JsonResponse({
                    'status': 'success',
                    'message': 'Track uploaded successfully!',
                    'redirect_url': reverse('track_list')
                })
            return redirect('track_list')
        else:
            if transcript_error:
                transcript_form.add_error('source_file', transcript_error)
            if is_ajax:
                errors = form.errors.get_json_data()
                transcript_errors = transcript_form.errors.get_json_data()
                errors.update(transcript_errors)
                return JsonResponse({'status': 'error', 'errors': errors}, status=400)
    else:
        form = TrackForm()

    return render(request, 'player/upload_track.html', {
        'form': form,
        'transcript_form': transcript_form,
        'request_transcript_checked': request_transcript_checked
    })

@login_required
@require_POST
def delete_track_api(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    try:
        track.delete()
        return JsonResponse({'status': 'success', 'message': f'Track "{track.name}" deleted successfully.'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

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
                user_storage_limit_bytes = request.user.userprofile.storage_limit_gb * 1024 * 1024 * 1024
                if current_storage_usage + new_track_size > user_storage_limit_bytes:
                    form.add_error(None, f"Uploading this track would exceed your {request.user.userprofile.storage_limit_gb}GB storage limit.")
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

    transcript_form = TranscriptUploadForm()
    try:
        transcript = track.transcript
    except Transcript.DoesNotExist:
        transcript = None

    return render(request, 'player/edit_track.html', {
        'form': form,
        'track': track,
        'transcript_form': transcript_form,
        'transcript': transcript
    })


@login_required
@require_POST
def update_transcript(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    action = request.POST.get('action')

    if action == 'request':
        Transcript.objects.update_or_create(
            track=track,
            defaults={'status': 'pending', 'source_file': None, 'error_message': None}
        )
    elif action == 'upload':
        form = TranscriptUploadForm(request.POST, request.FILES)
        if form.is_valid():
            transcript, created = Transcript.objects.get_or_create(track=track)
            f = request.FILES['source_file']
            transcript.source_file = f

            if f.name.lower().endswith('.srt'):
                try:
                    # Validate SRT
                    content = f.read().decode('utf-8')
                    pysrt.from_string(content) # Check if valid
                    transcript.content = content
                    transcript.status = 'completed'
                    transcript.error_message = None
                except Exception as e:
                    transcript.status = 'failed'
                    transcript.error_message = f"Invalid SRT file: {e}"
            else:
                # We removed support for non-srt files for alignment
                # Just ignore or set error? Setting error for now to be safe.
                transcript.status = 'failed'
                transcript.error_message = "Only .srt files are supported for upload."

            transcript.save()
        else:
             # Handle invalid form if necessary, though simpler to redirect with error in session if needed
             pass

    return redirect('edit_track', track_id=track_id)

@login_required
def transcript_list(request):
    transcripts = Transcript.objects.filter(track__owner=request.user).select_related('track').order_by('-created_at')

    paginator = Paginator(transcripts, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    return render(request, 'player/transcript_list.html', {'transcripts': page_obj})

@login_required
def get_transcript_status(request, track_id):
    track = get_object_or_404(Track, pk=track_id)
    if track.owner != request.user:
        return JsonResponse({'status': 'error', 'message': 'Permission denied'}, status=403)

    try:
        transcript = track.transcript
        html = render_to_string('player/partials/transcript_status.html', {'transcript': transcript})
        return JsonResponse({'status': transcript.status, 'html': html})
    except Transcript.DoesNotExist:
        return JsonResponse({'status': 'none', 'html': ''})

@login_required
def get_transcript_json(request, track_id):
    track = get_object_or_404(Track, pk=track_id) # Allow reading public tracks if shared? Assuming owner for now or public.
    # If tracks are private to owner:
    if track.owner != request.user:
        return JsonResponse({'status': 'error', 'message': 'Permission denied'}, status=403)

    try:
        transcript = track.transcript
        if transcript.status != 'completed':
            return JsonResponse({'status': 'unavailable'})

        subs = pysrt.from_string(transcript.content)
        data = []
        for sub in subs:
            data.append({
                'start': sub.start.ordinal / 1000.0,
                'end': sub.end.ordinal / 1000.0,
                'text': sub.text
            })
        return JsonResponse({'status': 'success', 'transcript': data})
    except Transcript.DoesNotExist:
        return JsonResponse({'status': 'unavailable'})


@login_required
def export_transcript(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    try:
        transcript = track.transcript
    except Transcript.DoesNotExist:
        return HttpResponse("Transcript not found.", status=404)

    if transcript.status != 'completed' or not transcript.content:
        return HttpResponse("Transcript not available for export.", status=400)

    response = HttpResponse(transcript.content, content_type='application/x-subrip')
    response['Content-Disposition'] = f'attachment; filename="{track.name}.srt"'
    return response


@login_required
@require_POST
def cancel_transcript(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    try:
        transcript = track.transcript
    except Transcript.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Transcript not found.'}, status=404)

    if transcript.status != 'pending':
        return JsonResponse({'status': 'error', 'message': 'Only pending transcripts can be cancelled.'}, status=400)

    transcript.status = 'failed'
    transcript.error_message = 'Cancelled by user.'
    transcript.save()

    html = render_to_string('player/partials/transcript_status.html', {'transcript': transcript})
    return JsonResponse({'status': 'success', 'html': html})

@login_required
def download_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    return FileResponse(track.file, as_attachment=True, filename=track.file.name)


@login_required
def playlist_list(request):
    playlists = Playlist.objects.filter(owner=request.user)
    form = PlaylistUploadForm()
    return render(request, 'player/playlist_list.html', {'playlists': playlists, 'upload_form': form})

@login_required
def create_playlist(request):
    if request.method == 'POST':
        form = PlaylistForm(request.POST, request.FILES, user=request.user)
        if form.is_valid():
            playlist = form.save(commit=False)
            playlist.owner = request.user
            playlist.save()
            form.save_m2m()
            return redirect('playlist_list')
    else:
        form = PlaylistForm(user=request.user)
    return render(request, 'player/create_playlist.html', {'form': form})

@login_required
def playlist_detail(request, playlist_id):
    playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)
    # Use select_related to fetch track details efficiently to prevent N+1 queries
    playlist_items = playlist.playlistitem_set.select_related('track', 'track__transcript').all()

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
        form = PlaylistForm(request.POST, request.FILES, instance=playlist, user=request.user)
        if form.is_valid():
            playlist = form.save(commit=False)
            playlist.owner = request.user
            playlist.save()

            form.save_m2m()

            return redirect('playlist_list')
    else:
        form = PlaylistForm(instance=playlist, user=request.user)
    return render(request, 'player/edit_playlist.html', {'form': form, 'playlist': playlist})

@login_required
def upload_playlist(request):
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    if request.method == 'POST':
        form = PlaylistUploadForm(request.POST, request.FILES)
        if form.is_valid():
            uploaded_tracks = request.FILES.getlist('tracks')
            if not uploaded_tracks:
                form.add_error(None, "Please select at least one track file.")
                if is_ajax:
                    return JsonResponse({'status': 'error', 'errors': form.errors.get_json_data()}, status=400)
                return render(request, 'player/upload_playlist.html', {'form': form})

            current_storage_usage = Track.objects.filter(owner=request.user).aggregate(total_size=models.Sum('file_size'))['total_size'] or 0
            total_new_size = sum(audio_file.size for audio_file in uploaded_tracks)
            user_storage_limit_bytes = request.user.userprofile.storage_limit_gb * 1024 * 1024 * 1024
            if current_storage_usage + total_new_size > user_storage_limit_bytes:
                form.add_error(None, f"Uploading these tracks would exceed your {request.user.userprofile.storage_limit_gb}GB storage limit.")
                if is_ajax:
                    return JsonResponse({'status': 'error', 'errors': form.errors.get_json_data()}, status=400)
                return render(request, 'player/upload_playlist.html', {'form': form})

            try:
                with transaction.atomic():
                    playlist = Playlist.objects.create(
                        name=form.cleaned_data['name'],
                        owner=request.user,
                        image=form.cleaned_data['image']
                    )

                    default_icon = form.cleaned_data['default_track_icon']
                    default_type = form.cleaned_data['default_track_type']

                    for order, audio_file in enumerate(uploaded_tracks):
                        track_name = os.path.splitext(audio_file.name)[0]

                        try:
                            audio = MutagenFile(audio_file)
                            duration = audio.info.length if audio else 0
                        except Exception:
                            duration = 0
                        finally:
                            audio_file.seek(0)

                        track = Track.objects.create(
                            name=track_name,
                            owner=request.user,
                            file=audio_file,
                            icon=default_icon,
                            duration=duration,
                            file_size=audio_file.size,
                            type=default_type
                        )

                        PlaylistItem.objects.create(
                            playlist=playlist,
                            track=track,
                            order=order
                        )
            except Exception as exc:
                logging.exception("Error uploading playlist")
                error_message = "An error occurred while uploading your playlist. Please try again."
                error_message = f"{error_message} Details: {exc}"
                if is_ajax:
                    return JsonResponse({'status': 'error', 'errors': {'__all__': [error_message]}}, status=500)
                form.add_error(None, error_message)
                return render(request, 'player/upload_playlist.html', {'form': form})

            if is_ajax:
                return JsonResponse({'status': 'success', 'message': 'Playlist uploaded successfully!', 'redirect_url': reverse('playlist_list')})
            return redirect('playlist_list')
        else:
            if is_ajax:
                return JsonResponse({'status': 'error', 'errors': form.errors.get_json_data()}, status=400)
    else:
        form = PlaylistUploadForm()

    return render(request, 'player/upload_playlist.html', {'form': form})

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

    playlist_item = PlaylistItem.objects.filter(playlist=playlist, track=track).first()

    if playlist_item:
        playlist_item.delete()
        action = 'removed'
        message = f'Removed {track.name} from {playlist.name}.'
    else:
        max_order = playlist.playlistitem_set.aggregate(models.Max('order'))['order__max'] or -1
        PlaylistItem.objects.create(playlist=playlist, track=track, order=max_order + 1)
        action = 'added'
        message = f'Added {track.name} to {playlist.name}.'

    return JsonResponse({'status': 'success', 'action': action, 'message': message})

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
            'duration': track.duration,
            'position': podcast_progress_map.get(track.id, 0)
        })
    return JsonResponse(tracks_data, safe=False)

@login_required
@require_POST
def delete_bookmark(request, bookmark_id):
    bookmark = get_object_or_404(Bookmark, pk=bookmark_id, user=request.user)
    bookmark.delete()
    return JsonResponse({'status': 'success', 'message': 'Bookmark deleted.'})


@login_required
@require_POST
def play_bookmark(request, bookmark_id):
    bookmark = get_object_or_404(Bookmark, pk=bookmark_id, user=request.user)

    if not bookmark.track:
        return JsonResponse({'status': 'error', 'message': 'Bookmark has no associated track.'}, status=404)

    playback_state, _ = UserPlaybackState.objects.update_or_create(
        user=request.user,
        defaults={
            'track': bookmark.track,
            'last_played_position': bookmark.position,
            'playlist': bookmark.playlist,
            'shuffle': bookmark.shuffle,
        }
    )

    playback_state_data = {
        'trackId': playback_state.track.id,
        'trackName': playback_state.track.name,
        'trackArtist': playback_state.track.artist or 'No artist',
        'trackIcon': request.build_absolute_uri(playback_state.track.icon.url) if playback_state.track.icon else None,
        'trackStreamUrl': request.build_absolute_uri(reverse('stream_track', args=[playback_state.track.id])),
        'position': playback_state.last_played_position,
        'trackType': playback_state.track.type,
        'playlist': {
            'id': playback_state.playlist.id,
            'name': playback_state.playlist.name
        } if playback_state.playlist else None,
        'shuffle': playback_state.shuffle,
    }

    return JsonResponse({
        'status': 'success',
        'message': 'Playback state updated.',
        'playback_state': playback_state_data
    })


@login_required
@require_POST
def create_bookmark(request):
    form = BookmarkForm(request.POST)
    if form.is_valid():
        try:
            playback_state = UserPlaybackState.objects.get(user=request.user)
            bookmark = form.save(commit=False)
            bookmark.user = request.user
            bookmark.track = playback_state.track
            bookmark.position = playback_state.last_played_position
            bookmark.shuffle = playback_state.shuffle
            bookmark.playlist = playback_state.playlist
            bookmark.save()

            bookmark_item_html = render_to_string(
                'player/partials/bookmark_item.html',
                {'bookmark': bookmark}
            )

            return JsonResponse({
                'status': 'success',
                'message': 'Bookmark created.',
                'bookmark_item_html': bookmark_item_html,
            })
        except UserPlaybackState.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': 'No current playback state to bookmark.'}, status=404)
    else:
        return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)


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
