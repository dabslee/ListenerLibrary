from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Capture and print console messages from the browser
    page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))

    # Increase the default timeout
    page.set_default_timeout(15000)

    try:
        # 1. Register and log in
        print("Navigating to registration page...")
        page.goto("http://127.0.0.1:8000/register/")

        username = f"testuser_{int(time.time())}"
        password = "testpassword"

        print(f"Registering user: {username}...")
        page.get_by_label("Username").fill(username)
        page.get_by_label("Password", exact=True).fill(password)
        page.get_by_label("Password confirmation").fill(password)
        page.get_by_role("button", name="Sign Up").click()

        expect(page.get_by_role("heading", name="Your Tracks")).to_be_visible()
        print("Registration successful.")

        # 2. Upload a track
        print("Navigating to upload page...")
        page.goto("http://127.0.0.1:8000/upload/")

        track_content = b"0" * (1024 * 200) # 200KB dummy file
        page.get_by_label("File").set_input_files(
            files=[{"name": "long_song.mp3", "mimeType": "audio/mpeg", "buffer": track_content}]
        )
        page.get_by_label("Type").select_option("song")
        page.get_by_role("button", name="Upload Track").click()

        expected_track_name = "long_song"
        expect(page.get_by_role("heading", name=expected_track_name)).to_be_visible()
        print("Track uploaded successfully.")

        # 3. Play the track
        print("Playing track...")
        track_item_container = page.locator(".list-group-item").filter(has=page.get_by_role("heading", name=expected_track_name))
        track_item_container.locator("div[onclick]").click()

        # Wait a moment for the play promise to resolve
        time.sleep(1)

        # If autoplay fails, the browser will likely block it.
        # The new JS code should handle this and update the UI. Let's try clicking the main play button.
        print("Attempting to click main play button if needed...")
        page.locator("#play-pause-btn").click()

        # Now, wait for playback to actually start
        page.wait_for_function("document.getElementById('audio-player').currentTime > 0")
        print("Playback started successfully.")

        # Let it play for a couple of seconds
        time.sleep(2)
        initial_time = page.evaluate("() => document.getElementById('audio-player').currentTime")
        print(f"Initial playback time: {initial_time}")
        expect(initial_time).to_be_greater_than(1)

        # 4. Click the skip forward button
        print("Clicking skip forward button...")
        page.locator("#skip-forward-btn").click()

        # 5. Verify that the time has increased
        print("Verifying new playback time...")
        time.sleep(1)

        final_time = page.evaluate("() => document.getElementById('audio-player').currentTime")
        print(f"Final playback time: {final_time}")

        expect(final_time).to_be_greater_than(initial_time + 10)
        print("Seeking successful!")

        # 6. Take a screenshot
        screenshot_path = "jules-scratch/verification/verification.png"
        print(f"Taking screenshot at {screenshot_path}...")
        page.screenshot(path=screenshot_path)
        print("Verification script completed successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")

    finally:
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        run(p)