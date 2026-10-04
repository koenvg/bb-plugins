"""Owned localhost-only React report checks. No installed BB, accounts or live sources."""
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

base = "http://127.0.0.1:38720/"
assert urlopen(base).status == 200
out = Path("/tmp/bbp20-evidence")
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(1280, 1100), (375, 812)]:
        for state in ["partial", "unknown", "inactive", "expired", "stale", "unavailable", "loading", "deleted", "huge"]:
            page = browser.new_page(viewport={"width": width, "height": height}, timezone_id="UTC")
            page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base + "?state=" + state, wait_until="networkidle")
            report = page.get_by_role("region", name="Calendar token report")
            if state not in ["unavailable", "loading"]:
                chart = page.get_by_role("group", name="Daily recorded values")
                chart.wait_for()
                assert chart.get_by_role("button").count() == 30
                day = chart.get_by_role("button").nth(14)
                day.focus()
                page.keyboard.press("Enter")
                detail = page.get_by_role("region", name="Daily detail")
                assert "2026-09-15" in detail.inner_text()
                assert "Daily denominator:" in detail.inner_text()
                classes = detail.get_by_text("Token classes and exclusions", exact=True)
                classes.focus()
                page.keyboard.press("Enter")
                assert "Timezone: UTC" in detail.inner_text()
                assert "Excluded record tokens:" in detail.inner_text()
                if state == "expired":
                    assert "Token classes unavailable" in detail.inner_text()
                if state == "unknown":
                    assert "Unknown subtotal, no records" in detail.inner_text()
                    assert "Recorded token subtotal unknown · No recorded active entities" in report.inner_text()
                    assert "Unknown, uncovered gap" in detail.inner_text()
                if state == "inactive":
                    assert "Observed inactivity" in detail.inner_text()
                if state == "stale":
                    assert "Stale report for this same range and scope" in report.inner_text()
                if state == "huge":
                    assert "9,007,199,254,740,991" in detail.inner_text()
                assert page.get_by_role("button", name="Next 30 days").is_disabled()
            else:
                page.get_by_text("Loading calendar report…" if state == "loading" else "History storage is incompatible or unsafe. Existing data is unchanged.", exact=True).wait_for()
                assert page.get_by_role("group", name="Daily recorded values").count() == 0
            assert page.get_by_text("42% remaining", exact=True).is_visible()
            official = page.get_by_role("link", name="Open Codex Usage ↗")
            official.focus()
            assert official.evaluate("e => e === document.activeElement")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(out / f"calendar-{width}-{state}.png"), full_page=True)
            if state in ["partial", "deleted"]:
                assert page.get_by_role("button", name="Inspect /synthetic/workspace-2").count() == 1
                page.get_by_role("button", name="Show up to 50").click()
                assert page.locator('[aria-label^="Inspect "]').count() == 50
                page.get_by_role("combobox", name="Report metric").select_option("entities")
                page.get_by_role("combobox", name="Report metric").select_option("per-entity")
                page.get_by_role("button", name="Previous 30 days").click()
                page.wait_for_function("JSON.parse(document.body.dataset.lastQuery).startDate === '2026-08-02'")
                page.get_by_role("combobox", name="Report grouping").select_option("thread")
                page.get_by_role("button", name="Inspect thr_synthetic_1", exact=True).click()
                page.get_by_role("button", name="All entities").click()
                if state == "deleted":
                    assert page.get_by_role("button", name="Open thread thr_synthetic_1", exact=True).count() == 0
                else:
                    page.get_by_role("button", name="Open thread thr_synthetic_1", exact=True).click()
                    assert page.locator("body").get_attribute("data-opened-thread") == "thr_synthetic_1"
                assert page.locator("body").get_attribute("data-quota-actions") is None
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            management = page.get_by_text("Collection and history management", exact=True)
            management.focus()
            page.keyboard.press("Enter")
            assert page.get_by_role("button", name="Check readiness").is_visible()
            assert not errors, errors
            page.close()
    browser.close()
print("18 desktop/375px report states passed: keyboard values/classes/denominators, gaps versus zero, expiry, stale/loading/unavailable, huge values, top-50 ranking, date/group/entity isolation, deleted/available thread navigation, quota/official-link and management access. Synthetic only.")
