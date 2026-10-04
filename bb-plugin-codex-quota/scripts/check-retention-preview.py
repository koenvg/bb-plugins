"""Local synthetic React matrix. No user profile, installed host or remote network."""
import os
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

base = "http://127.0.0.1:38723/"
assert urlopen(base).status == 200
out = Path("/tmp/bbp23-evidence")
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("BBP23_CHROMIUM"))
    count = 0
    for width, height in [(1280, 1100), (375, 812)]:
        for state in ["healthy", "maintenance", "recovered", "unavailable", "incompatible"]:
            page = browser.new_page(viewport={"width": width, "height": height})
            page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base + "?state=" + state, wait_until="networkidle")
            page.get_by_text("History not configured on this host.", exact=True).wait_for()
            assert page.locator("body").get_attribute("data-collector-actions") is None
            privacy = page.get_by_text("Collection and privacy", exact=True)
            privacy.focus()
            page.keyboard.press("Enter")
            page.get_by_role("button", name="Install collector").click()
            if state in ["healthy", "maintenance", "recovered"]:
                health = page.get_by_text("Storage health and retention", exact=True)
                health.wait_for()
                assert health.locator("..").get_attribute("open") is None
                health.focus()
                page.keyboard.press("Enter")
                page.get_by_text("Storage health: " + state + ".", exact=False).wait_for()
                page.get_by_text("Older token classes are unavailable, not zero.", exact=False).wait_for()
                if state == "recovered":
                    page.get_by_text("Recovery gap:", exact=False).wait_for()
                page.get_by_role("button", name="Pause capture").click()
                page.get_by_text("Capture paused.", exact=False).wait_for()
                assert page.get_by_role("button", name="Pause capture").is_disabled()
                page.get_by_role("button", name="Resume capture").click()
                page.get_by_text("Capture enabled.", exact=False).wait_for()
            else:
                message = "History storage is incompatible." if state == "incompatible" else "History storage is unavailable on this host."
                page.get_by_text(message, exact=False).wait_for()
            page.get_by_role("button", name="Check readiness").click()
            assert page.locator("body").get_attribute("data-collector-actions") in ["1", "3"]
            assert page.get_by_text("42% remaining", exact=True).is_visible()
            official = page.get_by_role("link", name="Open Codex Usage ↗")
            official.focus()
            assert official.evaluate("e => e === document.activeElement")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(out / f"matrix-{width}-{state}.png"), full_page=True)
            privacy.focus()
            page.keyboard.press("Space")
            assert privacy.locator("..").get_attribute("open") is None
            assert not errors, errors
            page.close()
            count += 1
    browser.close()
print(f"Synthetic retention UI: {count} desktop/375px states passed. Keyboard controls, pause/resume, health, gaps, no overflow or browser errors, quota/link preserved. No installed acceptance.")
