from django.core.management.base import BaseCommand
from player.models import Track
from mutagen import File as MutagenFile
from pydub import AudioSegment
import os
import subprocess
import time

class Command(BaseCommand):
    help = 'Fixes zero duration for tracks that have a valid file size'

    def handle(self, *args, **options):
        self.stdout.write("Starting track duration fixer...")

        while True:
            track = Track.objects.filter(duration=0, file_size__gt=0).first()
            if not track:
                time.sleep(5)
                continue

            self.process_track(track)

    def process_track(self, track):
        try:
            if not track.file:
                self.stdout.write(self.style.WARNING(f'Track {track.id} has no file associated.'))
                return

            file_path = track.file.path
            # Ensure the file exists on disk
            if not os.path.exists(file_path):
                self.stdout.write(self.style.WARNING(f'File for track {track.id} not found at {file_path}.'))
                return

            duration = 0

            # Try Mutagen with path
            try:
                audio = MutagenFile(file_path)
                if audio and audio.info.length:
                    duration = audio.info.length
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'Mutagen failed on path for track {track.id}: {e}'))

            # Try Mutagen with file object if path failed
            if not duration:
                try:
                    with open(file_path, 'rb') as f:
                        audio = MutagenFile(f)
                        if audio and audio.info.length:
                            duration = audio.info.length
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Mutagen failed on file object for track {track.id}: {e}'))

            # Try ffprobe as a fast fallback before pydub
            if not duration:
                try:
                    result = subprocess.check_output(
                        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
                        stderr=subprocess.STDOUT
                    )
                    duration = float(result.decode().strip())
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'FFprobe failed for track {track.id}: {e}'))

            # Try Pydub as last resort
            if not duration:
                try:
                    audio = AudioSegment.from_file(file_path)
                    duration = len(audio) / 1000.0
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Pydub failed for track {track.id}: {e}'))

            if duration > 0:
                track.duration = duration
                track.save()
                self.stdout.write(self.style.SUCCESS(f'Updated duration for track {track.id}: {track.duration}s'))
            else:
                self.stdout.write(self.style.WARNING(f'Could not determine duration for track {track.id} (path: {file_path})'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error processing track {track.id}: {str(e)}'))
