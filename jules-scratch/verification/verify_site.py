from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Log in
    page.goto("http://127.0.0.1:8000/accounts/login/")
    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Password").fill("testpassword")
    page.get_by_role("button", name="Login").click()

    # Wait for the main page to load and take initial screenshot
    expect(page).to_have_url("http://127.0.0.1:8000/profile/")
    page.goto("http://127.0.0.1:8000/")
    expect(page.get_by_role("heading", name="Your Library")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/01_initial_view.png")

    # Navigate to profile and change theme
    page.get_by_role("link", name="Profile").click()
    expect(page.get_by_role("heading", name="Theme Settings")).to_be_visible()

    page.get_by_label("Theme style").select_option("glossy")
    page.get_by_label("Theme mode").select_option("dark")
    page.get_by_label("Theme color").select_option("purple")

    page.get_by_role("button", name="Save Settings").click()
    expect(page.get_by_role("heading", name="Theme Settings")).to_be_visible() # Wait for page reload

    # Go back to the library and verify theme change
    page.goto("http://127.0.0.1:8000/")
    expect(page.get_by_role("heading", name="Your Library")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/02_themed_view.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)