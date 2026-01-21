import sys
import os
import warnings
import subprocess
import tempfile
import math

# Suppress warnings from Whisper and its dependencies
warnings.filterwarnings("ignore")

try:
    import torch
except ImportError:
    torch = None

def format_timestamp(seconds):
    """Converts seconds to SRT timestamp format (HH:MM:SS,mmm)"""
    milliseconds = int((seconds % 1) * 1000)
    seconds = int(seconds)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

def get_duration(audio_path):
    """Uses ffprobe to get the duration of the audio file in seconds."""
    cmd = [
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', audio_path
    ]
    try:
        output = subprocess.check_output(cmd).decode('utf-8').strip()
        return float(output)
    except Exception as e:
        print(f"Error getting duration: {e}")
        return None

def transcribe_chunk(model, audio_chunk_path, offset_seconds):
    """Transcribes a single audio chunk and returns segments with offset timestamps."""
    # Transcribe with optimized parameters
    # fp16=False is safer for CPU
    # condition_on_previous_text=False prevents repetition loops on long tracks
    # temperature fallback helps break out of failure loops
    result = model.transcribe(
        audio_chunk_path,
        fp16=False,
        condition_on_previous_text=False,
        temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
    )

    segments = []
    for segment in result["segments"]:
        segments.append({
            "start": segment["start"] + offset_seconds,
            "end": segment["end"] + offset_seconds,
            "text": segment["text"].strip()
        })
    return segments

def main():
    if len(sys.argv) < 3:
        print("Usage: transcribe_slim.py <audio_path> <output_srt_path>")
        sys.exit(1)

    audio_path = sys.argv[1]
    output_srt_path = sys.argv[2]

    if not os.path.exists(audio_path):
        print(f"Error: Audio file not found at {audio_path}")
        sys.exit(1)

    try:
        import whisper
        if torch:
            # Limit torch to single thread to save resources and prevent OOM
            torch.set_num_threads(1)
    except ImportError:
        print("Error: Required package (openai-whisper) is not installed.")
        sys.exit(1)

    duration = get_duration(audio_path)
    if duration is None:
        print("Error: Could not determine audio duration.")
        sys.exit(1)

    try:
        # Load model (tiny for speed/efficiency/low memory)
        model = whisper.load_model("tiny")

        all_segments = []
        chunk_length = 1200  # 20 minutes in seconds

        if duration <= chunk_length + 60: # Extra 60s buffer to avoid splitting very short overflows
            # Process as a single file if it's short enough
            all_segments = transcribe_chunk(model, audio_path, 0)
        else:
            # Process in chunks to save memory
            num_chunks = math.ceil(duration / chunk_length)
            print(f"Processing in {num_chunks} chunks...")

            for i in range(num_chunks):
                start_time = i * chunk_length
                print(f"  Chunk {i+1}/{num_chunks} (starting at {start_time}s)...")

                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_chunk:
                    tmp_chunk_path = tmp_chunk.name

                try:
                    # Extract 20-minute chunk using ffmpeg, resampled to 16k mono
                    extract_cmd = [
                        'ffmpeg', '-y', '-ss', str(start_time), '-t', str(chunk_length),
                        '-i', audio_path, '-ar', '16000', '-ac', '1', tmp_chunk_path
                    ]
                    subprocess.check_call(extract_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                    # Transcribe this chunk
                    chunk_segments = transcribe_chunk(model, tmp_chunk_path, start_time)
                    all_segments.extend(chunk_segments)

                finally:
                    if os.path.exists(tmp_chunk_path):
                        os.remove(tmp_chunk_path)

        # Convert all collected segments to SRT and write to file
        with open(output_srt_path, 'w', encoding='utf-8') as f:
            for i, segment in enumerate(all_segments):
                start = format_timestamp(segment["start"])
                end = format_timestamp(segment["end"])
                text = segment["text"]
                f.write(f"{i+1}\n{start} --> {end}\n{text}\n\n")

        print(f"Successfully transcribed to {output_srt_path}")

    except Exception as e:
        print(f"Error during transcription: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if torch:
        with torch.no_grad():
            main()
    else:
        main()
