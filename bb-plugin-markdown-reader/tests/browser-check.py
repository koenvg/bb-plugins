"""Bounded first-reader fixture checks, not the final BB visual matrix."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--out", default="/tmp/bbp-27-browser")
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
source = (Path(__file__).parent / "fixtures/report.md").read_text()
results = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, theme in [(760, "light"), (390, "dark"), (1440, "custom")]:
        # A wider desktop with a narrow reader proves container-based behavior.
        page = browser.new_page(viewport={"width": max(width, 1100), "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{args.url}/?width={width}&theme={theme}")
        page.get_by_role("heading", name="Reading a workspace document").wait_for()
        geometry = page.locator(".markdown-reader").evaluate("""e => {
          const prose = e.querySelector('.mr-prose');
          const ps = getComputedStyle(prose);
          const toolbar = e.querySelector('.mr-toolbar');
          return {width: e.clientWidth, scrollWidth: e.scrollWidth,
            proseWidth: prose.clientWidth, fontSize: ps.fontSize, lineHeight: ps.lineHeight,
            contentPadding: getComputedStyle(e.querySelector('.mr-content')).padding,
            toolbarHeight: toolbar.clientHeight,
            buttonsInside: [...toolbar.querySelectorAll('button')].every(b => {
              const r = b.getBoundingClientRect(), t = toolbar.getBoundingClientRect();
              return r.left >= t.left && r.right <= t.right && r.top >= t.top && r.bottom <= t.bottom;
            })};
        }""")
        assert geometry["width"] == width, geometry
        assert geometry["scrollWidth"] == width, geometry
        assert geometry["proseWidth"] <= 720, geometry
        assert geometry["buttonsInside"], geometry
        assert geometry["fontSize"] == ("15px" if width == 390 else "16px"), geometry
        assert page.locator(".mr-prose a[href], .mr-prose img").count() == 0
        wide_code = page.locator(".mr-prose pre").last
        assert wide_code.evaluate("e => e.scrollWidth > e.clientWidth")
        wide_table = page.locator(".mr-table-scroll").last
        if width == 390:
            assert wide_table.evaluate("e => e.scrollWidth > e.clientWidth")
        page.screenshot(path=str(out / f"reader-{width}-{theme}.png"))
        page.get_by_role("button", name="Raw", exact=True).focus()
        page.keyboard.press("Enter")
        raw = page.get_by_label("Raw Markdown", exact=True)
        assert raw.text_content() == source
        # Live token changes preserve the snapshot and selected view.
        before_color = raw.evaluate("e => getComputedStyle(e).color")
        page.evaluate("document.documentElement.dataset.theme = 'custom'")
        assert raw.text_content() == source
        after_color = raw.evaluate("e => getComputedStyle(e).color")
        if theme != "custom":
            assert before_color != after_color
        assert page.locator('.fixture-outside h2').evaluate("e => getComputedStyle(e).fontSize") == '13px'
        assert page.locator('.fixture-outside p').evaluate("e => getComputedStyle(e).marginTop") == '0px'
        page.get_by_role("button", name="Preview", exact=True).focus()
        page.keyboard.press("Enter")
        assert page.get_by_role("heading", name="Reading a workspace document").is_visible()
        assert page.get_by_role("button", name="Preview", exact=True).evaluate("e => e.matches(':focus-visible')")
        page.locator(".markdown-reader").evaluate("e => e.scrollTop = e.scrollHeight")
        assert page.get_by_role("button", name="Open in BB preview").count() == 0
        assert not errors, errors
        results.append({"theme": theme, "geometry": geometry, "browserErrors": errors,
            "rawExact": True, "keyboard": True, "readyOriginalAbsent": True, "localOverflow": True})
        page.close()
    browser.close()

(out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
