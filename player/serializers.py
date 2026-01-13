from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Track, Playlist, PlaylistItem, Bookmark, Transcript, UserPlaybackState, PodcastProgress, UserProfile
from django.conf import settings
from django.db.models import Sum

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    password_confirmation = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password_confirmation']

    def validate(self, data):
        if data['password'] != data['password_confirmation']:
            raise serializers.ValidationError("Passwords do not match.")

        # Check storage limit
        total_storage_limit = UserProfile.objects.aggregate(Sum('storage_limit_gb'))['storage_limit_gb__sum'] or 0
        if total_storage_limit + settings.DEFAULT_USER_STORAGE_LIMIT_GB > settings.STORAGE_LIMIT_GB_TOTAL:
            raise serializers.ValidationError("Registration is currently disabled due to storage limitations.")

        return data

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password']
        )
        return user

class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    storage_usage_bytes = serializers.SerializerMethodField()
    storage_limit_bytes = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['storage_limit_gb', 'username', 'storage_usage_bytes', 'storage_limit_bytes']

    def get_storage_usage_bytes(self, obj):
        return Track.objects.filter(owner=obj.user).aggregate(Sum('file_size'))['file_size__sum'] or 0

    def get_storage_limit_bytes(self, obj):
        return obj.storage_limit_gb * 1024 * 1024 * 1024

class TranscriptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transcript
        fields = '__all__'

class TrackSerializer(serializers.ModelSerializer):
    transcript = TranscriptSerializer(read_only=True)
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())
    # Computed fields for frontend convenience (populated in views usually, but good to have)
    position = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    last_played_iso = serializers.SerializerMethodField()
    icon_url = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Track
        fields = ['id', 'name', 'artist', 'type', 'file', 'icon', 'owner', 'duration', 'file_size',
                  'transcript', 'position', 'progress_percentage', 'last_played_iso', 'icon_url', 'file_url']
        read_only_fields = ['duration', 'file_size']

    def get_position(self, obj):
        # This requires context to be passed to the serializer
        if 'request' not in self.context:
            return 0

        user = self.context['request'].user
        if not user.is_authenticated:
            return 0

        # Check if precalculated attribute exists (from ViewSet query optimization)
        if hasattr(obj, 'user_position'):
            return obj.user_position

        if obj.type == 'podcast':
            try:
                progress = PodcastProgress.objects.get(user=user, track=obj)
                return progress.position
            except PodcastProgress.DoesNotExist:
                return 0
        return 0

    def get_progress_percentage(self, obj):
        if obj.duration and obj.duration > 0:
            return (self.get_position(obj) / obj.duration) * 100
        return 0

    def get_last_played_iso(self, obj):
        # Optimization: Check if pre-fetched
        if hasattr(obj, 'last_played_time'):
            return obj.last_played_time.isoformat() if obj.last_played_time else None
        return None

    def get_icon_url(self, obj):
        if obj.icon:
            return self.context['request'].build_absolute_uri(obj.icon.url)
        return None

    def get_file_url(self, obj):
        return self.context['request'].build_absolute_uri(obj.file.url)

class PlaylistItemSerializer(serializers.ModelSerializer):
    track = TrackSerializer(read_only=True)

    class Meta:
        model = PlaylistItem
        fields = ['id', 'track', 'order']

class PlaylistSerializer(serializers.ModelSerializer):
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())
    tracks = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = ['id', 'name', 'owner', 'image', 'tracks', 'image_url']

    def get_tracks(self, obj):
        # Efficiently get tracks ordered by 'playlistitem__order'
        # We might need to paginate this if playlists are huge, but for now return all
        # To avoid infinite recursion or heavy loads in list view, we might want to exclude full tracks details in list view
        # For now, let's keep it but be aware.
        items = PlaylistItem.objects.filter(playlist=obj).order_by('order').select_related('track')
        return PlaylistItemSerializer(items, many=True, context=self.context).data

    def get_image_url(self, obj):
        if obj.image:
            return self.context['request'].build_absolute_uri(obj.image.url)
        return None

class BookmarkSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())
    track_details = TrackSerializer(source='track', read_only=True)

    class Meta:
        model = Bookmark
        fields = ['id', 'user', 'name', 'track', 'track_details', 'position', 'shuffle', 'playlist']

class UserPlaybackStateSerializer(serializers.ModelSerializer):
    track = TrackSerializer(read_only=True)
    playlist = PlaylistSerializer(read_only=True)
    trackId = serializers.IntegerField(source='track.id', read_only=True)
    trackName = serializers.CharField(source='track.name', read_only=True)
    trackArtist = serializers.CharField(source='track.artist', read_only=True)
    trackIcon = serializers.SerializerMethodField()
    trackStreamUrl = serializers.SerializerMethodField()
    trackType = serializers.CharField(source='track.type', read_only=True)
    position = serializers.FloatField(source='last_played_position')
    duration = serializers.FloatField(source='track.duration', read_only=True)

    class Meta:
        model = UserPlaybackState
        fields = ['user', 'track', 'last_played_position', 'shuffle', 'playlist',
                  'trackId', 'trackName', 'trackArtist', 'trackIcon', 'trackStreamUrl', 'trackType', 'position', 'duration']

    def get_trackIcon(self, obj):
        if obj.track and obj.track.icon:
            return self.context['request'].build_absolute_uri(obj.track.icon.url)
        return None

    def get_trackStreamUrl(self, obj):
        if obj.track:
             from django.urls import reverse
             return self.context['request'].build_absolute_uri(reverse('stream_track', args=[obj.track.id]))
        return None
