"""Owned synthetic preview. No user profile, live host or non-local traffic."""
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/bbp22-evidence');out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page(viewport={'width':1280,'height':1100})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:38722/') else r.abort())
    page.goto('http://127.0.0.1:38722/',wait_until='networkidle')
    page.get_by_text('Historical import',exact=True).click()
    page.get_by_text('Import stopped.',exact=False).wait_for()
    for width,height in [(1280,1100),(375,812)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.get_by_role('button',name='Resume import',exact=True).focus()
        page.keyboard.press('Enter')
        page.wait_for_function("document.body.dataset.action === 'resume'")
        assert page.get_by_role('button',name='Start import',exact=True).is_disabled()
        assert page.get_by_role('textbox',name='BB Pi source root',exact=True).is_disabled()
        page.get_by_role('link',name='Open Codex Usage ↗').focus()
        assert page.get_by_role('link',name='Open Codex Usage ↗').evaluate('e=>e===document.activeElement')
        page.screenshot(path=str(out/f'early-{width}.png'),full_page=True)
    assert not errors,errors
    browser.close()
print('Synthetic desktop/375px import: controls wrap, no page overflow, frozen scope readable, keyboard Resume and official link reachable. No installed acceptance.')
