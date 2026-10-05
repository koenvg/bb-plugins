"""Check the retained stale state in the reader fixture, not installed BB."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--out", required=True)
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1100, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(args.url + "/?width=760&theme=light&refresh=error")
    page.get_by_role("article", name="Markdown preview").wait_for()
    before = page.get_by_role("article", name="Markdown preview").inner_text()
    page.get_by_role("button", name="Refresh", exact=True).click()
    page.get_by_text("Refresh failed. Showing stale snapshot.", exact=True).wait_for()
    assert page.get_by_role("article", name="Markdown preview").inner_text() == before
    page.screenshot(path=str(out / "refresh-stale-760.png"))
    page.get_by_role("button", name="Raw", exact=True).click()
    raw = page.get_by_label("Raw Markdown").inner_text()
    assert "Refresh failed. Showing stale snapshot." in page.get_by_role("alert").inner_text()
    page.get_by_role("button", name="Retry", exact=True).click()
    page.get_by_text("Refresh failed. Showing stale snapshot.", exact=True).wait_for()
    assert page.get_by_label("Raw Markdown").inner_text() == raw
    geometry = page.locator(".markdown-reader").evaluate("e => ({width:e.clientWidth, scrollWidth:e.scrollWidth})")
    assert geometry["scrollWidth"] <= geometry["width"]
    page.get_by_role("button", name="Open in BB preview", exact=True).click()
    page.get_by_text("Bound BB preview placeholder. No plugin selection occurs.", exact=True).wait_for()
    assert not errors
    (out / "refresh-results.json").write_text(json.dumps({"fixtureOnly": True, "retainedPreview": True, "staleRaw": True, "failedRetry": True, "boundOriginal": True, "geometry": geometry, "pageErrors": errors}, indent=2))
    browser.close()
print("Fixture refresh/stale/Raw/Retry/Original checks passed")
