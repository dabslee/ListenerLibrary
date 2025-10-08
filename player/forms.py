import logging
from django import forms
from .models import Track
from mutagen.mp3 import MP3
from mutagen.wave import WAVE
from mutagen.flac import FLAC
from mutagen.mp4 import MP4

logger = logging.getLogger(__name__)

class TrackForm(forms.ModelForm):
    class Meta:
        model = Track
        fields = ['name', 'artist', 'type', 'file', 'icon', 'duration']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'artist': forms.TextInput(attrs={'class': 'form-control'}),
            'type': forms.Select(attrs={'class': 'form-select'}),
            'file': forms.FileInput(attrs={'class': 'form-control'}),
            'icon': forms.FileInput(attrs={'class': 'form-control'}),
            'duration': forms.HiddenInput(),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields['file'].required = False
            self.fields['icon'].required = False
        self.fields['duration'].required = False

    def clean(self):
        cleaned_data = super().clean()
        file = cleaned_data.get("file")
        if file:
            try:
                # It's important to rewind the file-like object before passing it to mutagen
                file.seek(0)
                audio = None
                if file.name.endswith('.mp3'):
                    audio = MP3(file)
                elif file.name.endswith('.wav'):
                    audio = WAVE(file)
                elif file.name.endswith('.flac'):
                    audio = FLAC(file)
                elif file.name.endswith('.m4a') or file.name.endswith('.mp4'):
                    audio = MP4(file)

                if audio:
                    cleaned_data['duration'] = audio.info.length
                    logger.info(f"Successfully extracted duration for {file.name}: {audio.info.length}")
                else:
                    logger.warning(f"Unsupported audio format for {file.name}")
                    pass
            except Exception as e:
                logger.error(f"Could not read audio duration for {file.name}. Error: {e}", exc_info=True)
                pass
            finally:
                # Rewind the file again so Django can save it correctly
                file.seek(0)
        return cleaned_data