import re
import time
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # --- 1. Registration ---
        # Create a unique username for this test run
        timestamp = int(time.time())
        username = f"testuser_{timestamp}"
        password = "password123"

        # Go to registration page
        page.goto("http://127.0.0.1:8000/register/")

        # Fill out and submit the registration form
        page.get_by_label("Username").fill(username)
        page.get_by_label("Password", exact=True).fill(password)
        page.get_by_label("Password confirmation").fill(password)
        page.get_by_role("button", name="Sign Up").click()

        # Wait for navigation to the track list page and for the user dropdown to be ready
        expect(page).to_have_url(re.compile("http://127.0.0.1:8000/?"))
        user_dropdown = page.get_by_role("link", name=username)
        expect(user_dropdown).to_be_visible()
        print("Registration successful.")

        # --- 2. Open Sleep Timer Modal ---
        # Open the user dropdown
        user_dropdown.click()

        # Click the "Sleep Timer" link
        page.get_by_role("link", name="Sleep Timer").click()

        # Wait for the modal to appear and take a screenshot
        sleep_timer_modal = page.locator("#sleep-timer-modal")
        expect(sleep_timer_modal).to_be_visible()
        page.screenshot(path="jules-scratch/verification/01_modal_initial_state.png")
        print("Screenshot 1: Initial modal state captured.")

        # --- 3. Start Timer ---
        # Set timer to 1 minute and start
        page.locator("#sleep-timer-minutes").fill("1")
        page.locator("#start-sleep-timer").click()

        # Verify the timer is active in the navbar and modal
        nav_timer_display = page.locator("#sleep-timer-display")
        expect(nav_timer_display).to_be_visible()
        expect(nav_timer_display).to_contain_text("0:59")
        expect(sleep_timer_modal.locator("#active-timer-view")).to_be_visible()
        page.screenshot(path="jules-scratch/verification/02_timer_active.png")
        print("Screenshot 2: Active timer state captured.")

        # --- 4. Pause Timer ---
        pause_button = page.locator("#pause-resume-sleep-timer")
        expect(pause_button).to_have_text("Pause")
        pause_button.click()

        # Verify the timer is paused
        expect(nav_timer_display).to_have_class(re.compile(r"\btimer-paused\b"))
        expect(pause_button).to_have_text("Resume")
        page.screenshot(path="jules-scratch/verification/03_timer_paused.png")
        print("Screenshot 3: Paused timer state captured.")

        # --- 5. Resume Timer ---
        pause_button.click()

        # Verify the timer is resumed
        expect(nav_timer_display).not_to_have_class(re.compile(r"\btimer-paused\b"))
        expect(pause_button).to_have_text("Pause")

        # --- 6. Cancel Timer ---
        page.locator("#cancel-sleep-timer").click()

        # Verify the timer is cancelled and modal is hidden
        expect(nav_timer_display).to_be_hidden()
        expect(sleep_timer_modal).to_be_hidden()
        page.screenshot(path="jules-scratch/verification/04_timer_cancelled.png")
        print("Screenshot 4: Cancelled timer state captured.")

        # --- 7. Clickable Navbar Display ---
        # Start a new timer to make the navbar display visible again
        page.get_by_role("link", name=username).click()
        page.get_by_role("link", name="Sleep Timer").click()
        page.locator("#sleep-timer-minutes").fill("1")
        page.locator("#start-sleep-timer").click()
        expect(nav_timer_display).to_be_visible()

        # Hide the modal by pressing Escape
        page.keyboard.press("Escape")
        expect(sleep_timer_modal).to_be_hidden()

        # Click the navbar display to re-open the modal
        nav_timer_display.click()
        expect(sleep_timer_modal).to_be_visible()
        page.screenshot(path="jules-scratch/verification/05_navbar_click.png")
        print("Screenshot 5: Navbar click functionality verified.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)