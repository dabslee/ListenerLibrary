from django import forms
from .models import Track, Playlist, Bookmark, Transcript

class PlaylistForm(forms.ModelForm):
    class Meta:
        model = Playlist
        fields = ['name', 'image', 'tracks']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'image': forms.FileInput(attrs={'class': 'form-control'}),
            'tracks': forms.SelectMultiple(attrs={'class': 'form-control', 'size': '10'}),
        }

    def __init__(self, *args, **kwargs):
        user = kwargs.pop('user', None)
        super(PlaylistForm, self).__init__(*args, **kwargs)
        if user:
            self.fields['tracks'].queryset = Track.objects.filter(owner=user)

class PlaylistUploadForm(forms.Form):
    name = forms.CharField(max_length=255, widget=forms.TextInput(attrs={'class': 'form-control'}))
    image = forms.ImageField(required=False, widget=forms.FileInput(attrs={'class': 'form-control'}))
    default_track_icon = forms.ImageField(required=False, widget=forms.FileInput(attrs={'class': 'form-control'}))

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

class TranscriptUploadForm(forms.ModelForm):
    class Meta:
        model = Transcript
        fields = ['source_file']
        widgets = {
            'source_file': forms.FileInput(attrs={'class': 'form-control', 'accept': '.srt'}),
        }