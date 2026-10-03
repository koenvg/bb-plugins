"""Run via browser-use python exec() in an owned Arc preview session.
Requires the package build and a local HTTP server on 56429. Only synthetic
fixture controls are exercised. No BB plugin is installed or configured.
"""
import base64
import json
import hashlib
import struct
from pathlib import Path

base = "http://127.0.0.1:56429/tests/preview.html"
evidence = Path(globals().get("evidence_dir") or Path(__file__).resolve().parents[2] / ".impeccable" / "review")
evidence.mkdir(parents=True, exist_ok=True)
cdp = browser._run(browser._session.get_or_create_cdp_session())

current = browser._run(cdp.cdp_client.send.Runtime.evaluate(params={"expression": "location.href", "returnByValue": True}, session_id=cdp.session_id))
if not current["result"]["value"].startswith(base):
    raise RuntimeError("Open the local fixture in a dedicated Arc session before running checks")
def send(domain, method, params):
    return browser._run(getattr(getattr(cdp.cdp_client.send, domain), method)(params=params, session_id=cdp.session_id))

cases = [
    ("hero-dark", 1504, 1046, "dark", "expanded", False, False, False, "hero-repro.png"),
    ("desktop-dark", 1440, 1046, "dark", "expanded", False, False, False, "desktop.png"),
    ("desktop-light", 1440, 1046, "light", "expanded", False, False, False, "desktop-light.png"),
    ("user-width", 1615, 990, "dark", "expanded", False, False, False, "user-1615.png"),
    ("mobile-dark", 390, 844, "dark", "expanded", True, False, False, "mobile.png"),
    ("mobile-light", 390, 844, "light", "expanded", True, False, False, "mobile-light.png"),
    ("custom-tokens", 1440, 1046, "custom", "expanded", False, False, False, None),
    ("compact-dark", 1440, 1046, "dark", "compact", False, False, False, None),
    ("compact-touch", 390, 844, "dark", "compact", True, False, False, None),
    ("new-thread", 1440, 1046, "light", "new", False, False, False, None),
    ("new-thread-touch", 390, 844, "light", "new", True, False, False, None),
    ("disabled-action", 1440, 1046, "dark", "expanded", False, False, True, None),
    ("reduced-motion", 390, 844, "dark", "expanded", True, True, False, None),
    ("long-draft", 390, 844, "dark", "expanded", True, False, False, None),
    ("split-send-empty", 1440, 1046, "dark", "expanded", True, False, False, None),
    ("split-send-draft", 1440, 1046, "dark", "expanded", True, False, False, None),
]
requested = globals().get("case_names")
if requested:
    if set(requested) - {case[0] for case in cases}:
        raise ValueError("Unknown browser case name")
    cases = [case for case in cases if case[0] in requested]
