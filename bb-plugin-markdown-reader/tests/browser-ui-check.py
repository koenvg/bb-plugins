"""User UI corrections through the registered Reader fixture, never native acceptance."""
import argparse
import hashlib
import json
import urllib.request
from pathlib import Path
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173')
parser.add_argument('--out', required=True)
parser.add_argument('--reproduce', action='store_true')
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(args.url, timeout=5) as response:
    assert response.status == 200

RESET = 'ol,ul,menu { list-style:none; padding:0; margin:0; }'
MEASURE = """root => {
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const lists=[...root.querySelectorAll('.mr-prose ol,.mr-prose ul')].map(e=>({
    tag:e.tagName,start:e.start??null,nested:!!e.closest('li'),type:getComputedStyle(e).listStyleType,
    indent:parseFloat(getComputedStyle(e).paddingLeft),footnote:!!e.closest('[data-footnotes]'),
    items:[...e.children].map(li=>({task:li.classList.contains('task-list-item'),type:getComputedStyle(li).listStyleType,
      display:getComputedStyle(li).display,disabled:li.querySelector('input[type="checkbox"]')?.disabled??null}))
  }));
  const toolbar=root.querySelector('.mr-toolbar'), identity=root.querySelector('.mr-identity');
  const view=root.querySelector('.mr-view-controls'), actions=root.querySelector('.mr-reader-actions');
  return {width:root.clientWidth,scrollWidth:root.scrollWidth,documentWidth:document.documentElement.scrollWidth,
    viewport:innerWidth,toolbar:rect(toolbar),identity:identity?rect(identity):null,
    fullPath:identity?.getAttribute('aria-label'),title:identity?.title,
    filename:root.querySelector('.mr-filename')?.textContent,
    filenameSize:root.querySelector('.mr-filename')?getComputedStyle(root.querySelector('.mr-filename')).fontSize:null,
    directorySize:root.querySelector('.mr-path')?getComputedStyle(root.querySelector('.mr-path')).fontSize:null,
    view:rect(view),actions:actions?rect(actions):null,
    outlineBackground:root.querySelector('button[aria-pressed="true"]')&&[...toolbar.querySelectorAll('button')].find(b=>b.textContent==='Outline')?getComputedStyle([...toolbar.querySelectorAll('button')].find(b=>b.textContent==='Outline')).backgroundColor:null,
    buttons:[...toolbar.querySelectorAll('button')].map(b=>({name:b.textContent,...rect(b)})), lists,
    outsideType:getComputedStyle(document.querySelector('#outside-list')).listStyleType};
}"""
cases = [(760,'light',760,1,'reproduction')] if args.reproduce else [
    (w,t,w,1,f'{w}-{t}') for w in (390,760,1440) for t in ('light','dark')]
if not args.reproduce:
    cases += [(390,'light',1440,1,'narrow-in-wide'),(760,'light',760,2,'zoom-200')]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    try:
        for width,theme,viewport,zoom,name in cases:
            page=browser.new_page(viewport={'width':viewport,'height':1000})
            errors=[]
            page.on('pageerror',lambda e: errors.append(str(e)))
            path='reports/'+'directory-segment/'*8+'actual-document-name.md'
            query=urlencode({'width':width,'theme':theme,'document':'lists','path':path})
            page.goto(args.url+'/tests/presentation-preview.html?'+query)
            reader=page.get_by_role('region',name='Markdown Reader',exact=True)
            reader.get_by_role('heading',name='Visible list markers').wait_for()
            page.add_style_tag(content=RESET)
            page.evaluate("""() => { const outside=document.createElement('ul');outside.id='outside-list';outside.innerHTML='<li>Outside marker sentinel</li>';outside.style.display='none';document.body.append(outside); }""")
            if zoom != 1:
                page.evaluate('z=>document.documentElement.style.zoom=String(z)',zoom)
            measured=reader.evaluate(MEASURE)
            results.append({'case':name,'fixtureOnly':True,'hostReset':RESET,'zoom':zoom,'computed':measured})
            (out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
            if args.reproduce:
                page.screenshot(path=str(out/'missing-markers.png'))
            for item in measured['lists']:
                expected='decimal' if item['tag']=='OL' else 'circle' if item['nested'] else 'disc'
                assert item['type']==expected,item
                assert item['indent']>=24,item
                for li in item['items']:
                    assert li['display']=='list-item',li
                    assert li['type']==('none' if li['task'] else expected),li
                    if li['task']:
                        assert li['disabled'] is True,li
            assert any(x['start']==7 for x in measured['lists'])
            assert any(x['start']==12 for x in measured['lists'])
            assert any(x['footnote'] and x['type']=='decimal' for x in measured['lists'])
            assert measured['outsideType']=='none'
            assert measured['scrollWidth']==measured['width'],measured
            assert measured['documentWidth']<=viewport,measured
            assert measured['fullPath']==measured['title']==path,measured
            assert measured['filename']=='actual-document-name.md',measured
            assert float(measured['filenameSize'][:-2])>float(measured['directorySize'][:-2]),measured
            assert [b['name'] for b in measured['buttons']]==['Preview','Raw','Outline','Refresh'],measured
            assert measured['outlineBackground']=='rgba(0, 0, 0, 0)',measured
            if measured['width']<=600:
                assert measured['identity']['bottom']<=measured['view']['y'],measured
            else:
                assert abs(measured['identity']['y']+measured['identity']['height']/2-measured['view']['y']-measured['view']['height']/2)<2,measured
            assert measured['actions']['x']-measured['view']['right']>=16 or measured['actions']['y']>=measured['view']['bottom'],measured
            for b in measured['buttons']:
                assert b['height']>=36*zoom and b['x']>=measured['toolbar']['x'] and b['right']<=measured['toolbar']['right']+1,measured
            preview=reader.get_by_role('button',name='Preview',exact=True)
            preview.focus()
            page.keyboard.press('Tab')
            assert reader.get_by_role('button',name='Raw',exact=True).evaluate("e=>e===document.activeElement&&e.matches(':focus-visible')")
            page.keyboard.press('Space')
            assert reader.get_by_label('Raw Markdown').text_content()==page.evaluate('presentationFixture.text')
            assert len([c for c in page.evaluate('presentationFixture.inspection.rpcCalls') if c['method']=='read_document'])==1
            page.keyboard.press('Tab')
            assert reader.get_by_role('button',name='Refresh',exact=True).evaluate('e=>e===document.activeElement')
            preview.click()
            file=out/(name+'.png')
            page.screenshot(path=str(file))
            results[-1].update({'capture':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'rawExact':True,'focusOrder':True,'pageErrors':errors})
            assert not errors,errors
            page.close()
    finally:
        browser.close()
(out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
print(f'{len(results)} host-reset list/header cases passed. Fixture-only; no native opening claim.')
