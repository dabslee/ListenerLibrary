from django.core.management.base import BaseCommand
from player.models import Transcript
import os
import time
import multiprocessing
import warnings
from django.utils import timezone
from django.db import connection

# Suppress warnings
warnings.filterwarnings("ignore")

def transcribe_task(audio_path, model_name, result_queue):
    """
    Function to be run in a separate process for transcription.
    """
    try:
        import whisper
        # Close Django connections in the child process to avoid issues
        connection.close()

        # Load model inside the process
        model = whisper.load_model(model_name)

        # Transcribe with optimized parameters
        # fp16=False is safer for CPU
        # condition_on_previous_text=False prevents repetition loops on long tracks
        # temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0) allows fallback
        result = model.transcribe(
            audio_path,
            fp16=False,
            condition_on_previous_text=False,
            temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
        )
        result_queue.put({"status": "success", "result": result})
    except Exception as e:
        result_queue.put({"status": "error", "message": str(e)})

class Command(BaseCommand):
    help = 'Runs the transcription worker to process pending transcripts'

    def handle(self, *args, **options):
        self.stdout.write("Starting transcription worker with cancellation support...")

        try:
            import whisper
        except ImportError:
            self.stdout.write(self.style.ERROR("The 'openai-whisper' package is not installed."))
            return

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
        if not os.path.exists(audio_path):
            transcript.status = 'failed'
            transcript.error_message = f"Audio file not found: {audio_path}"
            transcript.save()
            return

        result_queue = multiprocessing.Queue()
        process = multiprocessing.Process(
            target=transcribe_task,
            args=(audio_path, "tiny", result_queue)
        )
        process.start()

        cancelled = False
        result_data = None

        while process.is_alive():
            # Check if user cancelled in the DB
            transcript.refresh_from_db()
            if transcript.status != 'processing':
                self.stdout.write(self.style.WARNING(f"Transcription for {transcript.track.name} was cancelled. Terminating process..."))
                process.terminate()
                process.join()
                cancelled = True
                break

            # Check for result
            try:
                result_data = result_queue.get(timeout=2)
                break
            except:
                continue

        if not cancelled:
            process.join()
            if not result_data and not result_queue.empty():
                result_data = result_queue.get()

            if result_data and result_data["status"] == "success":
                result = result_data["result"]
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
            elif result_data and result_data["status"] == "error":
                transcript.status = 'failed'
                transcript.error_message = result_data["message"]
                transcript.save()
                self.stdout.write(self.style.ERROR(f"Error processing {transcript.track.name}: {result_data['message']}"))
            else:
                # Process might have been killed or crashed without result
                transcript.refresh_from_db()
                if transcript.status == 'processing':
                    transcript.status = 'failed'
                    transcript.error_message = "Transcription process terminated unexpectedly."
                    transcript.save()

    def format_timestamp(self, seconds):
        milliseconds = int((seconds % 1) * 1000)
        seconds = int(seconds)
        minutes, seconds = divmod(seconds, 60)
        hours, minutes = divmod(minutes, 60)
        return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"
