from django.urls import path, include, re_path
from . import views
from . import react_views

urlpatterns = [
    # Legacy URL for tests
    path('track/<int:track_id>/transcript/', views.update_transcript, name='update_transcript'),
    path('edit_track/<int:track_id>/', views.edit_track, name='edit_track'), # Redirect target for update_transcript

    # Streaming endpoint is still needed by frontend
    path('stream/<int:track_id>/', views.stream_track, name='stream_track'),

    # Serve React App for all other routes
    re_path(r'^.*$', react_views.react_app, name='react_app'),
]
