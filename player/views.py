import os
import re
import mimetypes
import json
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from django.http import FileResponse, StreamingHttpResponse, JsonResponse
from django.db.models import OuterRef, Subquery, FloatField
from .forms import TrackForm
from .models import Track, PlaybackPosition

@login_required
def track_list(request):
    user_positions = PlaybackPosition.objects.filter(
        track=OuterRef('pk'),
        user=request.user
    ).values('position')[:1]

    tracks = Track.objects.filter(owner=request.user).annotate(
        user_position=Subquery(user_positions, output_field=FloatField())
    ).order_by('name')

    return render(request, 'player/track_list.html', {'tracks': tracks})

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

import logging
logger = logging.getLogger(__name__)

@login_required
def upload_track(request):
    if request.method == 'POST':
        form = TrackForm(request.POST, request.FILES)
        if form.is_valid():
            logger.info("Form is valid, saving track.")
            track = form.save(commit=False)
            track.owner = request.user
            track.save()
            return redirect('track_list')
        else:
            logger.error(f"Form errors: {form.errors.as_json()}")
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

@login_required
@require_POST
@csrf_exempt
def update_playback_position(request):
    try:
        data = json.loads(request.body)
        track_id = data.get('track_id')
        position = data.get('position')

        if track_id is None or position is None:
            return JsonResponse({'status': 'error', 'message': 'Missing track_id or position'}, status=400)

        track = get_object_or_404(Track, pk=track_id, owner=request.user)

        track.last_known_position = position
        track.save()

        if track.type == 'podcast':
            PlaybackPosition.objects.update_or_create(
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
def get_last_position(request):
    last_played_track_id = request.session.get('last_played_track_id')
    if not last_played_track_id:
        return JsonResponse({'status': 'error', 'message': 'No last played track found'}, status=404)

    try:
        track = Track.objects.get(pk=last_played_track_id, owner=request.user)
        position_instance = PlaybackPosition.objects.filter(user=request.user, track=track).first()

        position = 0
        if track.type == 'podcast':
            if position_instance:
                position = position_instance.position
        else:
            position = track.last_known_position

        return JsonResponse({
            'status': 'success',
            'track_id': track.id,
            'track_name': track.name,
            'track_url': track.file.url,
            'icon_url': track.icon.url if track.icon else None,
            'position': position,
            'track_type': track.type,
            'duration': track.duration,
        })
    except Track.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Track not found'}, status=404)

@login_required
def stream_track(request, track_id):
    track = get_object_or_404(Track, pk=track_id, owner=request.user)
    request.session['last_played_track_id'] = track.id
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