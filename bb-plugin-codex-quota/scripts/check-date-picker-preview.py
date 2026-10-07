"""Run with browser-use, which supplies the browser helpers.

Serve the calendar preview and built plugin CSS on localhost first.
Only a new task-owned tab is used. No installed BB or live host data is read.
BBP119_PREVIEW_URL and BBP119_EVIDENCE_DIR can override the local defaults.
"""
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

base = os.environ.get("BBP119_PREVIEW_URL", "http://127.0.0.1:38719/")
assert urlparse(base).hostname == "127.0.0.1"
assert urlopen(base).status == 200
out = Path(os.environ.get("BBP119_EVIDENCE_DIR", "/tmp/bbp119-evidence"))
out.mkdir(parents=True, exist_ok=True)
results = []
widths = [int(os.environ["BBP119_WIDTH"])] if "BBP119_WIDTH" in os.environ else [375, 1280]
states = [os.environ["BBP119_STATE"]] if "BBP119_STATE" in os.environ else ["partial", "unknown", "inactive", "no-prices", "tiny", "huge"]
assert all(width in [375, 1280] for width in widths)
assert all(state in ["partial", "unknown", "inactive", "no-prices", "tiny", "huge"] for state in states)
# Use only when touch input is blocked by the browser driver. This is not a touch pass.
skip_touch = os.environ.get("BBP119_SKIP_TOUCH") == "1"
if skip_touch:
    print("LIMIT: touch checks skipped by explicit driver-limit flag", flush=True)


def until(expression):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.05)
    raise AssertionError("Timed out: " + expression)


def center(selector):
    encoded = json.dumps(selector)
    js(f"document.querySelector({encoded}).scrollIntoView({{block:'center'}})")
    time.sleep(0.15)  # Wait for native scrolling before reading viewport coordinates.
    box = js(f"document.querySelector({encoded}).getBoundingClientRect().toJSON()")
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    assert 0 <= x < js("innerWidth") and 0 <= y < js("innerHeight")
    return x, y


