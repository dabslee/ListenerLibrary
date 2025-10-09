from django.urls import path
from . import views

urlpatterns = [
    path('', views.track_list, name='track_list'),
    path('profile/', views.profile, name='profile'),
    path('register/', views.register, name='register'),
    path('upload/', views.upload_track, name='upload_track'),
    path('track/<int:track_id>/delete/', views.delete_track, name='delete_track'),
    path('track/<int:track_id>/edit/', views.edit_track, name='edit_track'),
    path('track/<int:track_id>/download/', views.download_track, name='download_track'),
    path('track/<int:track_id>/stream/', views.stream_track, name='stream_track'),
]