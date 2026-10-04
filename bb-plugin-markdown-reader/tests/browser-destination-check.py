"""BBP-30 fixture checks. Native opening, RPC and confined GET denial are simulated."""
import argparse
import json
import struct
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4176')
parser.add_argument('--out', required=True)
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

width, height = 1200, 220
pixels = b''.join(b'\x00' + bytes([96, 132, 152]) * width for _ in range(height))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for source in ['workspace', 'host', 'thread-storage']:
        for panel_width, theme in [(1440, 'light'), (760, 'light'), (390, 'dark')]:
            page = browser.new_page(viewport={'width': max(panel_width, 1000), 'height': 850})
            errors, requests = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def image_route(route):
                requests.append({'url': route.request.url, 'headers': route.request.headers})
                if 'escape.png' in route.request.url:
                    route.fulfill(status=403, body='Confined fixture denial')
                else:
                    route.fulfill(status=200, content_type='image/png', body=png)
            page.route('**/api/v1/file-previews/**', image_route)
            page.route('https://images.test/**', image_route)
            page.goto(f'{args.url}/tests/destination-preview.html?source={source}&width={panel_width}&theme={theme}')
            page.get_by_role('link', name='sibling', exact=True).wait_for()
            local = page.get_by_role('img', name='Local picture', exact=True)
            local.scroll_into_view_if_needed()
            page.wait_for_function("[...document.images].find(e => e.alt === 'Local picture')?.naturalWidth === 1200")
            assert local.evaluate('e => e.clientWidth <= e.closest(".mr-prose").clientWidth')
            page.get_by_text('Confined symlink alt', exact=False).wait_for()
            assert page.get_by_role('img', name='Confined symlink alt').count() == 0
            page.get_by_text('Rejected SVG alt', exact=True).wait_for()
            assert page.get_by_role('link', name='script', exact=True).count() == 0
            assert page.get_by_role('link', name='escape', exact=True).count() == 0
            for name in ['sibling', 'web']:
                link = page.get_by_role('link', name=name, exact=True)
                link.focus()
                page.keyboard.press('Enter')
            calls = page.evaluate('window.destinationFixture.inspection.navigateCalls')
            assert calls[0]['method'] == 'experimental_openFilePreview'
            expected = {'kind': 'host', 'hostId': 'remote', 'path': '/notes/next.md'} if source == 'host' else {'kind': source, 'path': 'reports/next.md', **({'environmentId': 'env'} if source == 'workspace' else {'threadId': 'thread'})}
            assert calls[0]['options']['target'] == expected, calls
            assert calls[1] == {'method': 'openUrl', 'url': 'https://example.com/guide'}
            page.get_by_role('link', name='here', exact=True).click()
            assert page.get_by_role('heading', name='Destinations', exact=True).evaluate('e => e === document.activeElement')
            footnote = page.locator('.mr-prose sup a')
            footnote.click()
            assert page.evaluate('document.activeElement?.tagName') == 'LI'
            assert page.evaluate('location.hash') == ''
            assert len(page.evaluate('window.destinationFixture.inspection.navigateCalls')) == 2
            assert page.locator('html').get_attribute('data-fixture-reads') == '1'
            old_src = local.get_attribute('src')
            page.get_by_role('button', name='Raw', exact=True).click()
            assert page.get_by_label('Raw Markdown', exact=True).text_content() == page.evaluate('window.destinationFixture.text')
            page.get_by_role('button', name='Preview', exact=True).click()
            assert page.locator('html').get_attribute('data-fixture-leases') == '1'
            page.get_by_role('button', name='Refresh', exact=True).click()
            page.wait_for_function("document.documentElement.dataset.fixtureLeases === '2'")
            local = page.get_by_role('img', name='Local picture', exact=True)
            assert local.get_attribute('src') != old_src
            local.scroll_into_view_if_needed()
            page.wait_for_function("[...document.images].find(e => e.alt === 'Local picture')?.naturalWidth === 1200")
            remote = page.get_by_role('img', name='Remote picture', exact=True)
            remote.scroll_into_view_if_needed()
            page.wait_for_function("[...document.images].find(e => e.alt === 'Remote picture')?.naturalWidth === 1200")
            assert all('referer' not in r['headers'] for r in requests)
            assert any(r['url'] == 'https://images.test/picture.png' for r in requests)
            assert not any('outside' in r['url'] or 'active.svg' in r['url'] for r in requests)
            page.screenshot(path=str(out / f'{source}-{panel_width}-{theme}.png'))
            page.evaluate('window.destinationFixture.unmount()')
            assert page.locator('.markdown-reader').count() == 0
            assert not errors, errors
            results.append({'source': source, 'width': panel_width, 'theme': theme, 'fixtureOnly': True, 'sourceAwareOpening': True, 'localFragments': True, 'rawExact': True, 'imageSizing': True, 'getDeniedFallback': True, 'sameHashRefresh': True, 'ordinaryRemoteRequest': True, 'unmount': True, 'requests': requests, 'errors': errors})
            page.close()
    browser.close()
(out / 'destination-results.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps({'cases': len(results), 'passed': True, 'fixtureOnly': True}))
