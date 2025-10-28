import re
from playwright.sync_api import sync_playwright, expect
from pydub import AudioSegment

def run(playwright):
    # Create a dummy mp3 file
    silence = AudioSegment.silent(duration=1000)
    silence.export("test.mp3", format="mp3")

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Log in
    page.goto("http://localhost:8000/accounts/login/")
    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Password").fill("testpassword")
    page.get_by_role("button", name="login").click()

    # Go to upload page and upload a track
    page.goto("http://localhost:8000/upload/")
    page.get_by_label("Name").fill("Test Track")
    page.get_by_label("Artist").fill("Test Artist")
    page.get_by_label("Type").select_option("song")
    page.get_by_label("File").set_input_files("test.mp3")
    page.get_by_role("button", name="Upload").click()
    page.screenshot(path="jules-scratch/verification/after_upload.png")
    page.wait_for_url("**/")
    page.screenshot(path="jules-scratch/verification/track_list.png")

    # Take a screenshot of the audio player
    player = page.locator("footer.fixed-bottom")
    player.screenshot(path="jules-scratch/verification/audio_player.png")

    # Test the deletion modal
    page.wait_for_selector(".track-item")
    track_item = page.locator(".track-item").first
    track_id = track_item.get_attribute("data-testid").split("-")[-1]
    page.locator(f"[data-testid=kebab-menu-{track_id}]").click()
    page.get_by_role("link", name="Delete").click()
    page.screenshot(path="jules-scratch/verification/delete_modal.png")
    page.get_by_role("button", name="Delete").click()
    page.screenshot(path="jules-scratch/verification/after_delete.png")


    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
