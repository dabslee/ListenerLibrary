import os
import sys
import time
import subprocess
import warnings
import tempfile
from django.core.management.base import BaseCommand
from django.utils import timezone
from player.models import Transcript

# Suppress warnings
warnings.filterwarnings("ignore")

class Command(BaseCommand):
    help = 'Runs the transcription worker to process pending transcripts'

    def handle(self, *args, **options):
        self.stdout.write("Starting transcription worker with slim subprocess support...")

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

        audio_path = transcript.track.file.path

        # Create a temporary file for the SRT output
        with tempfile.NamedTemporaryFile(suffix='.srt', delete=False) as tmp_srt:
            tmp_srt_path = tmp_srt.name

        try:
            # Use the slim script to avoid Django overhead in the subprocess
            slim_script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'transcribe_slim.py')

            # Start transcription as a separate subprocess
            process = subprocess.Popen(
                [sys.executable, slim_script_path, audio_path, tmp_srt_path]
            )

            cancelled = False
            while process.poll() is None:
                # Check if user cancelled in the DB
                transcript.refresh_from_db()
                if transcript.status != 'processing':
                    self.stdout.write(self.style.WARNING(f"Transcription for {transcript.track.name} was cancelled. Terminating subprocess..."))
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    cancelled = True
                    break

                time.sleep(5)

            if not cancelled:
                return_code = process.returncode
                if return_code == 0:
                    # Success: read the SRT file and update model
                    if os.path.exists(tmp_srt_path):
                        with open(tmp_srt_path, 'r', encoding='utf-8') as f:
                            srt_content = f.read()

                        transcript.content = srt_content
                        transcript.status = 'completed'
                        transcript.error_message = None
                        transcript.save()
                        self.stdout.write(self.style.SUCCESS(f"Successfully transcribed {transcript.track.name}"))
                    else:
                        raise FileNotFoundError("SRT output file not found after successful subprocess completion.")
                else:
                    # Subprocess failed
                    transcript.refresh_from_db()
                    if transcript.status == 'processing':
                        transcript.status = 'failed'
                        transcript.error_message = f"Transcription subprocess failed with return code {return_code}."
                        transcript.save()
                    self.stdout.write(self.style.ERROR(f"Error processing {transcript.track.name}: return code {return_code}"))

        except Exception as e:
            transcript.refresh_from_db()
            if transcript.status == 'processing':
                transcript.status = 'failed'
                transcript.error_message = f"Worker error: {str(e)}"
                transcript.save()
            self.stdout.write(self.style.ERROR(f"Worker exception processing {transcript.track.name}: {e}"))

        finally:
            # Clean up the temporary file
            if os.path.exists(tmp_srt_path):
                os.remove(tmp_srt_path)
