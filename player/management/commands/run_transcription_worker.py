import os
import sys
import time
import subprocess
import warnings
from django.core.management.base import BaseCommand
from django.utils import timezone
from player.models import Transcript

# Suppress warnings
warnings.filterwarnings("ignore")

class Command(BaseCommand):
    help = 'Runs the transcription worker to process pending transcripts'

    def handle(self, *args, **options):
        self.stdout.write("Starting transcription worker with subprocess support...")

        while True:
            # Re-fetch to avoid stale objects
            pending = Transcript.objects.filter(status='pending').first()
            if not pending:
                time.sleep(5)
                continue

            self.process_transcript(pending)
            self.stdout.flush()

    def process_transcript(self, transcript):
        self.stdout.write(f"Processing transcript for {transcript.track.name}...")
        transcript.status = 'processing'
        transcript.processing_started_at = timezone.now()
        transcript.save()

        track_id = transcript.track.id

        # Start transcription as a separate subprocess
        # This avoids issues with sharing DB connections or PyTorch state.
        # We let stdout/stderr flow to the parent's streams so they are captured in the log.
        process = subprocess.Popen(
            [sys.executable, 'manage.py', 'transcribe_track', str(track_id)]
        )

        cancelled = False
        while process.poll() is None:
            # Check if user cancelled in the DB
            transcript.refresh_from_db()
            if transcript.status != 'processing':
                self.stdout.write(self.style.WARNING(f"Transcription for {transcript.track.name} was cancelled. Terminating subprocess..."))
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                cancelled = True
                break

            time.sleep(5)

        if not cancelled:
            return_code = process.returncode
            if return_code == 0:
                self.stdout.write(self.style.SUCCESS(f"Successfully transcribed {transcript.track.name}"))
            else:
                # Subprocess failed. The transcribe_track command should have updated the status and error_message.
                # We just log it here.
                transcript.refresh_from_db()
                if transcript.status == 'processing':
                    transcript.status = 'failed'
                    transcript.error_message = f"Transcription subprocess failed with return code {return_code}."
                    transcript.save()
                self.stdout.write(self.style.ERROR(f"Error processing {transcript.track.name}: return code {return_code}"))
