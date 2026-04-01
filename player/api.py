from rest_framework import viewsets, permissions, status, filters, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models, transaction
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate, login
from .models import Track, Playlist, PlaylistItem, Bookmark, Transcript, UserPlaybackState, PodcastProgress, UserTrackLastPlayed, UserProfile
from .serializers import TrackSerializer, PlaylistSerializer, BookmarkSerializer, UserPlaybackStateSerializer, TranscriptSerializer, UserProfileSerializer, UserRegistrationSerializer
from django.utils import timezone
from django.conf import settings
from mutagen import File as MutagenFile
import pysrt
import os

class TrackViewSet(viewsets.ModelViewSet):
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'artist', 'transcript__content']
    ordering_fields = ['name', 'artist', 'duration', 'usertracklastplayed__last_played']

    def get_queryset(self):
        user = self.request.user
        queryset = Track.objects.filter(owner=user).select_related('transcript')

        selected_artist = self.request.query_params.get('artist')
        selected_playlist_id = self.request.query_params.get('playlist')

        if selected_artist:
            queryset = queryset.filter(artist=selected_artist)
        if selected_playlist_id:
            queryset = queryset.filter(playlists__id=selected_playlist_id)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        audio_file = self.request.FILES.get('file')

        if audio_file:
            new_track_size = audio_file.size
            current_storage_usage = Track.objects.filter(owner=user).aggregate(total_size=models.Sum('file_size'))['total_size'] or 0
            user_storage_limit_bytes = user.userprofile.storage_limit_gb * 1024 * 1024 * 1024

            if current_storage_usage + new_track_size > user_storage_limit_bytes:
                raise serializers.ValidationError(f"Storage limit exceeded. Limit: {user.userprofile.storage_limit_gb}GB")

            duration = 0
            try:
                audio_file.seek(0)
                audio = MutagenFile(audio_file)
                if audio:
                    duration = audio.info.length
                audio_file.seek(0)
            except Exception as e:
                print(f"Error reading metadata: {e}")

            serializer.save(owner=user, file_size=new_track_size, duration=duration)
        else:
             serializer.save(owner=user)

    @action(detail=True, methods=['post'])
    def delete_track(self, request, pk=None):
        track = self.get_object()
        track.delete()
        return Response({'status': 'success'})

    @action(detail=True, methods=['get'])
    def transcript(self, request, pk=None):
        track = self.get_object()
        try:
            transcript = track.transcript
            if transcript.status != 'completed':
                 return Response({'status': 'unavailable'})

            subs = pysrt.from_string(transcript.content)
            data = []
            for sub in subs:
                data.append({
                    'start': sub.start.ordinal / 1000.0,
                    'end': sub.end.ordinal / 1000.0,
                    'text': sub.text
                })
            return Response({'status': 'success', 'transcript': data})
        except Transcript.DoesNotExist:
            return Response({'status': 'unavailable'})

    @action(detail=True, methods=['post'])
    def upload_transcript(self, request, pk=None):
        track = self.get_object()
        file = request.FILES.get('file')
        if not file or not file.name.endswith('.srt'):
            return Response({'status': 'error', 'message': 'Invalid file'}, status=400)

        try:
            content = file.read().decode('utf-8')
            pysrt.from_string(content)
            Transcript.objects.update_or_create(
                track=track,
                defaults={
                    'status': 'completed',
                    'content': content,
                    'source_file': file,
                    'error_message': None
                }
            )
            return Response({'status': 'success'})
        except Exception as e:
            return Response({'status': 'error', 'message': str(e)}, status=400)

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

    @action(detail=True, methods=['get'])
    def tracks(self, request, pk=None):
        playlist = self.get_object()
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
        return Response(tracks_data)

    @action(detail=False, methods=['post'])
    def upload(self, request):
        name = request.data.get('name')
        uploaded_tracks = request.FILES.getlist('tracks')

        if not uploaded_tracks:
            return Response({'status': 'error', 'message': 'No files provided'}, status=400)

        user = request.user

        # Check total size
        total_new_size = sum(f.size for f in uploaded_tracks)
        current_storage_usage = Track.objects.filter(owner=user).aggregate(total_size=models.Sum('file_size'))['total_size'] or 0
        user_storage_limit_bytes = user.userprofile.storage_limit_gb * 1024 * 1024 * 1024

        if current_storage_usage + total_new_size > user_storage_limit_bytes:
             return Response({'status': 'error', 'message': 'Storage limit exceeded'}, status=400)

        try:
            with transaction.atomic():
                playlist = Playlist.objects.create(name=name, owner=user)

                for order, audio_file in enumerate(uploaded_tracks):
                    track_name = os.path.splitext(audio_file.name)[0]
                    duration = 0
                    try:
                        audio_file.seek(0)
                        audio = MutagenFile(audio_file)
                        if audio:
                            duration = audio.info.length
                        audio_file.seek(0)
                    except:
                        pass

                    track = Track.objects.create(
                        name=track_name,
                        owner=user,
                        file=audio_file,
                        duration=duration,
                        file_size=audio_file.size,
                        type='song' # Default
                    )

                    PlaylistItem.objects.create(playlist=playlist, track=track, order=order)

            return Response({'status': 'success'})
        except Exception as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)

class BookmarkViewSet(viewsets.ModelViewSet):
    serializer_class = BookmarkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Bookmark.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        try:
            state = UserPlaybackState.objects.get(user=self.request.user)
            serializer.save(
                user=self.request.user,
                track=state.track,
                position=state.last_played_position,
                playlist=state.playlist,
                shuffle=state.shuffle
            )
        except UserPlaybackState.DoesNotExist:
            raise serializers.ValidationError({"error": "No playback state found"})

    @action(detail=True, methods=['post'])
    def play(self, request, pk=None):
        bookmark = self.get_object()
        if not bookmark.track:
            return Response({'status': 'error', 'message': 'Bookmark has no associated track.'}, status=status.HTTP_404_NOT_FOUND)

        playback_state, _ = UserPlaybackState.objects.update_or_create(
            user=request.user,
            defaults={
                'track': bookmark.track,
                'last_played_position': bookmark.position,
                'playlist': bookmark.playlist,
                'shuffle': bookmark.shuffle,
            }
        )
        serializer = UserPlaybackStateSerializer(playback_state, context={'request': request})
        return Response({'status': 'success', 'playback_state': serializer.data})

class UserPlaybackStateViewSet(viewsets.ModelViewSet):
    queryset = UserPlaybackState.objects.all()
    serializer_class = UserPlaybackStateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserPlaybackState.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        track_id = request.data.get('track_id')
        position = request.data.get('position')
        playlist_id = request.data.get('playlist_id')
        shuffle = request.data.get('shuffle', False)

        if track_id is None or position is None:
            return Response({'error': 'track_id and position are required'}, status=status.HTTP_400_BAD_REQUEST)

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
                'shuffle': shuffle,
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

class UserProfileViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        profile = request.user.userprofile
        return Response(UserProfileSerializer(profile).data)

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

    @action(detail=False, methods=['post'])
    def register(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            login(request, user)
            return Response({'status': 'success'})
        return Response(serializer.errors, status=400)
