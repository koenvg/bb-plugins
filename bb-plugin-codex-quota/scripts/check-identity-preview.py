"""Synthetic localhost React UI. No live browser profile, host or network."""
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/bbp19-evidence')
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page(viewport={'width':1280,'height':1100})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:38719/') else r.abort())
    page.goto('http://127.0.0.1:38719/',wait_until='networkidle')
    page.get_by_role('button',name='Open thread thr_exact',exact=True).wait_for()
    for width,height in [(1280,1100),(375,812)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        exact=page.get_by_role('button',name='Open thread thr_exact',exact=True)
        exact.focus()
        page.keyboard.press('Enter')
        assert page.locator('body').get_attribute('data-opened-thread')=='thr_exact'
        archived=page.get_by_role('button',name='Open thread thr_archived',exact=True)
        archived.focus()
        page.keyboard.press('Space')
        assert page.locator('body').get_attribute('data-opened-thread')=='thr_archived'
        assert page.get_by_role('button',name='Open thread thr_deleted',exact=True).count()==0
        assert page.get_by_role('button',name='Open thread thr_missing',exact=True).count()==0
        page.get_by_role('link',name='Open Codex Usage ↗').focus()
        assert page.get_by_role('link',name='Open Codex Usage ↗').evaluate('e=>e===document.activeElement')
        page.screenshot(path=str(out/f'final-{width}-complete.png'),full_page=True)
        page.get_by_role('combobox',name='Codex host').select_option('partial-host')
        page.get_by_text('Identity discovery: partial.',exact=False).wait_for()
        assert page.get_by_role('button',name='Open thread thr_exact',exact=True).count()==0
        assert page.get_by_text('Exact totals are not available until discovery and attribution finish. Workspace totals remain available.').is_visible()
        assert page.get_by_role('heading',name='Selected-host workspace totals').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(out/f'final-{width}-partial.png'),full_page=True)
        page.get_by_role('combobox',name='Codex host').select_option('synthetic-host')
        page.get_by_role('button',name='Open thread thr_exact',exact=True).wait_for()
    assert not errors,errors
    browser.close()
print('Synthetic desktop/375px identity: wrapping, no overflow, keyboard exact/archived navigation callbacks, missing/deleted non-links, partial discovery hides old rows, workspace totals and official quota link retained. No installed acceptance.')
