from django import forms
from .models import Track, Playlist, Bookmark

class PlaylistForm(forms.ModelForm):
    class Meta:
        model = Playlist
        fields = ['name', 'image']

class BookmarkForm(forms.ModelForm):
    class Meta:
        model = Bookmark
        fields = ['name']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
        }

class TrackForm(forms.ModelForm):
    class Meta:
        model = Track
        fields = ['name', 'artist', 'type', 'file', 'icon']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'artist': forms.TextInput(attrs={'class': 'form-control'}),
            'type': forms.Select(attrs={'class': 'form-select'}),
            'file': forms.FileInput(attrs={'class': 'form-control'}),
            'icon': forms.FileInput(attrs={'class': 'form-control'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # If the form is being used to edit an existing track instance,
        # make the file and icon fields not required.
        if self.instance and self.instance.pk:
            self.fields['file'].required = False
            self.fields['icon'].required = False