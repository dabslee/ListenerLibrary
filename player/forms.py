from django import forms
from .models import Track
import mutagen

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

    def clean_file(self):
        file = self.cleaned_data.get('file', False)
        if file:
            try:
                # Ensure the file pointer is at the beginning
                file.seek(0)
                audio = mutagen.File(file)
                if audio:
                    self.instance.duration = audio.info.length
                # VERY IMPORTANT: seek back to the beginning of the file so that
                # Django's file saving mechanism can read it from the start.
                file.seek(0)
            except Exception as e:
                # You might want to log this error
                raise forms.ValidationError("Could not read audio file metadata.")
        return file