from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.urls import reverse_lazy, reverse
from django.views import generic
from .models import Track, Playlist, ListeningHistory, PodcastProgress, Profile
from .forms import TrackForm, PlaylistForm, ProfileForm
from django.http import JsonResponse
import json

class SignUpView(generic.CreateView):
    form_class = UserCreationForm
    success_url = reverse_lazy("login")
    template_name = "registration/register.html"

@login_required
def profile(request):
    profile, created = Profile.objects.get_or_create(user=request.user)
    if request.method == 'POST':
        form = ProfileForm(request.POST, instance=profile)
        if form.is_valid():
            form.save()
            return redirect('profile')
    else:
        form = ProfileForm(instance=profile)
    return render(request, 'registration/profile.html', {'form': form})

@login_required
def track_list(request):
    tracks = Track.objects.filter(owner=request.user)
    playlists = Playlist.objects.filter(owner=request.user)

    listening_history = ListeningHistory.objects.filter(user=request.user).first()
    podcast_progress = {p.track_id: p.position for p in PodcastProgress.objects.filter(user=request.user)}

    context = {
        'tracks': tracks,
        'playlists': playlists,
        'listening_history': listening_history,
        'podcast_progress': podcast_progress,
    }
    return render(request, 'player/track_list.html', context)

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
    track = get_object_or_404(Track, id=track_id, owner=request.user)
    track.delete()
    return redirect('track_list')

@login_required
def create_playlist(request):
    if request.method == 'POST':
        form = PlaylistForm(request.POST, request.FILES)
        form.fields['tracks'].queryset = Track.objects.filter(owner=request.user)
        if form.is_valid():
            playlist = form.save(commit=False)
            playlist.owner = request.user
            playlist.save()
            form.save_m2m()
            return redirect('track_list')
    else:
        form = PlaylistForm()
        form.fields['tracks'].queryset = Track.objects.filter(owner=request.user)
    return render(request, 'player/create_playlist.html', {'form': form})

@login_required
def delete_playlist(request, playlist_id):
    playlist = get_object_or_404(Playlist, id=playlist_id, owner=request.user)
    playlist.delete()
    return redirect('track_list')

@login_required
def playlist_detail(request, playlist_id):
    playlist = get_object_or_404(Playlist, id=playlist_id, owner=request.user)
    return render(request, 'player/playlist_detail.html', {'playlist': playlist})

@login_required
def edit_playlist(request, playlist_id):
    playlist = get_object_or_404(Playlist, id=playlist_id, owner=request.user)
    if request.method == 'POST':
        form = PlaylistForm(request.POST, request.FILES, instance=playlist)
        form.fields['tracks'].queryset = Track.objects.filter(owner=request.user)
        if form.is_valid():
            form.save()
            return redirect('playlist_detail', playlist_id=playlist.id)
    else:
        form = PlaylistForm(instance=playlist)
        form.fields['tracks'].queryset = Track.objects.filter(owner=request.user)
    return render(request, 'player/edit_playlist.html', {'form': form, 'playlist': playlist})

@login_required
def update_progress(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        track_id = data.get('track_id')
        position = data.get('position')
        track = get_object_or_404(Track, id=track_id)

        # Update general listening history
        history, created = ListeningHistory.objects.get_or_create(user=request.user)
        history.track = track
        history.position = position
        history.save()

        # Update podcast-specific progress
        if track.type == 'podcast':
            progress, created = PodcastProgress.objects.get_or_create(user=request.user, track=track)
            progress.position = position
            progress.save()

        return JsonResponse({'status': 'success'})
    return JsonResponse({'status': 'error'}, status=400)