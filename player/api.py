from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate, login
from .models import Track, Playlist, PlaylistItem, Bookmark, Transcript, UserPlaybackState, PodcastProgress, UserTrackLastPlayed
from .serializers import TrackSerializer, PlaylistSerializer, BookmarkSerializer, UserPlaybackStateSerializer, TranscriptSerializer
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator

class TrackViewSet(viewsets.ModelViewSet):
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'artist', 'transcript__content']
    ordering_fields = ['name', 'artist', 'duration']

    def get_queryset(self):
        user = self.request.user
        queryset = Track.objects.filter(owner=user).select_related('transcript')
        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'])
    def delete_track(self, request, pk=None):
        track = self.get_object()
        track.delete()
        return Response({'status': 'success'})

class PlaylistViewSet(viewsets.ModelViewSet):
    serializer_class = PlaylistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Playlist.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'])
    def add_track(self, request, pk=None):
        playlist = self.get_object()
        track_id = request.data.get('track_id')
        track = get_object_or_404(Track, pk=track_id, owner=request.user)

        if PlaylistItem.objects.filter(playlist=playlist, track=track).exists():
             return Response({'status': 'exists', 'message': 'Track already in playlist'})

        max_order = playlist.playlistitem_set.aggregate(models.Max('order'))['order__max'] or -1
        PlaylistItem.objects.create(playlist=playlist, track=track, order=max_order + 1)
        return Response({'status': 'success'})

    @action(detail=True, methods=['post'])
    def remove_track(self, request, pk=None):
        playlist = self.get_object()
        track_id = request.data.get('track_id')
        track = get_object_or_404(Track, pk=track_id, owner=request.user)
        PlaylistItem.objects.filter(playlist=playlist, track=track).delete()
        return Response({'status': 'success'})

    @action(detail=True, methods=['post'])
    def reorder(self, request, pk=None):
        playlist = self.get_object()
        track_ids = request.data.get('track_ids', [])
        for index, t_id in enumerate(track_ids):
            PlaylistItem.objects.filter(playlist=playlist, track_id=t_id).update(order=index)
        return Response({'status': 'success'})

class BookmarkViewSet(viewsets.ModelViewSet):
    serializer_class = BookmarkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Bookmark.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        if 'track' not in self.request.data:
            try:
                state = UserPlaybackState.objects.get(user=self.request.user)
                if state.track:
                    serializer.save(
                        user=self.request.user,
                        track=state.track,
                        position=state.last_played_position,
                        playlist=state.playlist,
                        shuffle=state.shuffle
                    )
                else:
                    raise serializers.ValidationError("No active track to bookmark")
            except UserPlaybackState.DoesNotExist:
                 raise serializers.ValidationError("No playback state found")
        else:
            serializer.save(user=self.request.user)

class UserPlaybackStateViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        try:
            state = UserPlaybackState.objects.get(user=request.user)
            serializer = UserPlaybackStateSerializer(state, context={'request': request})
            return Response(serializer.data)
        except UserPlaybackState.DoesNotExist:
            return Response({})

    @action(detail=False, methods=['post'])
    def update_state(self, request):
        track_id = request.data.get('track_id')
        position = request.data.get('position')
        playlist_id = request.data.get('playlist_id')
        shuffle = request.data.get('shuffle', False)

        if track_id:
            track = get_object_or_404(Track, pk=track_id, owner=request.user)
            playlist = None
            if playlist_id:
                playlist = get_object_or_404(Playlist, pk=playlist_id, owner=request.user)

            state, _ = UserPlaybackState.objects.update_or_create(
                user=request.user,
                defaults={
                    'track': track,
                    'last_played_position': position,
                    'playlist': playlist,
                    'shuffle': shuffle
                }
            )

            UserTrackLastPlayed.objects.update_or_create(
                user=request.user,
                track=track,
                defaults={'last_played': models.functions.Now()}
            )

            if track.type == 'podcast':
                PodcastProgress.objects.update_or_create(
                    user=request.user,
                    track=track,
                    defaults={'position': position}
                )

            return Response({'status': 'success'})
        return Response({'status': 'error', 'message': 'Missing track_id'}, status=400)

class AuthViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]

    @action(detail=False, methods=['post'])
    def login(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return Response({'status': 'success'})
        return Response({'status': 'error', 'message': 'Invalid credentials'}, status=400)
