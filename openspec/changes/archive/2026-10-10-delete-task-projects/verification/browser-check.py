import json
import os
import time
from pathlib import Path
FLOWS_ONLY = os.getenv('BB_PREVIEW_FLOWS_ONLY') == '1'

TARGET = 'DDABB2B9648C2B732706C41BE1B0CBDA'
OUT = Path('openspec/changes/delete-task-projects/verification')
OUT.mkdir(parents=True, exist_ok=True)
switch_tab(TARGET)

def wait_js(expression):
    end = time.monotonic() + 6
    while time.monotonic() < end:
        if js(expression):
            return
        time.sleep(.05)
    raise AssertionError(expression)

def reset(width=1000, panel=640, light=False):
    cdp('Emulation.setDeviceMetricsOverride', width=width, height=900, deviceScaleFactor=1, mobile=False)
    cdp('Emulation.setTouchEmulationEnabled', enabled=width < 640, **({'maxTouchPoints': 5} if width < 640 else {}))
    url = 'http://127.0.0.1:4179/project-settings-preview/table.html?check=' + str(time.monotonic_ns())
    goto_url(url)
    wait_for_load()
    wait_js('location.href === ' + json.dumps(url))
    wait_js(r'!!document.querySelector("[aria-label=\"Delete HOME\"]") && !document.querySelector("[aria-label=\"Delete HOME\"]").disabled')
    js('document.documentElement.classList.toggle("light", ' + json.dumps(light) + '); document.getElementById("panel").style.width = ' + json.dumps(str(panel) + 'px'))

def control(name):
    js('document.getElementById(' + json.dumps(name) + ').click()')

def button():
    return js('Array.from(document.querySelectorAll("[role=dialog] button")).find(b => /Delete project and tasks|Deleting/.test(b.textContent))?.disabled')

def open_dialog():
    if FLOWS_ONLY:
        js(r'document.querySelector("[aria-label=\"Delete HOME\"]").click()')
    else:
        js(r'document.querySelector("[aria-label=\"Cancel HOME\"]").focus()')
        press_key('Tab')
        wait_js('document.activeElement.getAttribute("aria-label") === "Delete HOME"')
        wait_js('!!document.querySelector("[role=tooltip]")')
        assert js('document.querySelector("[role=tooltip]").textContent') == 'Delete HOME'
        press_key(' ')
    wait_js('!!document.querySelector("[role=dialog] input")')
    wait_js('document.activeElement.textContent === "Cancel"')
    assert button() is True

def match_prefix():
    js('document.querySelector("[role=dialog] input").focus()')
    type_text('home')
    assert button() is True
    js('document.activeElement.select()')
    press_key('Backspace')
    type_text('HOME')
    wait_js('Array.from(document.querySelectorAll("[role=dialog] button")).some(b => b.textContent === "Delete project and tasks" && !b.disabled)')
    assert js('JSON.parse(document.getElementById("evidence").textContent).deleteCalls') == 0

def geometry():
    return js('''(() => {
      const dialog = document.querySelector('[role=dialog]');
      const status = dialog?.querySelector('[role=status]');
      const retained = status?.nextElementSibling;
      const action = Array.from(dialog?.querySelectorAll('button') ?? []).find(b => /Delete project and tasks|Deleting/.test(b.textContent));
      const box = el => el ? {x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height} : null;
      return {
        viewport: {width: innerWidth, height: innerHeight},
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        table: box(document.querySelector('.project-settings-section')),
        icons: Array.from(document.querySelectorAll('.project-row-actions button')).map(b => ({name: b.getAttribute('aria-label'), ...box(b)})),
        action: box(action),
        copy: status?.textContent,
        font: status ? {size: getComputedStyle(status).fontSize, descriptionSize: getComputedStyle(status.parentElement).fontSize, family: getComputedStyle(status).fontFamily, controlFamilies: Array.from(dialog.querySelectorAll('input, button')).map(e => getComputedStyle(e).fontFamily), lineHeight: getComputedStyle(status).lineHeight, color: getComputedStyle(status).color} : null,
        paragraphGap: status && retained ? retained.getBoundingClientRect().top - status.getBoundingClientRect().bottom : null,
      };
    })()''')

