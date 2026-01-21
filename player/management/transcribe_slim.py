import sys
import os
import warnings

# Suppress warnings from Whisper and its dependencies
warnings.filterwarnings("ignore")

def format_timestamp(seconds):
    """Converts seconds to SRT timestamp format (HH:MM:SS,mmm)"""
    milliseconds = int((seconds % 1) * 1000)
    seconds = int(seconds)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

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
    except ImportError:
        print("Error: 'openai-whisper' package is not installed.")
        sys.exit(1)

    try:
        # Load model (tiny for speed/efficiency/low memory)
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

        # Convert segments to SRT and write to file
        with open(output_srt_path, 'w', encoding='utf-8') as f:
            for i, segment in enumerate(result["segments"]):
                start = format_timestamp(segment["start"])
                end = format_timestamp(segment["end"])
                text = segment["text"].strip()
                f.write(f"{i+1}\n{start} --> {end}\n{text}\n\n")

        print(f"Successfully transcribed to {output_srt_path}")

    except Exception as e:
        print(f"Error during transcription: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
