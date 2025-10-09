import re
from playwright.sync_api import Page, expect, sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Login
    page.goto("http://127.0.0.1:8000/accounts/login/")
    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Password").fill("testpassword")
    page.get_by_role("button", name="login").click()
    expect(page.get_by_role("heading", name="Your Tracks")).to_be_visible()

    # Screenshot of the track list with new filters
    page.screenshot(path="jules-scratch/verification/01_track_list_filters.png")

    # Navigate to profile and change theme
    page.get_by_role("link", name="Profile").click()
    expect(page.get_by_role("heading", name="Profile")).to_be_visible()
    theme_select = page.get_by_label("Choose a color theme:")
    theme_select.select_option("dark-blue")

    # Screenshot of the profile page with theme selector
    page.screenshot(path="jules-scratch/verification/02_profile_theme_selector.png")

    # Go back to track list to see theme applied
    page.get_by_role("link", name="ListenerLibrary").click()
    expect(page.get_by_role("heading", name="Your Tracks")).to_be_visible()

    # Screenshot of the track list with the new theme
    page.screenshot(path="jules-scratch/verification/03_track_list_dark_blue_theme.png")

    # Screenshot of the mobile player view
    page.set_viewport_size({"width": 375, "height": 667})
    page.screenshot(path="jules-scratch/verification/04_mobile_player_view.png")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)