report = json.loads((OUT / 'browser-evidence.json').read_text()) if FLOWS_ONLY else []
for name, width, panel, light in ([] if FLOWS_ONLY else [
    ('desktop-dark', 1000, 640, False),
    ('desktop-light', 1000, 640, True),
    ('narrow-panel-dark', 1000, 320, False),
    ('mobile-light', 375, 375, True),
]):
    reset(width, panel, light)
    ready = geometry()
    assert not ready['pageOverflow'], ready
    assert all(b['width'] >= 36 and b['height'] >= 36 for b in ready['icons']), ready
    capture_screenshot(str(OUT / (name + '-rows.png')), max_dim=1800)
    open_dialog()
    match_prefix()
    state = geometry()
    assert 'all 42 tasks' in state['copy'], state
    assert not state['pageOverflow'], state
    assert state['font']['size'] == state['font']['descriptionSize'], state
    assert all(f == state['font']['family'] for f in state['font']['controlFamilies']), state
    assert abs(state['paragraphGap'] - 8) < .1, state
    capture_screenshot(str(OUT / (name + '-confirmation.png')), max_dim=1800)
    press_key('Escape')
    wait_js('!document.querySelector("[role=dialog]")')
    wait_js('document.activeElement.getAttribute("aria-label") === "Delete HOME"')
    report.append({'case': name, 'ready': ready, 'confirmation': state, 'keyboard': 'Tab, Space, native input and Escape; Cancel focus and trigger focus return verified'})
    (OUT / 'browser-evidence.json').write_text(json.dumps(report, indent=2))

# Supplemental flows use rendered DOM controls. Native input after mode switches was unreliable.
FLOWS_ONLY = True
reset()
control('zero-tasks')
open_dialog()
match_prefix()
assert 'all 0 tasks' in geometry()['copy']
js('Array.from(document.querySelectorAll("[role=dialog] button")).find(b => b.textContent === "Cancel").click()')
wait_js('!document.querySelector("[role=dialog]")')
control('fail-count')
open_dialog()
wait_js('!!document.querySelector("[role=dialog] [role=alert]")')
assert button() is True
js('Array.from(document.querySelectorAll("[role=dialog] button")).find(b => b.textContent === "Retry task count").click()')
wait_js('document.querySelector("[role=dialog] [role=status]").textContent.includes("all 0 tasks")')
assert button() is True
match_prefix()
js('Array.from(document.querySelectorAll("[role=dialog] button")).find(b => b.textContent === "Cancel").click()')
wait_js('!document.querySelector("[role=dialog]")')
report.append({'case': 'zero-and-count-retry', 'passed': True})

for flow in ['fail-post-delete', 'overlap-delete']:
    reset(375, 375, False)
    control(flow)
    js(r'document.querySelector("[aria-label=\"Project name for WORK\"]").focus()')
    js('document.activeElement.select()')
    type_text('Surviving browser draft')
    open_dialog()
    match_prefix()
    before = geometry()['action']
    js('Array.from(document.querySelectorAll("[role=dialog] button")).find(b => b.textContent === "Delete project and tasks").click()')
    wait_js('!!document.querySelector("[role=dialog] button[aria-busy=true]")')
    pending = geometry()['action']
    assert before == pending, (before, pending)
    js('document.querySelector("[role=dialog]").dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}))')
    assert js('!!document.querySelector("[role=dialog]")')
    assert js('document.querySelector("[role=dialog] input").disabled') is True
    wait_js('!document.querySelector("[role=dialog]")')
    wait_js(r'!document.querySelector("[aria-label=\"Delete HOME\"]")')
    assert js(r'document.querySelector("[aria-label=\"Project name for WORK\"]").value') == 'Surviving browser draft'
    if flow == 'fail-post-delete':
        wait_js('!!document.querySelector(".project-inventory-error")')
        control('allow-inventory')
        js('Array.from(document.querySelectorAll(".project-inventory-error button")).find(b => b.textContent === "Retry").click()')
        wait_js('!document.querySelector(".project-inventory-error")')
    else:
        time.sleep(1.7)
    assert not js(r'!!document.querySelector("[aria-label=\"Delete HOME\"]")')
    assert js('JSON.parse(document.getElementById("evidence").textContent).deleteCalls') == 1
    report.append({'case': flow, 'passed': True, 'pendingButton': pending, 'draftPreserved': True})

cdp('Emulation.clearDeviceMetricsOverride')
cdp('Emulation.setTouchEmulationEnabled', enabled=False)
(OUT / 'browser-evidence.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'cases': len(report), 'passed': True, 'evidence': str(OUT / 'browser-evidence.json'), 'screenshots': str(OUT)}))
