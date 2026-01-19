from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import api

router = DefaultRouter()
router.register(r'tracks', api.TrackViewSet, basename='track')
router.register(r'playlists', api.PlaylistViewSet, basename='playlist')
router.register(r'bookmarks', api.BookmarkViewSet, basename='bookmark')
router.register(r'playback-state', api.UserPlaybackStateViewSet, basename='playback-state')
router.register(r'profile', api.UserProfileViewSet, basename='profile')

urlpatterns = [
    path('login/', api.AuthViewSet.as_view({'post': 'login'}), name='api_login'),
    path('register/', api.AuthViewSet.as_view({'post': 'register'}), name='api_register'),
    path('', include(router.urls)),
]
