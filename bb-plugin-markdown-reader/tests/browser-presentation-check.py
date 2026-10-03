"""Reproducible BBP-31 presentation checks. Controlled frontend/Default-token fixture only."""
import argparse
import hashlib
import json
import struct
import urllib.request
import zlib
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--out", default="/tmp/bbp-31-browser")
parser.add_argument("--only", help="Run one case, for example 760-light")
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(args.url, timeout=5) as response:
    assert response.status == 200, "Fixture server is not ready"

# One synthetic raster image, 1200 x 600. No external request leaves the runner.
def chunk(kind, data):
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data))

png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!2I5B", 1200, 600, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress((b"\0" + bytes([100, 130, 150]) * 1200) * 600)) + chunk(b"IEND", b"")

GEOMETRY = """e => {
  const rect = e.getBoundingClientRect(), prose = e.querySelector('.mr-prose');
  const layout = e.querySelector('.mr-document-layout'), lr = layout.getBoundingClientRect();
  const toolbar = e.querySelector('.mr-toolbar'), tr = toolbar.getBoundingClientRect();
  const ps = getComputedStyle(prose), h2 = getComputedStyle(prose.querySelector('h2'));
  const image = prose.querySelector('img'), ir = image.getBoundingClientRect();
  return {width:e.clientWidth, scrollWidth:e.scrollWidth, documentWidth:document.documentElement.scrollWidth,
    proseWidth:prose.clientWidth, proseFont:ps.fontSize, lineHeight:ps.lineHeight,
    layoutWidth:lr.width, leftSpace:lr.left-rect.left, rightSpace:rect.right-lr.right,
    padding:getComputedStyle(e.querySelector('.mr-content')).padding,
    sectionAbove:h2.marginTop, sectionBelow:h2.marginBottom,
    outline:layout.dataset.outline, titleLines:prose.querySelector('h1').getBoundingClientRect().height,
    pathTruncated:toolbar.querySelector('.mr-path').scrollWidth > toolbar.querySelector('.mr-path').clientWidth,
    buttons:[...toolbar.querySelectorAll('button')].map(b=> {const r=b.getBoundingClientRect();return {
      name:b.textContent, width:r.width, height:r.height,
      inside:r.left>=tr.left && r.right<=tr.right && r.top>=tr.top && r.bottom<=tr.bottom};}),
    code:[...prose.querySelectorAll('pre')].map(c=>({width:c.clientWidth,scrollWidth:c.scrollWidth})),
    tables:[...prose.querySelectorAll('.mr-table-scroll')].map(c=>({width:c.clientWidth,scrollWidth:c.scrollWidth})),
    image:{width:ir.width,height:ir.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight}};
}"""
CONTRAST = """() => {
  const root=document.querySelector('.markdown-reader'), prose=root.querySelector('.mr-prose');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d', {willReadFrequently:true});
  const pixel=(color,base=null)=>{ctx.clearRect(0,0,1,1);if(base){ctx.fillStyle=base;ctx.fillRect(0,0,1,1);}
    ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
  const rgb=rgba=>`rgb(${rgba.slice(0,3).join(',')})`;
  const luminance=rgba=>rgba.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const bg=getComputedStyle(root).backgroundColor, fg=getComputedStyle(prose).color;
  const bodyBg=pixel(bg), bodyFg=pixel(fg,bg);
  const tokens=[...root.querySelectorAll('pre .token')].map(t=> {
    const surface=getComputedStyle(t.closest('pre')).backgroundColor;
    const background=pixel(surface,rgb(bodyBg)), foreground=pixel(getComputedStyle(t).color,rgb(background));
    return {class:t.className,foreground,background,ratio:ratio(foreground,background)};});
  return {body:{cssForeground:fg,cssBackground:bg,foreground:bodyFg,background:bodyBg,ratio:ratio(bodyFg,bodyBg)},
    tokenMin:Math.min(...tokens.map(t=>t.ratio)),tokens,
    radius:getComputedStyle(root.querySelector('.mr-view-controls')).borderRadius};
}"""

def focus_proof(locator):
    value = locator.evaluate("""e => {const s=getComputedStyle(e);const r=e.getBoundingClientRect();
      return {active:document.activeElement===e,visible:e.matches(':focus-visible'),
        outline:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor,
        onScreen:r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth};}""")
    assert value["active"] and value["visible"] and value["outline"] == "solid", value
    assert value["width"] == "2px" and value["onScreen"], value
    return value

