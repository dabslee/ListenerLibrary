import os
import warnings
from django.core.management.base import BaseCommand
from player.models import Track, Transcript

# Suppress warnings
warnings.filterwarnings("ignore")

class Command(BaseCommand):
    help = 'Transcribes a specific track by ID'

    def add_arguments(self, parser):
        parser.add_argument('track_id', type=int, help='The ID of the track to transcribe')

    def handle(self, *args, **options):
        track_id = options['track_id']
        try:
            track = Track.objects.get(pk=track_id)
        except Track.DoesNotExist:
            self.stderr.write(f"Track with ID {track_id} not found.")
            return

        transcript, created = Transcript.objects.get_or_create(track=track)

        try:
            import whisper
        except ImportError:
            self.update_transcript(transcript, 'failed', "The 'openai-whisper' package is not installed.")
            return

        try:
            # Get audio file path
            audio_path = track.file.path
            if not os.path.exists(audio_path):
                self.update_transcript(transcript, 'failed', f"Audio file not found: {audio_path}")
                return

            # Load model (tiny for speed/efficiency)
            model = whisper.load_model("tiny")

            # Transcribe with optimized parameters
            # fp16=False is safer for CPU
            # condition_on_previous_text=False prevents repetition loops on long tracks
            # temperature fallback helps break out of failure loops
            result = model.transcribe(
                audio_path,
                fp16=False,
                condition_on_previous_text=False,
                temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
            )

            # Convert segments to SRT
            srt_content = ""
            for i, segment in enumerate(result["segments"]):
                start = self.format_timestamp(segment["start"])
                end = self.format_timestamp(segment["end"])
                text = segment["text"].strip()
                srt_content += f"{i+1}\n{start} --> {end}\n{text}\n\n"

            transcript.content = srt_content
            self.update_transcript(transcript, 'completed', None)
            self.stdout.write(f"Successfully transcribed track {track_id}")

        except Exception as e:
            self.update_transcript(transcript, 'failed', str(e))
            self.stderr.write(f"Error transcribing track {track_id}: {e}")

    def update_transcript(self, transcript, status, error_message):
        transcript.status = status
        transcript.error_message = error_message
        transcript.save()

    def format_timestamp(self, seconds):
        """Converts seconds to SRT timestamp format (HH:MM:SS,mmm)"""
        milliseconds = int((seconds % 1) * 1000)
        seconds = int(seconds)
        minutes, seconds = divmod(seconds, 60)
        hours, minutes = divmod(minutes, 60)
        return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"
