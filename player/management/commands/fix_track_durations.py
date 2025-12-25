from django.core.management.base import BaseCommand
from player.models import Track
from mutagen import File as MutagenFile
import os

class Command(BaseCommand):
    help = 'Fixes zero duration for tracks that have a valid file size'

    def handle(self, *args, **options):
        tracks = Track.objects.filter(duration=0)

        count = 0
        for track in tracks:
            if track.file_size > 0:
                try:
                    if not track.file:
                        self.stdout.write(self.style.WARNING(f'Track {track.id} has no file associated.'))
                        continue

                    # Ensure the file exists on disk
                    if not os.path.exists(track.file.path):
                        self.stdout.write(self.style.WARNING(f'File for track {track.id} not found at {track.file.path}.'))
                        continue

                    audio = MutagenFile(track.file.path)
                    if audio and audio.info.length:
                        track.duration = audio.info.length
                        track.save()
                        count += 1
                        self.stdout.write(self.style.SUCCESS(f'Updated duration for track {track.id}: {track.duration}s'))
                    else:
                        self.stdout.write(self.style.WARNING(f'Could not determine duration for track {track.id}'))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'Error processing track {track.id}: {str(e)}'))

        self.stdout.write(self.style.SUCCESS(f'Successfully updated {count} tracks.'))
