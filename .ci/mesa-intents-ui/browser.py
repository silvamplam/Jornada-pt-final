"""Real React selection/Theme components + real preparation handlers + local SQL.

HTTP transport and Next navigation are explicit IPC/test boundaries. The browser
uses a virtual loopback document fulfilled without a server; socket isolation is
applied by offline.py. No route can visit production. --document-only is a local
fallback for managed browsers which forbid navigation: storage/UUID are doubled
in that mode; CI must omit it and verify native browser sessionStorage/UUID.
"""
import argparse
import json
import os
from pathlib import Path
import re
import select
import subprocess
import sys
import traceback
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser()
p.add_argument('--socket');p.add_argument('--psql',default='psql');p.add_argument('--container')
p.add_argument('--node',default='node');p.add_argument('--chromium');p.add_argument('--output',required=True)
p.add_argument('--document-only',action='store_true')
args=p.parse_args();root=Path(__file__).resolve().parents[2];output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=True)
command=[args.node,str(root/'.ci/mesa-intents-ui/driver.mjs'),'--output',str(output)]
if args.container:command+=['--container',args.container]
else:
    assert args.socket and Path(args.socket).is_absolute()
    command+=['--socket',args.socket,'--psql',args.psql]
stderr=(output/'browser-backend.log').open('w')
backend=subprocess.Popen(command,cwd=root,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr,bufsize=1)
assert json.loads(backend.stdout.readline())=={'ready':True}

def rpc(value):
    backend.stdin.write(json.dumps(value,ensure_ascii=False)+'\n');backend.stdin.flush()
    if not select.select([backend.stdout],[],[],30)[0]:raise RuntimeError('Offline backend IPC timeout')
    line=backend.stdout.readline()
    result=json.loads(line)
    if not result.get('ok'):raise AssertionError(result.get('error',line))
    return result['value']

STORAGE='jornada.mesa.preparation.v2'
reports=[];errors=[];external=[];page=None;context=None

def report():
    (output/'browser-report.json').write_text(json.dumps({
        'passed':sum(t['passed'] for t in reports),'failed':sum(not t['passed'] for t in reports),
        'tests':reports,'pageErrors':errors,'unexpectedNetwork':external,
        'nativeBrowserStorage':not args.document_only,'nativeBrowserUUID':not args.document_only,
        'boundaries':['Next router records requested URL; target workspace is not rendered',
                      'fetch IPC invokes actual route handlers and PostgreSQL; no HTTP server',
                      'publication helper, not publication UI, used to set up later receipt reads'],
    },ensure_ascii=False,indent=2))

