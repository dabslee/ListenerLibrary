from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from .forms import TrackForm
from .models import Track

@login_required
def track_list(request):
    tracks = Track.objects.filter(owner=request.user)
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