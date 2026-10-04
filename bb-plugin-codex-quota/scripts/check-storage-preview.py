"""Owned localhost-only combined UI preview. No installed host, user profile or network."""
import os
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

base = "http://127.0.0.1:38716/"
assert urlopen(base).status == 200
out = Path("/tmp/bbp16-storage-evidence")
cases = [(state, None, "stopped") for state in ["healthy", "maintenance", "recovered", "unavailable", "incompatible"]]
cases += [("maintenance", phase, "stopped") for phase in ["required", "awaiting-confirmation", "ingesting", "retaining", "complete", "blocked"]]
cases += [("healthy", None, state) for state in ["configured", "completed", "canceled"]]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("BBP23_CHROMIUM"))
    for width, height in [(1280, 1100), (375, 812)]:
        for state, legacy, imports in cases:
            page = browser.new_page(viewport={"width": width, "height": height})
            page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base + f"?state={state}&legacy={legacy or ''}&job={imports}", wait_until="networkidle")
            page.get_by_text("History not configured on this host.", exact=True).wait_for()
            assert page.locator("body").get_attribute("data-collector-actions") is None
            privacy = page.get_by_text("Collection and privacy", exact=True)
            privacy.focus(); page.keyboard.press("Enter")
            page.get_by_role("button", name="Install collector").click()
            if state not in ["unavailable", "incompatible"]:
                health = page.get_by_text("Storage health and retention", exact=True)
                health.focus(); page.keyboard.press("Enter")
                if legacy:
                    page.get_by_text(f"Legacy retirement: {legacy}.", exact=False).wait_for()
                if legacy == "awaiting-confirmation":
                    assert page.get_by_role("button", name="Retire stopped legacy logs").is_disabled()
            import_details = page.get_by_text("Historical import", exact=True)
            import_details.focus(); page.keyboard.press("Enter")
            page.wait_for_function("document.querySelector('[aria-label=\"BB Pi source root\"]').value.includes('synthetic')")
            assert page.get_by_role("button", name="Save import sources").is_disabled() == (imports == "stopped")
            assert page.get_by_label("BB Pi source root", exact=True).is_disabled() == (imports == "stopped")
            if imports == "stopped":
                resume = page.get_by_role("button", name="Resume import")
                assert resume.is_enabled(); resume.focus()
                assert resume.evaluate("e => e === document.activeElement")
                assert page.get_by_role("button", name="Cancel import").is_enabled()
            if state not in ["unavailable", "incompatible"]:
                page.get_by_role("button", name="Open thread thr_synthetic").click()
                assert page.locator("body").get_attribute("data-opened-thread") == "thr_synthetic"
            assert page.get_by_text("42% remaining", exact=True).is_visible()
            official = page.get_by_role("link", name="Open Codex Usage ↗")
            official.focus(); assert official.evaluate("e => e === document.activeElement")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(out / f"combined-{width}-{state}-{legacy or 'none'}-{imports}.png"), full_page=True)
            assert not errors, errors
            page.close()
    browser.close()
print("28 desktop/375px combined states passed: storage, recovery, legacy, frozen/completed/canceled import, keyboard, thread navigation, quota and official link. Synthetic only.")