results = []
try:
    # Always exercise the latest build, not cached assets from a prior run.
    send("Network", "setCacheDisabled", {"cacheDisabled": True})
    # Match the client's backing scale. Arc's forced 1x surface was empty at
    # 1615px; view captures clipped the viewport to the narrower Arc window.
    native_scale = send("Runtime", "evaluate", {"expression": "window.devicePixelRatio", "returnByValue": True})["result"]["value"]
    send("Page", "bringToFront", {})
    for name, width, height, theme, layout, touch, reduced, disabled, screenshot in cases:
        send("Emulation", "setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": native_scale, "mobile": touch})
        send("Emulation", "setTouchEmulationEnabled", {"enabled": touch, "maxTouchPoints": 1})
        send("Emulation", "setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce" if reduced else "no-preference"}]})
        browser.goto(base + f"?theme={theme}&layout={layout}" + ("&disabled=1" if disabled else "") + ("&long=1" if name == "long-draft" else "") + (f"&split={name.removeprefix('split-send-')}" if name.startswith('split-send-') else ""))
        send("Page", "bringToFront", {})
        result = send("Runtime", "evaluate", {"expression": "(async()=>{const deadline=performance.now()+5000;while(!window.fixture?.ready){if(performance.now()>deadline)throw new Error('fixture did not become ready');await new Promise(r=>setTimeout(r,50));}return await window.fixture.check();})()", "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in result:
            error = result["exceptionDetails"].get("exception", {}).get("description", "browser assertion failed")
            raise AssertionError(f"{name}: {error}")
        value = result["result"]["value"]
        if value["theme"] != theme or value["mode"] != layout or value["viewport"] != [width, height]:
            raise AssertionError(f"{name}: fixture state does not match the requested case")
        value["name"] = name
        send("Runtime", "evaluate", {"expression": "window.fixture.originalInput.focus()", "returnByValue": True})
        for kind in ("keyDown", "keyUp"):
            send("Input", "dispatchKeyEvent", {"type": kind, "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
        keyboard = send("Runtime", "evaluate", {"expression": "document.activeElement.getAttribute('aria-label')==='Prompt actions' && document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2", "returnByValue": True})
        if keyboard["result"].get("value") is not True:
            raise AssertionError(f"{name}: native keyboard order and focus ring")
        value["passed"].append("actual Tab navigation preserves native order and visible focus")
        value["checks"] += 1
        if globals().get("skip_screenshots"):
            value["screenshotsSkipped"] = True
        results.append(value)
        print(f"PASS {name}: {value['checks']} checks; {width}x{height}")
        if screenshot and not globals().get("skip_screenshots"):
            send("Runtime", "evaluate", {"expression": "(async()=>{scrollTo(0,0);document.querySelector('.thread').scrollTop=0;document.activeElement.blur();await new Promise(r=>setTimeout(r,200));})()", "awaitPromise": True, "returnByValue": True})
            capture = send("Page", "captureScreenshot", {"format": "png", "captureBeyondViewport": False, "fromSurface": True})
            png = base64.b64decode(capture["data"], validate=True)
            if len(png) < 33 or not png.startswith(b"\x89PNG\r\n\x1a\n") or not png.endswith(b"\x00\x00\x00\x00IEND\xaeB\x60\x82"):
                raise AssertionError(f"{name}: screenshot returned no complete PNG")
            pixels = struct.unpack(">II", png[16:24])
            expected_pixels = (round(width * native_scale), round(height * native_scale))
            if pixels != expected_pixels:
                raise AssertionError(f"{name}: screenshot dimensions {pixels} do not match {expected_pixels}")
            value["capture"] = {"file": screenshot, "method": "surface", "pixels": pixels, "pixelScale": native_scale, "sha256": hashlib.sha256(png).hexdigest()}
            (evidence / screenshot).write_bytes(png)
            package = Path(__file__).resolve().parents[1]
            sources = {path: hashlib.sha256((package / path).read_bytes()).hexdigest() for path in ("dist/app.js", "dist/app.css", "tests/preview.html", "tests/browser-checks.js", "tests/browser-matrix.py", "tests/browser-checks.sh", "tests/fixture-shine.svg")}
            (evidence / (screenshot + ".provenance.json")).write_text(json.dumps({"synthetic": True, "case": name, "viewport": [width, height], "capture": value["capture"], "sources": sources}, indent=2))
finally:
    send("Emulation", "clearDeviceMetricsOverride", {})
    send("Emulation", "setTouchEmulationEnabled", {"enabled": False})
    send("Emulation", "setEmulatedMedia", {"features": []})
    browser.goto(base)
    send("Network", "setCacheDisabled", {"cacheDisabled": False})
(evidence / ("split-send-checks.json" if requested else "browser-checks.json")).write_text(json.dumps(results, indent=2))
print(f"Total: {len(results)} cases, {sum(r['checks'] for r in results)} checks")
print("COMPOSE_CHAT_BROWSER_MATRIX_PASSED")
