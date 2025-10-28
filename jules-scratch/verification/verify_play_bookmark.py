
import re
from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    time.sleep(5)

    # Log in
    page.goto("http://localhost:8000/accounts/login/")
    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Password").fill("password")
    page.get_by_role("button", name="login").click()

    # Open the bookmarks modal
    page.get_by_role("button", name="testuser").click()
    page.get_by_role("link", name="Bookmarks").click()

    # Play the bookmark
    page.get_by_role("button", name="play").click()

    # Wait for the player to update
    expect(page.locator("#player-track-name")).to_have_text("Test Track")


    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/play-bookmark.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
