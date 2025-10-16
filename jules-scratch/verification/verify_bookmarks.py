import re
from playwright.sync_api import sync_playwright, Page, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Create a unique username for this test run
    username = f"testuser_{int(time.time())}"

    # Register a new user
    page.goto("http://127.0.0.1:8000/register/")
    page.get_by_label("Username").fill(username)
    page.get_by_label("Password", exact=True).fill("password")
    page.get_by_label("Password confirmation").fill("password")
    page.get_by_role("button", name="Sign Up").click()
    expect(page).to_have_url("http://127.0.0.1:8000/")

    # Open the bookmarks modal
    page.get_by_role("link", name=username).click()
    page.get_by_role("link", name="Bookmarks").click()

    # Create a new bookmark
    page.get_by_label("Name").fill("My new bookmark")
    page.get_by_role("button", name="Save").click()

    # The page reloads, so we need to open the modal again
    page.get_by_role("link", name=username).click()
    page.get_by_role("link", name="Bookmarks").click()

    # Take a screenshot of the modal with the new bookmark
    expect(page.get_by_text("My new bookmark")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/bookmarks_created.png")

    # Delete the bookmark
    page.get_by_role("button", name="Delete").click()
    page.on("dialog", lambda dialog: dialog.accept())

    # Take a screenshot of the modal with the bookmark removed
    expect(page.get_by_text("My new bookmark")).not_to_be_visible()
    page.screenshot(path="jules-scratch/verification/bookmarks_deleted.png")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)