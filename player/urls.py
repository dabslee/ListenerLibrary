from django.urls import path
from . import views

urlpatterns = [
    path('', views.track_list, name='track_list'),
    path('play_focus/', views.play_focus, name='play_focus'),
    path('profile/', views.profile, name='profile'),
    path('register/', views.register, name='register'),
    path('upload/', views.upload_track, name='upload_track'),
    path('track/<int:track_id>/delete/', views.delete_track, name='delete_track'),
    path('track/<int:track_id>/edit/', views.edit_track, name='edit_track'),
    path('track/<int:track_id>/download/', views.download_track, name='download_track'),
    path('track/<int:track_id>/stream/', views.stream_track, name='stream_track'),
    path('api/update_playback_state/', views.update_playback_state, name='update_playback_state'),

    # Playlist URLs
    path('playlists/', views.playlist_list, name='playlist_list'),
    path('playlists/create/', views.create_playlist, name='create_playlist'),
    path('playlists/<int:playlist_id>/', views.playlist_detail, name='playlist_detail'),
    path('playlists/<int:playlist_id>/edit/', views.edit_playlist, name='edit_playlist'),
    path('playlists/<int:playlist_id>/delete/', views.delete_playlist, name='delete_playlist'),
    path('playlists/<int:playlist_id>/reorder/', views.reorder_playlist, name='reorder_playlist'),
    path('playlists/add_track/', views.add_track_to_playlist, name='add_track_to_playlist'),
    path('playlists/remove_track/<int:playlist_id>/<int:track_id>/', views.remove_track_from_playlist, name='remove_track_from_playlist'),
]