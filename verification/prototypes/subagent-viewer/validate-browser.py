"""Run with: browser-use < verification/prototypes/subagent-viewer/validate-browser.py
Requires the task-owned target created for this prototype. Does not open other tabs.
"""
import base64
import json
import os
from pathlib import Path

TARGET = os.environ['PROTOTYPE_TARGET']
ROOT = Path.cwd() / 'verification/prototypes/subagent-viewer'
switch_tab(TARGET)
goto_url(ROOT.joinpath('index.html').as_uri())
wait_for_load()
cdp('Emulation.setTouchEmulationEnabled', enabled=False)
checks = []
js("window.__viewerErrors=[];addEventListener('error',event=>window.__viewerErrors.push(event.message));addEventListener('unhandledrejection',event=>window.__viewerErrors.push(String(event.reason)))")

def check(label, expression):
    result = js(expression)
    if result is not True:
        raise AssertionError(f'{label}: {result}')
    checks.append(label)

def select_control(control, value):
    js(f"document.getElementById('{control}').value = '{value}'; document.getElementById('{control}').dispatchEvent(new Event('change', {{bubbles:true}}))")

def choose(run):
    js(f"document.querySelector('[data-run=\"{run}\"]').click()")
    check('Selected run remains visible', "(() => { const list=document.querySelector('#run-list').getBoundingClientRect(); const row=[...document.querySelectorAll('[data-run]')].find(el => el.getAttribute('aria-pressed') === 'true').getBoundingClientRect(); return row.top >= list.top && row.bottom <= list.bottom; })()")

def set_theme(theme):
    if js("document.documentElement.dataset.theme || 'light'") != theme:
        js("document.querySelector('#theme').click()")

set_theme('dark')
check('Theme toggle keeps a stable name and accurate dark-mode state', "document.querySelector('#theme').textContent === 'Dark theme' && document.querySelector('#theme').getAttribute('aria-pressed') === 'true' && document.documentElement.dataset.theme === 'dark'")
set_theme('light')
check('Light mode exposes an unpressed Dark theme toggle', "document.querySelector('#theme').textContent === 'Dark theme' && document.querySelector('#theme').getAttribute('aria-pressed') === 'false'")
check('Four selectable sample runs', "document.querySelectorAll('[data-run]').length === 4")
check('Completed run exposes model and total duration', "document.querySelector('#detail-header').textContent.includes('GPT-5.4') && document.querySelector('#detail-header').textContent.includes('1m 42s')")
check('Tool calls initially collapsed', "[...document.querySelectorAll('#transcript .tool')].every(tool => !tool.open)")
js("document.querySelector('#transcript .tool summary').click()")
check('Tool output expands', "document.querySelector('#transcript .tool').open && document.querySelector('#transcript pre').textContent.includes('Read the run list')")
js("document.querySelector('#transcript').scrollTo({top:180,behavior:'instant'});window.__readingTop=document.querySelector('#transcript').scrollTop")
check('Reading-position fixture is scrolled', "window.__readingTop > 0")
js("document.querySelector('[data-run=\"review-viewer\"]').click()")
check('Reselecting the current run preserves reading position and open tools', "document.querySelector('#transcript').scrollTop === window.__readingTop && document.querySelector('#transcript .tool').open")
cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}])
js("document.querySelector('#snapshot-footer').open=true")
check('Open capture details show a downward chevron', "(() => {const transform=getComputedStyle(document.querySelector('#snapshot-chevron svg')).transform;if(transform==='none')return false;const matrix=new DOMMatrixReadOnly(transform);return Math.round(matrix.a)===0 && Math.round(matrix.b)===1;})()")
js("document.querySelector('#snapshot-footer').open=false")
check('Closed capture details restore the rightward chevron', "getComputedStyle(document.querySelector('#snapshot-chevron svg')).transform === 'none'")
cdp('Emulation.setEmulatedMedia',features=[])
js("document.querySelector('[data-run]').focus()")
cdp('Input.dispatchKeyEvent', type='keyDown', key='ArrowDown', code='ArrowDown')
cdp('Input.dispatchKeyEvent', type='keyUp', key='ArrowDown', code='ArrowDown')
check('Arrow navigation selects and focuses next run', "document.activeElement.dataset.run === 'inspect-capture' && document.activeElement.getAttribute('aria-pressed') === 'true'")
check('Running time is explicitly at capture', "document.querySelector('#detail-header').textContent.includes('Elapsed at capture') && document.querySelector('#detail-header').textContent.includes('not a live feed') && document.querySelector('#jump').disabled")
cdp('Input.dispatchKeyEvent', type='keyDown', key='End', code='End')
cdp('Input.dispatchKeyEvent', type='keyUp', key='End', code='End')
check('End selects final run', "document.activeElement.dataset.run === 'partial-review'")
check('Incomplete capture preserves completion and missing values', "document.querySelector('#detail-header').textContent.includes('Complete') && document.querySelector('#detail-header').textContent.includes('Unavailable') && document.querySelector('#transcript').textContent.includes('Final output not captured') && document.querySelector('#jump').disabled")
choose('check-tests')
check('Execution failure differs from capture failure', "document.querySelector('#transcript').textContent.includes('Execution failed') && document.querySelector('#transcript').textContent.includes('not a capture failure')")
select_control('scenario', 'error')
check('Capture error keeps selected transcript', "document.querySelector('#transcript').textContent.includes('Capture refresh failed') && document.querySelector('#transcript').textContent.includes('No tests ran')")
select_control('scenario', 'loading')
check('Loading hides stale headers and final-output action', "document.querySelector('#detail-header').hidden && getComputedStyle(document.querySelector('#conversation-toolbar')).display === 'none' && document.querySelector('#transcript').textContent.includes('Loading captured runs')")
select_control('scenario', 'empty')
check('Empty state explains where runs appear', "document.querySelector('#transcript').textContent.includes('No subagent runs captured') && document.querySelector('#run-list').hidden")
select_control('scenario', 'captured')
choose('review-viewer')
check('Parent and child share message structure', "!!document.querySelector('#parent-content .message.user .message-body') && !!document.querySelector('#transcript .message.user .message-body')")
check('Captured final output enables jump', "!document.querySelector('#jump').disabled")
js("document.querySelector('#jump').click()")
check('Sample HTML is escaped', "escape('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;'")
check('Core viewer interactions produce no runtime errors', "window.__viewerErrors.length === 0")