def pointer(selector, touch=False):
    x, y = center(selector)
    if touch:
        cdp("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": x, "y": y}])
        cdp("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
    else:
        click_at_xy(x, y)


def selected(date):
    until(f"document.querySelector('[aria-label=\"Inspect {date}\"]').getAttribute('aria-pressed') === 'true'")
    assert js("document.querySelector('[aria-label=\"Selected date\"] time').dateTime") == date


def screenshot(name):
    js("window.scrollTo(0,0)")
    time.sleep(0.1)
    data = base64.b64decode(cdp("Page.captureScreenshot", format="png", captureBeyondViewport=True)["data"])
    assert data.startswith(b"\x89PNG\r\n\x1a\n"), "Browser returned no valid PNG screenshot"
    (out / name).write_bytes(data)


print("Initial target:", current_tab().get("targetId"), flush=True)
print("Existing tab count:", len(list_tabs()), flush=True)
target = new_tab()
print("Created task target:", target, flush=True)
owned_targets = [target]
try:
    for width in widths:
        height = 812 if width == 375 else 1100
        for state in states:
            # Fresh pages keep native select popups and input focus out of later cases.
            target = new_tab()
            owned_targets.append(target)
            print("Created case target:", target, flush=True)
            switch_tab(target)
            cdp("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=width == 375)
            cdp("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=1)
            goto_url(base + "?state=" + state)
            wait_for_load()
            until("document.querySelectorAll('[aria-label=\"Daily recorded usage\"] tbody tr').length === 30")
            until("document.querySelector('.recharts-xAxis') !== null")
            time.sleep(0.2)  # Let ResponsiveContainer settle after navigation.
            js("window.inputEvents=[]; for(const t of ['pointerdown','touchstart','click','keydown']) document.addEventListener(t,e=>inputEvents.push({type:e.type,trusted:e.isTrusted,label:e.target.getAttribute('aria-label'),key:e.key,pointer:e.pointerType}),true)")
            summary = "[aria-label='Daily recorded values'] summary"
            if state == "partial":
                screenshot(f"calendar-{width}-collapsed.png")
            if width == 375 and not skip_touch:
                pointer(summary, touch=True)
            else:
                js("document.querySelector('[aria-label=\"Daily recorded values\"] summary').focus()")
                press_key("Enter")
            until("document.querySelector('[aria-label=\"Daily recorded values\"] details').open")
            sizes = js("[...document.querySelectorAll('button[aria-label^=\"Inspect \"]')].map(e=>({date:e.getAttribute('aria-label'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))")
            dates = [s["date"].removeprefix("Inspect ") for s in sizes]
            assert len(sizes) == 30
            assert all(s["width"] >= 24 and s["height"] >= 24 for s in sizes), sizes
            summary_size = js("document.querySelector('[aria-label=\"Daily recorded values\"] summary').getBoundingClientRect().toJSON()")
            assert summary_size["width"] >= 24 and summary_size["height"] >= 24
            pointer(f'[aria-label="Inspect {dates[14]}"]')
            selected(dates[14])
            detail = js("document.querySelector('[aria-label=\"Selected date\"]').textContent")
            facts = js("Object.fromEntries([...document.querySelectorAll('[aria-label=\"Selected date\"] dt')].map(e=>[e.textContent,e.nextElementSibling.textContent]))")
            if state == "unknown":
                assert facts["Recorded tokens"] == "Unavailable" and "Unknown, uncovered gap" in detail
            elif state == "inactive":
                assert facts["Recorded tokens"] == "0" and "Observed inactivity" in detail
            elif state == "huge":
                assert facts["Recorded tokens"] == "9,007,199,254,740,991"
            else:
                assert facts["Recorded tokens"] == "600" and "Partial, recorded usage" in detail
            if state == "partial":
                # Tab from the native disclosure into the date grid.
                js("document.querySelector('[aria-label=\"Daily recorded values\"] summary').focus()")
                press_key("Tab")
                assert js("document.activeElement.getAttribute('aria-label')") == f"Inspect {dates[0]}"
                press_key("Enter")
                selected(dates[0])
                press_key("Tab")
                press_key(" ")
                selected(dates[1])
                pointer(f'[aria-label="Inspect {dates[29]}"]', touch=not skip_touch)
                selected(dates[29])
                pointer(f'[aria-label="Inspect {dates[14]}"]', touch=not skip_touch)
                selected(dates[14])
                screenshot(f"calendar-{width}-tokens.png")
            else:
                screenshot(f"calendar-{width}-{state}.png")
            assert js("document.body.dataset.reportCalls") == "1"
            assert js("document.documentElement.scrollWidth <= innerWidth")
            events = js("inputEvents")
            assert any(e["type"] == "click" and e["trusted"] and e.get("pointer") == "mouse" and e.get("label") == f"Inspect {dates[14]}" for e in events)
            if state == "partial":
                if not skip_touch:
                    assert any(e["type"] == "click" and e["trusted"] and e.get("pointer") == "touch" and e.get("label") == f"Inspect {dates[29]}" for e in events)
                for key in ["Enter", " "]:
                    assert any(e["type"] == "keydown" and e["trusted"] and e.get("key") == key and str(e.get("label")) in [f"Inspect {date}" for date in dates] for e in events)
            results.append({"width": width, "height": height, "state": state, "targets": sizes, "summary": summary_size, "inputEvents": events, "reportCalls": 1, "overflow": False, "touchChecked": not skip_touch})
            (out / "measurements.json").write_text(json.dumps(results, indent=2))
            print(f"PASS {width} {state}: 30 dates, minimum {min(s['width'] for s in sizes):.2f} x {min(s['height'] for s in sizes):.2f} CSS px", flush=True)
finally:
    for owned in reversed(owned_targets):
        switch_tab(owned)
        cdp("Emulation.clearDeviceMetricsOverride")
        cdp("Emulation.setTouchEmulationEnabled", enabled=False)
        close_tab(owned)
        print("Closed task target:", owned, flush=True)
print(f"Passed {len(results)} synthetic browser cases. Native CDP mouse, Tab, Enter and Space; touch " + ("NOT VERIFIED due to driver limit" if skip_touch else "verified") + ". No DOM activation calls. Not physical-device or installed acceptance.")
