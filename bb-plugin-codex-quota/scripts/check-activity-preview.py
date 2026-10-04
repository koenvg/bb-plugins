"""Check only the isolated synthetic preview at localhost. Requires Playwright Chromium."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(os.environ.get("ACTIVITY_EVIDENCE_DIR", "/tmp/bbp24-evidence"))
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 1100})
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:38724/") else route.abort())
    page.goto("http://127.0.0.1:38724/", wait_until="networkidle")
    summary = page.locator("summary", has_text="Account details and activity")
    assert not summary.locator("..").get_attribute("open")
    page.get_by_text("History not configured on this host.", exact=True).wait_for()
    assert page.locator("body").get_attribute("data-activity-calls") is None
    page.screenshot(path=str(out / "early-desktop-collapsed.png"), full_page=True)
    summary.focus()
    page.keyboard.press("Enter")
    page.get_by_text("Lifetime tokens", exact=True).wait_for()
    assert page.locator("body").get_attribute("data-activity-calls") == "1"
    page.screenshot(path=str(out / "early-desktop-open.png"), full_page=True)
    page.set_viewport_size({"width": 375, "height": 812})
    page.screenshot(path=str(out / "early-375-open.png"), full_page=True)
    metrics = page.evaluate("""() => ({width: innerWidth, pageWidth: document.documentElement.scrollWidth,
      tableWidth: document.querySelector('[role=region]').clientWidth,
      tableScrollWidth: document.querySelector('[role=region]').scrollWidth})""")
    assert metrics["pageWidth"] == 375, metrics
    (out / "early-layout.json").write_text(json.dumps(metrics, indent=2) + "\n")
    table = page.get_by_role("region", name="Account-wide daily token table")
    table.focus()
    page.keyboard.press("ArrowDown")
    page.wait_for_function("document.querySelector('[role=region]').scrollTop > 0")
    page.get_by_role("combobox", name="Account activity period").focus()
    page.get_by_role("combobox", name="Account activity period").select_option("weekly")
    page.get_by_text("weekly activity unknown.", exact=True).wait_for()
    assert page.locator("body").get_attribute("data-activity-calls") == "1"
    summary.focus()
    page.keyboard.press("Space")
    assert not summary.locator("..").evaluate("element => element.open")
    page.wait_for_timeout(1100)
    assert page.locator("body").get_attribute("data-activity-calls") == "1"
    assert not page.get_by_text("Lifetime tokens", exact=True).is_visible()
    page.get_by_role("link", name="Open Codex Usage ↗").focus()
    assert page.get_by_role("link", name="Open Codex Usage ↗").evaluate("element => document.activeElement === element")
    page.screenshot(path=str(out / "375-keyboard-collapsed.png"), full_page=True)
    print("Synthetic desktop/375px preview rendered. Disclosure opens with Enter. Named table scrolls by keyboard. Period navigation makes no request. Space closes and stops reads. No page overflow.")
    browser.close()
