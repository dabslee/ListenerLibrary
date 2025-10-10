import time
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # --- 1. Registration ---
        timestamp = int(time.time())
        username = f"testuser_{timestamp}"
        password = "ValidPassword123!"

        page.goto("http://127.0.0.1:8000/register/")
        page.get_by_label("Username").fill(username)
        page.get_by_label("Password", exact=True).fill(password)
        page.get_by_label("Password confirmation").fill(password)
        page.get_by_role("button", name="Sign Up").click()

        # Wait for the redirect to complete, which should be the track list page
        expect(page).to_have_url("http://127.0.0.1:8000/")
        print(f"Successfully registered user: {username}")

        # Save username for the next script
        with open("jules-scratch/verification/test_username.txt", "w") as f:
            f.write(username)

    except Exception as e:
        print(f"An error occurred during registration: {e}")
        page.screenshot(path="jules-scratch/verification/error_registration.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)