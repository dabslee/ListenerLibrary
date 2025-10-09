import re
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Log in
    page.goto("http://127.0.0.1:8000/accounts/login/")
    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Password").fill("testpassword")
    page.get_by_role("button", name="login").click()
    expect(page).to_have_url("http://127.0.0.1:8000/")

    # The JS on the upload page will autofill the name from the filename.
    track_name_from_file = "test_podcast"

    # Upload a podcast
    page.goto("http://127.0.0.1:8000/upload/")
    # The name field will be overwritten by the JS, but we fill it to be robust.
    page.get_by_label("Name").fill("This will be overwritten")
    page.get_by_label("Type").select_option("podcast")
    page.get_by_label("File").set_input_files("test_podcast.mp3")
    page.get_by_role("button", name="Upload Track").click()

    # Wait for redirection to the track list
    expect(page).to_have_url("http://127.0.0.1:8000/", timeout=10000)

    # Verify the track is in the list.
    expect(page.get_by_text(track_name_from_file).first).to_be_visible()

    # Play the track to set a position
    page.get_by_text(track_name_from_file).first.click()
    # Wait for more than 5 seconds for the updatePosition interval to fire
    page.wait_for_timeout(6000)

    # Reload the page to check for progress bar and resume
    page.reload()
    page.wait_for_load_state("domcontentloaded")

    # Verify progress bar is now visible
    track_list_item = page.get_by_text(track_name_from_file).first.locator("xpath=./ancestor::div[contains(@class, 'list-group-item')]")
    progress_bar = track_list_item.locator(".progress-bar")
    expect(progress_bar).to_be_visible()

    # Check that it resumed from a non-zero position
    current_time_element = page.locator("#current-time")
    # Wait for audio to start playing and time to update
    expect(current_time_element).not_to_have_text(re.compile(r"0:0[0-2]"), timeout=5000)

    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)