cases = [(w, theme, w, f"{w}-{theme}") for w in (390, 760, 1440) for theme in ("light", "dark")]
cases += [(760, "custom", 760, "760-custom"), (390, "light", 1440, "narrow-in-wide")]
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        for width, theme, viewport, name in cases:
            if args.only and args.only != name:
                continue
            page = browser.new_page(viewport={"width": viewport, "height": 1000})
            evidence = {"pageErrors": [], "consoleErrors": [], "failedRequests": [], "responseCounts": {}}
            page.on("pageerror", lambda error: evidence["pageErrors"].append(str(error)[:300]) if len(evidence["pageErrors"]) < 20 else None)
            page.on("console", lambda msg: evidence["consoleErrors"].append(msg.text[:300]) if msg.type == "error" and len(evidence["consoleErrors"]) < 20 else None)
            page.on("requestfailed", lambda request: evidence["failedRequests"].append(urlsplit(request.url).path) if len(evidence["failedRequests"]) < 20 else None)
            def response_count(response):
                key = str(response.status)
                evidence["responseCounts"][key] = evidence["responseCounts"].get(key, 0) + 1
            page.on("response", response_count)
            page.route("https://fixture.invalid/diagram.png", lambda route: route.fulfill(status=200, content_type="image/png", body=png))
            try:
                sentinel = "&sentinel=1" if name == "narrow-in-wide" else ""
                page.goto(f"{args.url}/tests/presentation-preview.html?width={width}&theme={theme}{sentinel}")
                reader = page.get_by_role("region", name="Markdown Reader", exact=True)
                page.get_by_role("heading", level=1).wait_for()
                page.wait_for_function("document.querySelector('.mr-prose img')?.naturalWidth === 1200")
                page.wait_for_function("document.querySelector('.mr-document-layout').dataset.outline === " + json.dumps("aside" if width > 1080 else "inline"))
                geometry = reader.evaluate(GEOMETRY)
                assert geometry["width"] == geometry["scrollWidth"] == width, geometry
                assert geometry["documentWidth"] == viewport, geometry
                assert geometry["proseWidth"] == min(720, width - (48 if width <= 600 else 80 if width <= 1080 else 96)), geometry
                assert abs(geometry["leftSpace"] - geometry["rightSpace"]) < 1, geometry
                assert geometry["proseFont"] == ("15px" if width == 390 else "16px"), geometry
                assert geometry["lineHeight"] == ("27px" if width == 390 else "28px"), geometry
                assert float(geometry["sectionAbove"][:-2]) > float(geometry["sectionBelow"][:-2]), geometry
                assert geometry["pathTruncated"], geometry
                assert all(b["inside"] and b["height"] >= 36 for b in geometry["buttons"]), geometry
                assert len(geometry["buttons"]) == 5, geometry
                assert geometry["code"][-1]["scrollWidth"] > geometry["code"][-1]["width"], geometry
                assert geometry["tables"][-1]["scrollWidth"] > geometry["tables"][-1]["width"], geometry
                assert geometry["image"]["width"] <= geometry["proseWidth"], geometry
                assert abs(geometry["image"]["width"] / geometry["image"]["height"] - 2) < .01, geometry
                assert [reader.get_by_role("heading", level=l).count() for l in range(1, 7)] == [1, 5, 2, 1, 1, 1]  # Includes the accessible footnote label.
                assert page.get_by_role("columnheader", name="Observation").count() == 1
                assert page.locator('.mr-prose pre').first.text_content() == '{"compact":true,"value":"<script>not active</script>"}\n'
                assert page.locator('.mr-prose pre').nth(1).text_content() == '{\n  "query": "workspace Markdown",\n  "locationQuery": "",\n  "constraints": ["read-only", "explicit host"]\n}\n'
                assert page.locator(".mr-prose script, .mr-prose iframe").count() == 0
                contrast = page.evaluate(CONTRAST)
                assert contrast["body"]["ratio"] >= 4.5 and contrast["tokenMin"] >= 4.5, contrast
                if theme == "custom":
                    assert contrast["body"]["foreground"][:3] == [48, 51, 78], contrast
                    assert contrast["body"]["background"][:3] == [255, 248, 239], contrast
                    assert contrast["radius"] == "12px", contrast
                captures = []
                for suffix in ("top", "code"):
                    if suffix == "code":
                        page.locator(".mr-prose pre").first.scroll_into_view_if_needed()
                    file = out / f"{name}-{suffix}.png"
                    page.screenshot(path=str(file))
                    captures.append({"path": file.name, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
                reader.evaluate("e => e.scrollTop=0")
                page.evaluate("window.savedReader=document.querySelector('.markdown-reader');window.savedHeading=document.querySelector('.mr-prose h1')")
                preview_text = page.locator(".mr-prose").text_content()
                live_contrasts = []
                for changed_theme in ("dark", "light", "custom", theme):
                    page.evaluate(f"document.documentElement.dataset.theme='{changed_theme}'")
                    assert page.evaluate("savedReader===document.querySelector('.markdown-reader') && savedHeading===document.querySelector('.mr-prose h1')")
                    assert page.locator(".mr-prose").text_content() == preview_text
                    assert page.get_by_role("button", name="Preview", exact=True).get_attribute("aria-pressed") == "true"
                    assert page.get_by_role("button", name="Outline", exact=True).get_attribute("aria-pressed") == "true"
                    measured = page.evaluate(CONTRAST)
                    assert measured["body"]["ratio"] >= 4.5 and measured["tokenMin"] >= 4.5, measured
                    live_contrasts.append({"theme": changed_theme, "body": measured["body"], "tokenMin": measured["tokenMin"]})
                preview = page.get_by_role("button", name="Preview", exact=True)
                raw_button = page.get_by_role("button", name="Raw", exact=True)
                outline = page.get_by_role("button", name="Outline", exact=True)
                preview.focus()
                focus = [focus_proof(preview)]
                page.keyboard.press("Tab")
                focus.append(focus_proof(raw_button))
                page.keyboard.press("Space")
                raw = page.get_by_label("Raw Markdown", exact=True)
                assert raw.text_content() == page.evaluate("presentationFixture.text")
                page.evaluate("window.savedRaw=document.querySelector('.mr-raw')")
                page.keyboard.press("Tab")
                focus.append(focus_proof(page.get_by_role("button", name="Refresh", exact=True)))
                page.keyboard.press("Tab")
                focus.append(focus_proof(page.get_by_role("button", name="Open in BB preview", exact=True)))
                # Live host tokens and actual container width do not reload or remount Raw.
                page.evaluate("document.documentElement.dataset.theme='custom';presentationFixture.panel.style.width='390px'")
                assert raw.text_content() == page.evaluate("presentationFixture.text")
                assert raw_button.get_attribute("aria-pressed") == "true"
                for changed_theme in ("dark", "light", "custom"):
                    page.evaluate(f"document.documentElement.dataset.theme='{changed_theme}'")
                    assert raw.text_content() == page.evaluate("presentationFixture.text")
                    assert raw_button.get_attribute("aria-pressed") == "true"
                    assert page.evaluate("savedRaw===document.querySelector('.mr-raw') && savedReader===document.querySelector('.markdown-reader')")
                raw_button.focus()
                focus.append(focus_proof(raw_button))
                page.keyboard.press("Shift+Tab")
                focus.append(focus_proof(preview))
                page.keyboard.press("Enter")
                page.keyboard.press("Tab")
                focus.append(focus_proof(raw_button))
                page.keyboard.press("Tab")
                focus.append(focus_proof(outline))
                page.keyboard.press("Space")
                assert page.locator(".mr-document-layout").get_attribute("data-outline") == "hidden"
                assert outline.get_attribute("aria-pressed") == "false"
                page.evaluate(f"document.documentElement.dataset.theme='{theme}';presentationFixture.panel.style.width='{width}px'")
                assert outline.get_attribute("aria-pressed") == "false"
                assert page.evaluate("savedReader===document.querySelector('.markdown-reader')")
                page.keyboard.press("Enter")
                page.wait_for_function("document.querySelector('.mr-document-layout').dataset.outline === " + json.dumps("aside" if width > 1080 else "inline"))
                if width <= 1080:
                    summary = page.locator(".mr-outline-inline summary")
                    summary.focus()
                    focus.append(focus_proof(summary))
                    page.keyboard.press("Enter")
                    assert page.locator(".mr-outline-inline").get_attribute("open") is not None
                    page.evaluate("document.documentElement.dataset.theme='custom'")
                    assert page.locator(".mr-outline-inline").get_attribute("open") is not None
                final_entry = page.get_by_role("navigation", name="Document sections").get_by_role("button", name="Final section", exact=True)
                final_entry.focus()
                page.keyboard.press("Enter")
                heading = page.get_by_role("heading", name="Final section", exact=True)
                assert heading.evaluate("e => document.activeElement===e")
                hr = heading.bounding_box()
                toolbar_bottom = page.locator(".mr-toolbar").bounding_box()
                assert hr["y"] >= toolbar_bottom["y"] + toolbar_bottom["height"] - 2 and hr["y"] < 1000, hr
                # A document link and footnote still scroll and focus local targets after changes.
                local = page.get_by_role("link", name="Go to the final section", exact=True)
                local.focus()
                page.keyboard.press("Enter")
                assert heading.evaluate("e => document.activeElement===e")
                footnote = page.locator(".mr-prose sup a").first
                footnote.focus()
                page.keyboard.press("Enter")
                assert page.evaluate("document.activeElement.closest('.markdown-reader') === savedReader")
                return_link = page.locator('.mr-prose a[aria-label="Back to reference 1"]').first
                return_link.focus()
                page.keyboard.press("Enter")
                assert page.evaluate("document.activeElement.closest('sup') !== null")
                # Focused wide regions accept keyboard horizontal scroll, not panel overflow.
                for region in [page.locator(".mr-prose pre").last, page.locator(".mr-table-scroll").last]:
                    region.focus()
                    focus.append(focus_proof(region))
                    page.keyboard.press("ArrowRight")
                    page.wait_for_function("e => e.scrollLeft > 0", arg=region.element_handle())
                assert reader.evaluate("e => e.clientWidth===e.scrollWidth")
                assert page.evaluate("presentationFixture.inspection.rpcCalls.filter(c=>c.method==='read_document').length") == 1
                assert page.evaluate("presentationFixture.inspection.navigateCalls.length") == 0
                sentinel_styles = page.locator(".fixture-sentinel").evaluate("""e => ({heading:getComputedStyle(e.querySelector('h2')).fontSize,
                  paragraphMargin:getComputedStyle(e.querySelector('p')).marginTop,buttonOutline:getComputedStyle(e.querySelector('button')).outlineStyle})""")
                assert sentinel_styles == {"heading": "13px", "paragraphMargin": "0px", "buttonOutline": "none"}, sentinel_styles
                assert not evidence["pageErrors"] and not evidence["consoleErrors"] and not evidence["failedRequests"], evidence
                results.append({"case": name, "fixtureOnly": True, "geometry": geometry, "contrast": contrast, "liveContrasts": live_contrasts, "focus": focus,
                    "rawExact": True, "liveThemeAndWidthState": True, "localNavigation": True,
                    "keyboardLocalScroll": True, "sentinelStyles": sentinel_styles, "captures": captures, "browser": evidence})
            except Exception:
                (out / "completed-before-failure.json").write_text(json.dumps(results, indent=2) + "\n")
                (out / f"{name}-failure.json").write_text(json.dumps(evidence, indent=2) + "\n")
                page.screenshot(path=str(out / f"{name}-failure.png"))
                raise
            finally:
                page.close()
        if not args.only:
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.goto(f"{args.url}/tests/presentation-preview.html?width=390&headings=none&theme=dark&sentinel=1")
            page.get_by_text("Plain text without headings.").wait_for()
            assert page.get_by_role("button", name="Outline", exact=True).count() == 0
            assert page.get_by_role("navigation", name="Document sections").count() == 0
            assert page.locator(".markdown-reader").evaluate("e=>e.clientWidth===390 && e.scrollWidth===390")
            page.get_by_role("button", name="Raw", exact=True).focus()
            page.keyboard.press("Enter")
            assert page.get_by_label("Raw Markdown", exact=True).text_content() == page.evaluate("presentationFixture.text")
            results.append({"case": "heading-free", "fixtureOnly": True, "noOutline": True, "rawExact": True})
            page.close()
    finally:
        browser.close()
(out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps({"passedCases": [r["case"] for r in results], "fixtureOnly": True}, indent=2))
