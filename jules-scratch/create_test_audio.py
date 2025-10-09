from pydub import AudioSegment

# Create a 10-second silent audio segment
duration = 10000  # milliseconds
silence = AudioSegment.silent(duration=duration)

# Export the segment to a file
silence.export("test_podcast.mp3", format="mp3")
print("Created test_podcast.mp3")