layouts = []
for width, height in [(1280,900), (820,900), (520,900), (390,844), (320,700)]:
    cdp('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=False)
    for scenario in ['captured', 'error', 'loading', 'empty']:
        select_control('scenario', scenario)
        for run in (['review-viewer', 'inspect-capture', 'partial-review'] if scenario in ['captured', 'error'] else [None]):
            if run:
                choose(run)
            if run:
                collapsed_height = js("document.querySelector('#transcript').clientHeight")
                js("document.querySelector('#snapshot-footer').open = true")
                expanded_height = js("document.querySelector('#transcript').clientHeight")
                if expanded_height != collapsed_height:
                    raise AssertionError('Expanding capture details changed the conversation viewport height')
                check('Capture details stay inside the conversation scroll area', "document.querySelector('#transcript').contains(document.querySelector('#snapshot-footer'))")
            layout = js("({pageOverflow:document.documentElement.scrollWidth > innerWidth, transcriptHeight:document.querySelector('#transcript').clientHeight, transcriptOverflow:document.querySelector('#transcript').scrollWidth > document.querySelector('#transcript').clientWidth})")
            layouts.append({'width':width, 'height':height, 'scenario':scenario, 'run':run, **layout})
            if layout['pageOverflow'] or layout['transcriptOverflow'] or layout['transcriptHeight'] < 100:
                print(json.dumps({'layout_failure': layouts[-1]}))
                raise AssertionError('Layout overflows or leaves less than 100px to read the conversation')
checks.append('40 viewport, scenario, and run combinations remain readable without horizontal overflow with expanded capture details')

adaptations = []
for coarse in [False, True]:
    for width, height in [(844,390), (640,450), (390,844), (320,700)]:
        for scale in [1, 2]:
            goto_url(ROOT.joinpath('index.html').as_uri())
            wait_for_load()
            cdp('Emulation.setTouchEmulationEnabled', enabled=coarse, maxTouchPoints=1)
            cdp('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=coarse)
            check('Input-mode fixture matches the emulated pointer', f"new Promise(resolve=>setTimeout(()=>resolve(matchMedia('(any-pointer:coarse)').matches === {str(coarse).lower()}),50))")
            select_control('width', 'workspace' if width > 760 else 'panel')
            set_theme('dark' if coarse else 'light')
            if scale == 2:
                js("const sheet=document.querySelector('style'); sheet.textContent=sheet.textContent.replace(/(font-size:\\s*|font:\\s*)(\\d+(?:\\.\\d+)?)px/g, (_,prefix,size)=>`${prefix}${Number(size)*2}px`)")
            for run in ['review-viewer', 'partial-review']:
                js("document.querySelector('#run-picker').open = true")
                select_control('scenario', 'captured' if run == 'review-viewer' else 'error')
                choose(run)
                for picker_open in [True, False]:
                    js(f"document.querySelector('#run-picker').open = {str(picker_open).lower()}; document.querySelector('#snapshot-footer').open = true; document.querySelector('#transcript').scrollIntoView({{block:'end',behavior:'instant'}})")
                    layout = js("(() => {const transcript=document.querySelector('#transcript'); const box=transcript.getBoundingClientRect(); const viewer=document.querySelector('.viewer').getBoundingClientRect(); return {viewerOverflow:document.querySelector('.viewer').scrollWidth > document.querySelector('.viewer').clientWidth, pageOverflow:document.documentElement.scrollWidth > innerWidth, transcriptOverflow:transcript.scrollWidth > transcript.clientWidth, transcriptHeight:transcript.clientHeight, visibleHeight:Math.max(0,Math.min(box.bottom,viewer.bottom,innerHeight)-Math.max(box.top,viewer.top,0))};})()")
                    adaptations.append({'width':width,'height':height,'coarse':coarse,'scale':scale,'run':run,'runsOpen':picker_open,**layout})
                    if layout['viewerOverflow'] or layout['pageOverflow'] or layout['transcriptOverflow'] or layout['visibleHeight'] < 160:
                        print(json.dumps({'adaptation_failure':adaptations[-1]}))
                        raise AssertionError('Conversation cannot be read after scrolling in the adapted layout')
            if coarse:
                check('Coarse input query is active', "matchMedia('(any-pointer:coarse)').matches")
                check('All coarse-pointer controls have 44px targets', "[...document.querySelectorAll('select,button,summary')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.width>=44 && r.height>=44;})")
checks.append('64 short-window, enlarged-text, and input-mode cases keep the conversation accessible')
cdp('Emulation.setTouchEmulationEnabled', enabled=False)
goto_url(ROOT.joinpath('index.html').as_uri())
wait_for_load()

cdp('Emulation.setTouchEmulationEnabled', enabled=False)
cdp('Emulation.setDeviceMetricsOverride', width=844, height=390, deviceScaleFactor=1, mobile=False)
select_control('scenario', 'error')
choose('partial-review')
js("const viewer=document.querySelector('.viewer'); viewer.focus(); viewer.scrollTop=0")
cdp('Input.dispatchKeyEvent', type='keyDown', key='End', code='End', windowsVirtualKeyCode=35)
cdp('Input.dispatchKeyEvent', type='keyUp', key='End', code='End', windowsVirtualKeyCode=35)
check('Outer viewer can scroll to the conversation with the keyboard', "new Promise(resolve=>setTimeout(()=>{const viewer=document.querySelector('.viewer');const t=document.querySelector('#transcript').getBoundingClientRect();const v=viewer.getBoundingClientRect();resolve(document.activeElement===viewer && viewer.scrollTop>0 && Math.min(t.bottom,v.bottom)-Math.max(t.top,v.top)>=160);},300))")
shots = [
    ('desktop-light.png',1280,900,'light','review-viewer','captured','workspace',False,1),
    ('panel-dark.png',520,900,'dark','inspect-capture','captured','panel',False,1),
    ('narrow-incomplete.png',390,844,'light','partial-review','captured','panel',False,1),
    ('narrow-error.png',320,700,'dark','partial-review','error','panel',False,1),
    ('landscape.png',844,390,'light','partial-review','error','workspace',False,1),
    ('large-text.png',390,844,'dark','partial-review','error','panel',True,2),
    ('touch-targets.png',390,844,'light','review-viewer','captured','panel',True,1),
    ('capture-details.png',520,900,'light','partial-review','captured','panel',False,1)
]
for name,width,height,theme,run,scenario,view,coarse,scale in shots:
    goto_url(ROOT.joinpath('index.html').as_uri())
    wait_for_load()
    cdp('Emulation.setTouchEmulationEnabled',enabled=coarse,maxTouchPoints=1)
    cdp('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=coarse)
    js("new Promise(resolve=>setTimeout(resolve,50))")
    if scale == 2:
        js("const sheet=document.querySelector('style'); sheet.textContent=sheet.textContent.replace(/(font-size:\\s*|font:\\s*)(\\d+(?:\\.\\d+)?)px/g, (_,prefix,size)=>`${prefix}${Number(size)*2}px`)")
    set_theme(theme)
    select_control('width',view)
    select_control('scenario',scenario)
    choose(run)
    js("document.querySelector('#snapshot-footer').open = false")
    if name in ['landscape.png', 'large-text.png']:
        js("document.querySelector('#transcript').scrollIntoView({block:'end',behavior:'instant'})")
    if name == 'capture-details.png':
        js("document.querySelector('#snapshot-footer').open=true;document.querySelector('#snapshot-footer').scrollIntoView({block:'end',behavior:'instant'})")
    image = cdp('Page.captureScreenshot',format='png',captureBeyondViewport=False)['data']
    ROOT.joinpath(name).write_bytes(base64.b64decode(image))

goto_url(ROOT.joinpath('index.html').as_uri())
wait_for_load()
cdp('Emulation.setTouchEmulationEnabled',enabled=False)
cdp('Emulation.clearDeviceMetricsOverride')
select_control('width','workspace')
select_control('scenario','captured')
choose('review-viewer')
set_theme('light')
report = {'checks': checks, 'layoutCases':len(layouts), 'adaptationCases':len(adaptations), 'adaptations':adaptations, 'screenshots':[shot[0] for shot in shots], 'target':TARGET}
ROOT.joinpath('browser-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':len(checks),'layoutCases':len(layouts), 'adaptationCases':len(adaptations),'screenshots':report['screenshots']}))
