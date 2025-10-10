import re
import time
from playwright.sync_api import sync_playwright, expect
from pydub import AudioSegment

def _generate_silent_audio(duration_ms=30000, format="mp3"): # 30 seconds to be safe
    """Generates a silent audio segment and returns it as a file-like object."""
    silence = AudioSegment.silent(duration=duration_ms)
    file_path = f"silent_audio_long.{format}"
    silence.export(file_path, format=format)
    return file_path

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # 1. Register a new user
    page.goto("http://127.0.0.1:8000/register/")
    username = f"podcast_fix_tester_{int(time.time())}"
    password = "testpassword123"
    page.get_by_label("Username").fill(username)
    page.get_by_label("Password", exact=True).fill(password)
    page.get_by_label("Password confirmation").fill(password)
    page.get_by_role("button", name="Sign Up").click()
    expect(page).to_have_url(re.compile(r".*/$"), timeout=10000)

    # 2. Upload two podcast tracks
    audio_file_path = _generate_silent_audio()
    for i in range(2):
        page.goto("http://127.0.0.1:8000/upload/")
        expect(page.get_by_role("heading", name="Upload a New Track")).to_be_visible()
        page.locator("#id_name").fill(f"Podcast Fix {i+1}")
        page.locator("#id_artist").fill("Podcast Host")
        page.locator("#id_type").select_option("podcast")
        page.locator("#id_file").set_input_files(audio_file_path)
        page.get_by_role("button", name="Upload Track").click()
        expect(page.get_by_text(f"Podcast Fix {i+1}")).to_be_visible()

    # 3. Play the first podcast to establish progress
    page.get_by_text("Podcast Fix 1").click()
    # Let it play for a few seconds to record progress
    page.wait_for_timeout(5000)
    # Get the current time from the player
    current_time_str = page.locator("#current-time").inner_text()
    print(f"Initial play time for Podcast 1: {current_time_str}")

    # 4. Create a playlist and add both podcasts
    playlist_name = "My Podcast Fix Playlist"
    page.goto("http://127.0.0.1:8000/playlists/create/")
    page.locator("#id_name").fill(playlist_name)
    page.get_by_role("button", name="Create Playlist").click()
    expect(page.get_by_text(playlist_name)).to_be_visible()

    page.goto("http://127.0.0.1:8000/")
    for i in range(2):
        track_item = page.locator(".track-item", has_text=f"Podcast Fix {i+1}")
        track_item.get_by_title("Add to Playlist").click()
        page.get_by_role("link", name=re.compile(playlist_name)).click()
        expect(page.get_by_text(f"Added Podcast Fix {i+1} to {playlist_name}")).to_be_visible(timeout=5000)

    # 5. Go to the playlist and play the *second* podcast
    page.goto("http://127.0.0.1:8000/playlists/")
    page.get_by_role("link", name=playlist_name).click()
    expect(page).to_have_url(re.compile(r".*/playlists/\d+/"))
    # Click on the second podcast in the list
    page.get_by_text("Podcast Fix 2").click()
    expect(page.locator("#player-track-name")).to_have_text("Podcast Fix 2", timeout=10000)
    page.wait_for_timeout(2000) # Let it play briefly

    # 6. Now, click the "previous" button to go back to the first podcast
    page.locator("#prev-track-btn").click()
    expect(page.locator("#player-track-name")).to_have_text("Podcast Fix 1", timeout=10000)

    # 7. Verify that it resumes from the saved position (around 5s), not 0
    page.wait_for_timeout(1000) # Give it a moment to stabilize

    resumed_time_str = page.locator("#current-time").inner_text()
    print(f"Resumed play time for Podcast 1: {resumed_time_str}")

    # Convert "0:05" to seconds
    minutes, seconds = map(int, resumed_time_str.split(':'))
    resumed_seconds = minutes * 60 + seconds

    # Assert that the resumed time is greater than 3 seconds (allowing for some timing variance)
    assert resumed_seconds > 3, f"Expected resumed time to be > 3, but it was {resumed_seconds}"

    page.screenshot(path="jules-scratch/verification/podcast_resume_fix_verification.png")

    print("Podcast resume fix verification successful!")

    browser.close()

with sync_playwright() as p:
    run(p)