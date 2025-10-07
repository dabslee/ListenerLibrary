from django.urls import path
from . import views

urlpatterns = [
    path("", views.track_list, name="track_list"),
    path("profile/", views.profile, name="profile"),
    path("register/", views.SignUpView.as_view(), name="register"),
    path("upload/", views.upload_track, name="upload_track"),
    path("track/<int:track_id>/delete/", views.delete_track, name="delete_track"),
    path("playlist/create/", views.create_playlist, name="create_playlist"),
    path("playlist/<int:playlist_id>/", views.playlist_detail, name="playlist_detail"),
    path("playlist/<int:playlist_id>/edit/", views.edit_playlist, name="edit_playlist"),
    path("playlist/<int:playlist_id>/delete/", views.delete_playlist, name="delete_playlist"),
    path("api/update_progress/", views.update_progress, name="update_progress"),
]