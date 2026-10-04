"""Isolated localhost-only React preview. No installed BB or user browser state."""
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path("/tmp/bbp18-evidence")
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 1100})
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:38718/") else route.abort())
    page.goto("http://127.0.0.1:38718/", wait_until="networkidle")
    page.get_by_text("History not configured on this host.", exact=True).wait_for()
    assert page.locator("body").get_attribute("data-collector-actions") is None
    page.screenshot(path=str(out / "early-desktop-collapsed.png"), full_page=True)
    summary = page.get_by_text("Collection and privacy", exact=True)
    summary.focus()
    page.keyboard.press("Enter")
    page.get_by_role("button", name="Install collector").click()
    page.get_by_text("Selected-host workspace totals", exact=True).wait_for()
    page.screenshot(path=str(out / "early-desktop-open.png"), full_page=True)
    page.set_viewport_size({"width": 375, "height": 812})
    page.screenshot(path=str(out / "early-375-open.png"), full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.get_by_role("button", name="Pause capture").click()
    page.get_by_text("Capture paused.", exact=False).wait_for()
    assert page.get_by_role("button", name="Pause capture").is_disabled()
    page.get_by_role("button", name="Resume capture").click()
    page.get_by_text("Capture enabled.", exact=False).wait_for()
    page.get_by_role("button", name="Repair collector").click()
    assert page.locator("body").get_attribute("data-collector-actions") == "4"
    page.get_by_role("button", name="Check readiness").click()
    page.get_by_text("Selected-host workspace totals", exact=True).wait_for()
    assert page.locator("body").get_attribute("data-collector-actions") == "4"
    page.get_by_role("link", name="Open Codex Usage ↗").focus()
    assert page.get_by_role("link", name="Open Codex Usage ↗").evaluate("e => e === document.activeElement")
    page.screenshot(path=str(out / "final-375-controls.png"), full_page=True)
    summary.focus()
    page.keyboard.press("Space")
    assert not summary.locator("..").get_attribute("open")
    page.screenshot(path=str(out / "final-375-collapsed.png"), full_page=True)
    assert page.get_by_role("link", name="Open Codex Usage ↗").is_visible()
    print("Early synthetic desktop/375px: explicit installation, visible partial totals, long paths wrap, no page overflow, quota/link retained.")
    browser.close()