with sync_playwright() as playwright:
    launch={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    if args.chromium:launch['executable_path']=args.chromium
    browser=playwright.chromium.launch(**launch)
    def start(mode='selection',openPanel=True,**kw):
        global page,context
        if context:context.close()
        fixture=rpc({'kind':'setup',**kw})
        context=browser.new_context(viewport={'width':1440,'height':1100},locale='pt-PT',timezone_id='Europe/Lisbon',service_workers='block')
        def route(r):
            if r.request.url=='http://127.0.0.1:4319/':r.fulfill(status=200,content_type='text/html',body='<html><head></head><body><div id="root"></div></body></html>')
            else:external.append(r.request.url);r.abort()
        context.route('**/*',route)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.expose_function('__http',lambda request:rpc({'kind':'http','request':request}))
        if args.document_only:
            page.set_content('<html><head></head><body><div id="root"></div></body></html>')
            page.evaluate("""() => {
              const map=new Map();
              Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),clear:()=>map.clear()}});
              if(!crypto.randomUUID)crypto.randomUUID=()=> '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
            }""")
        else:page.goto('http://127.0.0.1:4319/')
        page.add_style_tag(content=(output/'browser.css').read_text())
        page.add_script_tag(content=(output/'browser.js').read_text())
        page.evaluate('(v)=>sessionStorage.setItem(v.key,JSON.stringify(v.buffer))',{'key':STORAGE,'buffer':fixture['buffer']})
        page.evaluate('(v)=>window.__mount(v.fixture,v.mode)',{'fixture':fixture,'mode':mode})
        if mode=='selection':
            tray=page.locator('section[aria-labelledby="mesa-selection-title"]')
            expect(tray).to_be_visible()
            if openPanel:
                page.get_by_role('button',name='Ver seleção',exact=True).click()
                expect(page.get_by_label('Seleção e trabalho de Produção',exact=True)).to_be_visible()
        if mode=='theme':
            expect(page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True)).to_have_value('new' if kw.get('published')==0 or kw.get('draft') else 'review')
        elif mode=='selection' and openPanel:
            expect(page.get_by_label('Novos artigos da seleção',exact=True)).to_be_visible()
            assert page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True).count()==0
        return fixture
    def theme_mode(value):page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True).select_option(value)
    def submit():page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True).click()
    def prepared():
        submit();page.wait_for_function('window.__navigations.length === 1',timeout=10000)
        url=page.evaluate('window.__navigations[0]');assert re.fullmatch('/admin/editorial/redacao-automatica/mesa/producao/[a-f0-9-]{36}',url)
        did=url.split('/')[-1]
        state=rpc({'kind':'state'})
        return next(p['frozen_plan'] for p in state['preparations'] if p['dossier_id']==did)
    def stored():return page.evaluate('(key)=>JSON.parse(sessionStorage.getItem(key)||"null")',STORAGE)
    def test(name,fn):
        start_errors=len(errors);start_external=len(external)
        try:
            fn();assert len(errors)==start_errors,errors[start_errors:];assert len(external)==start_external,external[start_external:]
            reports.append({'name':name,'passed':True});print('PASS',name,flush=True)
        except Exception:
            reports.append({'name':name,'passed':False,'error':traceback.format_exc()})
            if page:
                page.screenshot(path=str(output/'browser-failure.png'),full_page=True)
                (output/'browser-failure.txt').write_text(page.locator('body').inner_text())
            report();raise
        report()
    def compact_selection_does_not_consume_workspace():
        heights=[]
        for options in ({'sourceOnly':True},{},{'extra':True}):
            start(openPanel=False,**options)
            tray=page.locator('section[aria-labelledby="mesa-selection-title"]')
            assert page.get_by_label('Seleção e trabalho de Produção',exact=True).count()==0
            box=tray.bounding_box();assert box
            heights.append(box['height'])
            assert box['height']<=100,box
        assert max(heights)-min(heights)<=2,heights
        start(extra=True,openPanel=False)
        tray=page.locator('section[aria-labelledby="mesa-selection-title"]')
        before=tray.bounding_box()['height']
        page.get_by_role('button',name='Ver seleção',exact=True).click()
        panel=page.get_by_label('Seleção e trabalho de Produção',exact=True)
        expect(panel).to_be_visible()
        assert page.evaluate('(el)=>getComputedStyle(el).position',panel.element_handle())=='fixed'
        after=tray.bounding_box()['height']
        assert abs(after-before)<=1,(before,after)
        expect(page.get_by_label('Novos artigos da seleção',exact=True)).to_have_value('2')
        assert page.get_by_text('Material selecionado · 1 Tema · 2 fontes soltas',exact=True).count()==1
        assert page.get_by_text('Destino desta fonte',exact=True).count()==0
        action=page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True)
        expect(action).to_be_visible()
        action_box=action.bounding_box();panel_box=panel.bounding_box();assert action_box and panel_box
        assert action_box['y']+action_box['height']<=panel_box['y']+panel_box['height']+1

    def mixed():
        f=start();page.screenshot(path=str(output/'selection-mixed.png'),full_page=True)
        expect(page.get_by_label('Novos artigos da seleção',exact=True)).to_have_value('1')
        plan=prepared();assert len(plan['outputs'])==2 and len(plan['contexts'])==1
        selected=plan['contexts'][0];assert selected['kind']=='selection'
        assert {x['newsroomArticleId'] for x in selected['sources']}=={f['material']['id'],f['loose']['id']}
        assert [o['kind'] for o in plan['outputs']]==['existing','new']
        assert plan['outputs'][0]['target']['matchdayId'] is None
        saved=stored();assert not saved['sources'] and not saved.get('themes')
    def counts(mode,new,review):
        start('theme',independent=False);theme_mode(mode)
        page.get_by_label('Novos artigos do Tema Milan / Amorim',exact=True).fill(str(new))
        plan=prepared();assert plan['totals']['reviews']==review and plan['totals']['newArticles']==new
    def whole_theme():
        start('theme',independent=False);plan=prepared();assert len(plan['contexts'])==1 and len(plan['outputs'])==1
        assert plan['request']['sources']==[]
    def without_published(draft=False):
        start('theme',published=1 if draft else 0,draft=draft,independent=False)
        options=page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True).locator('option').all_text_contents()
        assert not any('revisão' in s.lower() for s in options)
        assert all(o['kind']=='new' for o in prepared()['outputs'])
    def combined_consumes_theme_and_source():
        f=start();plan=prepared()
        assert len(plan['contexts'])==1 and plan['contexts'][0]['kind']=='selection'
        saved=stored();assert not saved['sources'] and not saved.get('themes')
    def selection_cardinality():
        f=start(sourceOnly=True,extra=True)
        expect(page.get_by_label('Novos artigos da seleção',exact=True)).to_have_value('2')
        page.get_by_label('Novos artigos da seleção',exact=True).fill('4')
        plan=prepared()
        assert len(plan['contexts'])==1 and plan['contexts'][0]['kind']=='selection'
        assert len(plan['contexts'][0]['sources'])==2 and plan['totals']['newArticles']==4
        assert len(plan['outputs'])==4
    def selection_does_not_organize():
        f=start(extra=True)
        before=rpc({'kind':'state'})['memberships']
        plan=prepared()
        assert next(c for c in plan['contexts'] if c['kind']=='selection')
        after=rpc({'kind':'state'})['memberships']
        assert after==before
    def only_source():
        f=start(sourceOnly=True);plan=prepared()
        assert len(plan['outputs'])==1 and plan['contexts'][0]['kind']=='selection'
        assert {s['newsroomArticleId'] for s in plan['contexts'][0]['sources']}=={f['loose']['id']}
    def lost_response():
        f=start();rpc({'kind':'faults','value':{'loseResponse':True}});submit()
        expect(page.get_by_role('status').filter(has_text='Resposta perdida')).to_be_visible()
        assert len(rpc({'kind':'state'})['preparations'])==f['before']+1
        assert len(stored()['sources'])==1 and len(stored()['themes'])==1
        saved=page.evaluate('(key)=>JSON.parse(sessionStorage.getItem(key+".intents.v1"))',STORAGE)
        # Hold the Theme read after remount to make this race deterministic:
        # native saved choices must not enable submission before the read arrives.
        page.evaluate("""(f)=>{
            const send=window.__http;
            const gate=new Promise(resolve=>{window.__resumeThemeRead=resolve;});
            window.__http=async request=>{
                if(request.method==='GET' && request.url.includes('/mesa/preparar?'))await gate;
                return send(request);
            };
            window.__mount(f);
        }""",f)
        expect(page.get_by_role('button',name='Ver seleção',exact=True)).to_be_visible()
        page.get_by_role('button',name='Ver seleção',exact=True).click()
        expect(page.get_by_label('Seleção e trabalho de Produção',exact=True)).to_be_visible()
        expect(page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True)).to_be_disabled()
        calls=len(rpc({'kind':'state'})['httpCalls'])
        page.get_by_role('form',name='Escolhas de Produção',exact=True).dispatch_event('submit')
        assert len(rpc({'kind':'state'})['httpCalls'])==calls
        page.evaluate('window.__resumeThemeRead()')
        plan=prepared();assert plan['preparationKey']==saved['attempt']['preparationKey']
        assert len(rpc({'kind':'state'})['preparations'])==f['before']+1
    def stale_published():
        f=start(independent=False);rpc({'kind':'faults','value':{'newPublished':True}});submit()
        expect(page.get_by_role('status').filter(has_text='mudaram')).to_be_visible()
        assert len(rpc({'kind':'state'})['preparations'])==f['before'];assert stored()['themes'][0]['themeId']==f['theme']
        page.screenshot(path=str(output/'selection-conflict.png'),full_page=True)
        expect(page.get_by_text(re.compile('Foram encontrados vários artigos Jornada relacionados'))).to_be_visible()
        checks=page.get_by_role('checkbox')
        for i in range(checks.count()):checks.nth(i).check()
        page.get_by_label('Novos artigos da seleção',exact=True).fill('0')
        assert prepared()['totals']['reviews']==2
    def organization_only():
        f=start(sourceOnly=True)
        page.get_by_role('button',name='Adicionar a tema',exact=True).click()
        panel=page.get_by_role('region',name='Adicionar a tema',exact=True)
        panel.get_by_role('combobox').select_option(f['theme']);panel.get_by_role('button',name='Confirmar',exact=True).click()
        expect(page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True)).to_have_count(0)
        state=rpc({'kind':'state'});assert len(state['preparations'])==f['before']
        assert any(m['newsroom_article_id']==f['loose']['id'] for m in state['memberships'])
        assert not any(c['method']=='POST' and c['path'].endswith('/preparar') for c in state['httpCalls'])
    def new_then_review():
        f=start('theme',independent=False);theme_mode('new');plan=prepared()
        published=rpc({'kind':'publish','dossierId':plan['dossierId']})
        assert len(published['receipts'])==1 and published['receipts'][0]['decision']=='NEW'
        page.evaluate('(f)=>window.__mount(f,"theme")',f)
        expect(page.get_by_text('2 artigos Jornada publicados · 1 fonte',exact=True)).to_be_visible()
        page.get_by_text('Artigos Jornada e continuidade (2)',exact=True).click()
        expect(page.get_by_text('Não revisto — sem referência de revisão verificável.',exact=True)).to_have_count(1)
        expect(page.get_by_text('Publicação inicial — não é uma revisão dos artigos anteriores.',exact=True)).to_have_count(1)
        theme_mode('review');plan2=prepared();assert plan2['totals']['reviews']==2
        unchanged=rpc({'kind':'publish','dossierId':plan2['dossierId'],'noChange':True})
        assert len(unchanged['receipts'])==2 and all(r['decision']=='SEM_ALTERAÇÃO' for r in unchanged['receipts'])
        page.evaluate('(f)=>window.__mount(f,"theme")',f)
        expect(page.get_by_text('Artigos Jornada e continuidade (2)',exact=True)).to_be_visible();page.get_by_text('Artigos Jornada e continuidade (2)',exact=True).click()
        expect(page.get_by_text('Revisão concluída: SEM ALTERAÇÃO.',exact=True)).to_have_count(2)
    try:
        for name,fn in [
            ('selection bar stays compact with one, two and several contexts',compact_selection_does_not_consume_workspace),
            ('selected Theme + loose selection uses one technical selection; NULL matchday',mixed),
            ('review and two separately counted NEWs',lambda:counts('review-new',2,1)),
            ('only NEWs; old articles have no review tasks',lambda:counts('new',2,0)),
            ('whole Theme returns to preparation with no added source',whole_theme),
            ('unpublished Theme does not offer review',without_published),
            ('draft is not a publication and does not offer review',lambda:without_published(True)),
            ('combined selection consumes Theme and loose source after success',combined_consumes_theme_and_source),
            ('two selected sources can produce four Article Plans without a Theme',selection_cardinality),
            ('selection preparation does not reorganize Theme memberships',selection_does_not_organize),
            ('source alone prepares as one selection',only_source),
            ('lost response after SQL commit; remount and retry recover one preparation',lost_response),
            ('published set changes; contextual error, no write, selection retained',stale_published),
            ('Add to Theme saves membership without preparing production',organization_only),
            ('NEW without review → old remains unreviewed → later explicit review receipts',new_then_review),
        ]:test(name,fn)
        assert not rpc({'kind':'state'})['forbidden']
        print(f'RESULT: {len(reports)} browser/handler/PostgreSQL cases passed',flush=True)
    finally:
        report();browser.close();backend.stdin.close();backend.wait(timeout=10);stderr.close()
