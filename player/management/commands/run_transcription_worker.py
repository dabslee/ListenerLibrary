from django.core.management.base import BaseCommand
from player.models import Transcript
import os
import tempfile
import warnings
import time
from django.utils import timezone

# Suppress warnings
warnings.filterwarnings("ignore")

class Command(BaseCommand):
    help = 'Runs the transcription worker to process pending transcripts'

    def handle(self, *args, **options):
        self.stdout.write("Starting transcription worker...")

        try:
            import whisper
        except ImportError:
            self.stdout.write(self.style.ERROR("The 'openai-whisper' package is not installed. Please install it to use this command."))
            return

        # Load model once
        try:
            # Using 'tiny' for efficiency/speed as requested. Can be changed to 'base' or 'small'.
            model = whisper.load_model("tiny")
            self.stdout.write("Whisper model loaded.")
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to load Whisper model: {e}"))
            self.stdout.flush()
            return
        
        self.stdout.flush()
        while True:
            pending = Transcript.objects.filter(status='pending').first()
            if not pending:
                # Sleep a bit to avoid hammering DB
                self.stdout.write("Nothing pending.")
                self.stdout.flush()
                time.sleep(5)
                continue

            self.process_transcript(pending, model)
            self.stdout.flush()

    def process_transcript(self, transcript, model):
        self.stdout.write(f"Processing transcript for {transcript.track.name}...")
        self.stdout.flush()
        transcript.status = 'processing'
        transcript.processing_started_at = timezone.now()
        transcript.save()

        try:
            # Get audio file path
            audio_path = transcript.track.file.path
            if not os.path.exists(audio_path):
                raise FileNotFoundError(f"Audio file not found: {audio_path}")

            # Transcribe
            # Note: Ideally we would align uploaded text if available (transcript.source_file)
            # but for now we re-transcribe to ensure consistent timestamped SRTs.
            result = model.transcribe(audio_path)

            # Convert segments to SRT
            srt_content = ""
            for i, segment in enumerate(result["segments"]):
                start = self.format_timestamp(segment["start"])
                end = self.format_timestamp(segment["end"])
                text = segment["text"].strip()
                srt_content += f"{i+1}\n{start} --> {end}\n{text}\n\n"

            transcript.content = srt_content
            transcript.status = 'completed'
            transcript.save()
            self.stdout.write(self.style.SUCCESS(f"Successfully transcribed {transcript.track.name}"))
            self.stdout.flush()

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error processing {transcript.track.name}: {e}"))
            self.stdout.flush()
            transcript.status = 'failed'
            transcript.error_message = str(e)
            transcript.save()

    def format_timestamp(self, seconds):
        """Converts seconds to SRT timestamp format (HH:MM:SS,mmm)"""
        milliseconds = int((seconds % 1) * 1000)
        seconds = int(seconds)
        minutes, seconds = divmod(seconds, 60)
        hours, minutes = divmod(minutes, 60)
        return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"
