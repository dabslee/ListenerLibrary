from django import forms
from .models import Track, Playlist, Profile

class TrackForm(forms.ModelForm):
    class Meta:
        model = Track
        fields = ['name', 'type', 'file', 'icon']

class PlaylistForm(forms.ModelForm):
    class Meta:
        model = Playlist
        fields = ['name', 'tracks', 'icon']
        widgets = {
            'tracks': forms.CheckboxSelectMultiple,
        }

class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ['theme_style', 'theme_mode', 'theme_color']