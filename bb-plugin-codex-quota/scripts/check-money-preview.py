"""Owned localhost-only money report checks. Not installed or complete-active comparison acceptance."""
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
import os

base = "http://127.0.0.1:38721/"
assert urlopen(base).status == 200
out = Path("/tmp/bbp21-evidence")
out.mkdir(exist_ok=True)
states = os.environ.get("BBP21_PREVIEW_STATES", "partial,no-prices,tiny,huge,expired,stale,unknown,inactive,prior-expired,prior-incompatible,unavailable,loading,deleted").split(",")
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(1280, 1100), (375, 812)]:
        for state in states:
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
                calls = page.locator("body").get_attribute("data-report-calls")
                metric = page.get_by_role("combobox", name="Report metric")
                metric.select_option("cost")
                day = chart.get_by_role("button").nth(14)
                day.focus()
                page.keyboard.press("Enter")
                detail = page.get_by_role("region", name="Daily detail")
                assert "2026-09-15" in detail.inner_text()
                assert "accepted records priced" in detail.inner_text()
                assert "priced active workspaces" in detail.inner_text()
                assert "Collection coverage" in detail.inner_text()
                if state == "partial":
                    assert "$10 / 2 = $5" in detail.inner_text()
                    assert "60 distinct workspaces" in detail.inner_text()
                if state == "tiny":
                    assert "$5e-324" in detail.inner_text()
                    assert "below numeric range" in detail.inner_text()
                    assert "$0" not in detail.inner_text()
                if state == "huge":
                    assert "$9,007,199,254,740,991" in detail.inner_text()
                if state in ["no-prices", "unknown", "inactive"]:
                    assert "Captured estimated cost subtotal: Unavailable" in detail.inner_text()
                    assert "No eligible priced records" in detail.inner_text()
                    assert "Gap" in day.get_attribute("aria-label")
                    assert "$0" not in detail.inner_text()
                if state == "expired":
                    summary = detail.get_by_text("Token classes and exclusions", exact=True)
                    summary.focus()
                    page.keyboard.press("Enter")
                    assert "Token classes unavailable" in detail.inner_text()
                    assert "$10 / 2 = $5" in detail.inner_text()
                metric.select_option("cost-per-entity")
                if state == "tiny":
                    assert "Gap" in day.get_attribute("aria-label")
                assert page.locator("body").get_attribute("data-report-calls") == calls
                assert "not billed subscription charges" in report.inner_text()
                if state == "stale":
                    assert "Stale report for this same range and scope" in report.inner_text()
                compare = page.get_by_role("combobox", name="Report comparison")
                metric.focus()
                page.keyboard.press("Tab")
                assert compare.evaluate("e => e === document.activeElement")
                compare.select_option("previous")
                page.wait_for_function("JSON.parse(document.body.dataset.lastQuery).comparison === true")
                if state == "prior-incompatible":
                    report.get_by_text("The calendar report is unavailable in this host/plugin version.", exact=True).wait_for()
                    assert page.get_by_role("region", name="Previous 30-date comparison").count() == 0
                    compare.select_option("off")
                    chart.wait_for()
                else:
                    comparison = page.get_by_role("region", name="Previous 30-date comparison")
                    comparison.wait_for()
                    assert "2026-08-02 to 2026-08-31" in comparison.inner_text()
                    assert "Percentage unavailable" in comparison.inner_text()
                    if state == "prior-expired":
                        assert "Outside retained bounds" in comparison.inner_text()
                        assert "Current known subtotals" in comparison.inner_text()
                    elif state == "inactive":
                        metric.select_option("tokens")
                        assert "prior baseline is zero" in comparison.inner_text()
                        metric.select_option("per-entity")
                        assert "denominator is zero" in comparison.inner_text()
                        metric.select_option("cost")
                        assert "No eligible captured price" in comparison.inner_text()
                        assert "$0" not in comparison.inner_text()
                    elif state == "stale":
                        assert "Report is stale or refreshing" in comparison.inner_text()
                    elif state == "no-prices":
                        assert "Captured estimate subtotal: Unavailable" in comparison.inner_text()
                        assert "$0" not in comparison.inner_text()
                    elif state == "tiny":
                        assert "$5e-324" in comparison.inner_text()
                        assert "$0" not in comparison.inner_text()
                    elif state == "unknown":
                        assert "Unknown, no accepted records" in comparison.inner_text()
                        assert comparison.get_by_text("Active workspaces: Unknown, no accepted records.", exact=True).count() == 2
                        assert "0 distinct active workspaces" not in comparison.inner_text()
                    else:
                        assert "Attribution exclusions prevent" in comparison.inner_text()
                    comparison.screenshot(path=str(out / f"comparison-{width}-{state}.png"))
                    cmp_calls = page.locator("body").get_attribute("data-report-calls")
                    metric.select_option("cost-per-entity")
                    assert page.locator("body").get_attribute("data-report-calls") == cmp_calls
                if state == "partial":
                    assert page.locator('[aria-label^="Inspect "]').count() == 10
                    page.get_by_role("button", name="Show up to 50").click()
                    assert page.locator('[aria-label^="Inspect "]').count() == 50
                    page.get_by_role("button", name="Inspect /synthetic/workspace-2", exact=True).click()
                    page.get_by_role("button", name="All entities").click()
                    page.get_by_role("button", name="Previous 30 days").click()
                    page.wait_for_function("JSON.parse(document.body.dataset.lastQuery).startDate === '2026-08-02'")
                    page.get_by_role("combobox", name="Report grouping").select_option("thread")
                    page.get_by_role("button", name="Open thread thr_synthetic_1", exact=True).click()
                    assert page.locator("body").get_attribute("data-opened-thread") == "thr_synthetic_1"
                if state == "deleted":
                    page.get_by_role("combobox", name="Report grouping").select_option("thread")
                    page.get_by_text("1. Deleted thread thr_synthetic_1", exact=True).wait_for()
                    assert page.get_by_role("button", name="Open thread thr_synthetic_1", exact=True).count() == 0
            else:
                report.get_by_text("Loading calendar report…" if state == "loading" else "History storage is incompatible or unsafe. Existing data is unchanged.", exact=True).wait_for()
            assert page.get_by_text("42% remaining", exact=True).is_visible()
            official = page.get_by_role("link", name="Open Codex Usage ↗")
            official.focus()
            assert official.evaluate("e => e === document.activeElement")
            assert page.locator("body").get_attribute("data-quota-actions") is None
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(out / f"money-{width}-{state}.png"), full_page=True)
            management = page.get_by_text("Collection and history management", exact=True)
            management.focus()
            page.keyboard.press("Enter")
            assert page.get_by_role("button", name="Check readiness").is_visible()
            assert not errors, errors
            page.close()
    browser.close()
print(f"{len(states) * 2} desktop/375px money/comparison states passed: keyboard prices/denominators, tiny/huge/unpriced values, conservative prior/zero-baseline/missing-denominator reasons, expired/incompatible/stale comparisons, local metrics, ranking/scope/navigation, failure isolation and quota/link/management reachability. Synthetic only; active percentages remain unavailable.")
