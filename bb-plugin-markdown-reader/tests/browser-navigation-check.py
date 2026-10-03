"""BBP-29 navigation checks on the real reader with fixture props, not live BB."""
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
source = (Path(__file__).parent / "fixtures/navigation.md").read_bytes().decode("utf-8")
results = []


def request(page, start, end):
    page.evaluate("range => window.dispatchEvent(new CustomEvent('fixture-line-request', {detail:{range}}))", {"startLineNumber": start, "endLineNumber": end})


def revealed(panel, target):
    return target.evaluate("""e => {
      const panel = e.closest('.markdown-reader'), r = e.getBoundingClientRect();
      const toolbar = panel.querySelector('.mr-toolbar').getBoundingClientRect();
      return r.top >= toolbar.bottom && r.top < panel.getBoundingClientRect().bottom;
    }""")


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, theme in [(1440, "light"), (760, "light"), (390, "dark")]:
        page = browser.new_page(viewport={"width": max(1440, width), "height": 850})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{args.url}/?document=navigation&width={width}&theme={theme}")
        panel = page.locator(".markdown-reader")
        page.get_by_role("article").wait_for()
        if width > 1080:
            outline = page.get_by_role("complementary", name="On this page")
            outline.wait_for()
            assert outline.evaluate("e => e.getBoundingClientRect().width") == 164
            geometry = page.locator(".mr-document-layout").evaluate("e => ({width:e.clientWidth,gap:getComputedStyle(e).columnGap})")
            assert geometry == {"width": 944, "gap": "60px"}, geometry
        else:
            outline = page.locator("details")
            assert not outline.evaluate("e => e.open")
            summary = outline.locator("summary")
            summary.focus()
            page.keyboard.press("Enter")
            assert outline.evaluate("e => e.open")
            assert summary.evaluate("e => e.matches(':focus-visible') && getComputedStyle(e).outlineWidth === '2px'")
        page.screenshot(path=str(out / f"outline-{width}-{theme}.png"))
        entries = outline.get_by_role("button", name="日本語 code link", exact=True)
        entries.nth(1).focus()
        page.keyboard.press("Enter")
        target = panel.get_by_role("heading", name="日本語 code link", exact=True).nth(1)
        assert target.evaluate("e => e === document.activeElement")
        assert revealed(panel, target)
        assert panel.evaluate("e => e.scrollTop > 0")
        assert page.get_by_role("button", name="Outline", exact=True).is_visible()
        assert page.evaluate("location.hash") == ""
        panel.evaluate("e => e.scrollTop = 0")
        old_id = target.get_attribute("id")
        link = panel.get_by_role("link", name="Second Japanese heading")
        link.focus()
        page.keyboard.press("Enter")
        assert target.evaluate("e => e === document.activeElement")
        assert revealed(panel, target)
        panel.evaluate("e => e.scrollTop = 0")
        link.click(modifiers=["Control"])
        panel.evaluate("e => e.scrollTop = 0")
        link.click(button="middle")
        assert len(page.context.pages) == 1
        assert page.evaluate("location.hash") == ""
        assert panel.locator("img").count() == 0
        assert panel.get_by_role("link", name="File stays inert").count() == 0
        panel.evaluate("e => e.scrollTop = 0")
        before_top = panel.locator(".mr-prose").evaluate("e => e.getBoundingClientRect().top")
        page.get_by_role("button", name="Outline", exact=True).click()
        assert panel.locator("aside, details").count() == 0
        assert panel.locator(".mr-document-layout").evaluate("e => e.clientWidth") <= 720
        if width <= 1080:
            assert panel.locator(".mr-prose").evaluate("e => e.getBoundingClientRect().top") < before_top
        assert target.get_attribute("id") == old_id
        # Public props change, not a source reload or remount.
        request(page, 18, 18)
        raw = page.get_by_label("Raw Markdown", exact=True)
        raw.wait_for()
        assert raw.text_content() == source
        line = raw.locator('[data-source-line="18"]')
        assert raw.locator('[data-highlighted="true"]').count() == 1
        assert line.text_content() == source.splitlines(keepends=True)[17]
        assert line.evaluate("e => e === document.activeElement")
        assert revealed(panel, line)
        if width == 390:
            assert line.evaluate("e => e.clientHeight > 3 * parseFloat(getComputedStyle(e).lineHeight)")
        assert raw.evaluate("e => e.scrollWidth === e.clientWidth")
        page.screenshot(path=str(out / f"raw-target-{width}-{theme}.png"))
        raw.evaluate("e => window.fixtureRawIdentity = e")
        panel.evaluate("e => e.scrollTop = 0")
        page.get_by_role("button", name="Raw", exact=True).focus()
        request(page, 18, 18)
        page.wait_for_function("document.activeElement?.dataset.sourceLine === '18' && document.querySelector('.markdown-reader').scrollTop > 0")
        assert raw.evaluate("e => e === window.fixtureRawIdentity")
        assert revealed(panel, line)
        page.get_by_role("button", name="Preview", exact=True).click()
        assert panel.get_by_role("heading", name="日本語 code link", exact=True).nth(1).get_attribute("id") == old_id
        request(page, 1000, 54)
        raw.wait_for()
        assert raw.locator('[data-highlighted="true"]').count() == 3
        assert raw.text_content() == source
        assert page.evaluate("document.documentElement.dataset.fixtureReads") == "1"
        assert panel.evaluate("e => e.scrollWidth === e.clientWidth")
        assert not errors, errors
        results.append({"width": width, "theme": theme, "fixtureOnly": True, "outline": True, "localFocus": True, "reclaimedSpace": True, "fragmentNoReopen": True, "exactCRLFRaw": True, "repeatedReveal": True, "clampedRange": True, "noReload": True, "errors": errors})
        page.close()

    page = browser.new_page(viewport={"width": 1440, "height": 850})
    page.goto(f"{args.url}/?document=navigation&width=1440")
    page.locator(".mr-outline-aside").wait_for()
    page.locator(".fixture-panel").evaluate("e => e.style.width = '760px'")
    page.locator("details").wait_for()
    assert not page.locator("details").evaluate("e => e.open")
    assert page.locator(".mr-outline-aside").count() == 0
    results.append({"dynamicPanelResize": True, "desktopViewport": 1440, "readerWidth": 760})
    page.goto(f"{args.url}/?document=no-headings&width=1440")
    page.get_by_role("article").wait_for()
    assert page.get_by_role("button", name="Outline", exact=True).count() == 0
    assert page.locator("details, .mr-outline-aside").count() == 0
    results.append({"noEmptyOutline": True})
    page.goto(f"{args.url}/?document=navigation&width=1440&readers=2")
    page.get_by_role("article").nth(1).wait_for()
    readers = page.locator(".markdown-reader")
    ids = page.locator(".mr-prose [id]").evaluate_all("es => es.map(e => e.id)")
    assert len(ids) == len(set(ids))
    readers.nth(1).get_by_role("link", name="Second Japanese heading").click()
    second = readers.nth(1).get_by_role("heading", name="日本語 code link", exact=True).nth(1)
    assert second.evaluate("e => e === document.activeElement")
    assert revealed(readers.nth(1), second)
    assert readers.nth(0).evaluate("e => e.scrollTop") == 0
    assert readers.nth(1).evaluate("e => e.scrollTop") > 0
    page.screenshot(path=str(out / "independent-readers.png"))
    results.append({"independentReaders": True, "uniqueIds": True, "localScrollOnly": True})
    page.goto(f"{args.url}/?document=navigation&width=760&start=18&end=18")
    raw = page.get_by_label("Raw Markdown", exact=True)
    raw.wait_for()
    assert raw.text_content() == source
    page.wait_for_function("document.activeElement?.dataset.sourceLine === '18'")
    results.append({"initialLineRequest": True})
    page.close()
    for headings in ["none", "actual"]:
        page = browser.new_page(viewport={"width": 1100, "height": 850})
        footnote_errors = []
        page.on("pageerror", lambda error: footnote_errors.append(str(error)))
        page.goto(f"{args.url}/?document=footnotes&headings={headings}&width=760&start=1&end=1")
        raw = page.get_by_label("Raw Markdown", exact=True)
        raw.wait_for()
        expected = ("" if headings == "none" else "# Actual\r\n\r\n") + "Text[^1] and repeated[^1]\r\n\r\n[^1]: Note é.\r\n"
        assert raw.text_content() == expected
        page.get_by_role("button", name="Preview", exact=True).click()
        assert "Note é." in page.get_by_role("article").inner_text()
        assert page.get_by_role("button", name="Outline", exact=True).count() == (0 if headings == "none" else 1)
        assert page.locator(".mr-prose a[href]").count() == 4
        assert page.locator(".mr-prose a[href]").evaluate_all("es => es.every(e => [...e.closest('.mr-prose').querySelectorAll('[id]')].some(t => '#' + t.id === e.getAttribute('href')))")
        assert page.locator('[data-footnotes] > .sr-only').evaluate("e => e.getBoundingClientRect().width") == 1
        references_local = page.locator(".mr-prose sup [aria-describedby]").evaluate_all("es => es.every(e => [...e.closest('.mr-prose').querySelectorAll('[id]')].some(label => label.id === e.getAttribute('aria-describedby') && label.textContent === 'Footnotes'))")
        assert references_local
        page.screenshot(path=str(out / f"footnotes-{headings}.png"))
        assert not footnote_errors, footnote_errors
        results.append({"footnotes": headings, "initialExactRaw": True, "noInventedOutline": True, "readerLocalFragments": True, "localAccessibilityReferences": True, "errors": footnote_errors})
        page.close()
    browser.close()

(out / "navigation-results.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
