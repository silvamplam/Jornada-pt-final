"""Actual server page functions + browser controls + handlers + disposable SQL.

Run under offline.py after publication.py. Only Next transport/routing, fixture
image bytes and the final Mesa landing document are doubles. Native clipboard
and sessionStorage; no simulated publication or pre-arranged package result.
"""
import argparse, base64, json, os, re, select, subprocess, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
p=argparse.ArgumentParser()
p.add_argument('--socket');p.add_argument('--psql',default='psql');p.add_argument('--container')
p.add_argument('--node',default='node');p.add_argument('--chromium');p.add_argument('--output',required=True)
p.add_argument('--document-only',action='store_true',help='Diagnostic only: doubles storage, clipboard and final navigation. Never used in CI.')
args=p.parse_args();root=Path(__file__).resolve().parents[2];out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
cmd=[args.node,str(root/'.ci/mesa-intents-ui/flow-driver.mjs'),'--output',str(out)]
if args.container:cmd+=['--container',args.container]
else:
    assert args.socket and Path(args.socket).is_absolute()
    cmd+=['--socket',args.socket,'--psql',args.psql]
log=(out/'flow-backend.log').open('w')
backend=subprocess.Popen(cmd,cwd=root,env={**os.environ,'MESA_FLOW_DOCUMENT_ONLY':'1' if args.document_only else '0'},text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,bufsize=1)
line=backend.stdout.readline()
assert line and json.loads(line)=={'ready':True},(line,(out/'flow-backend.log').read_text())
def rpc(value):
    backend.stdin.write(json.dumps(value,ensure_ascii=False)+'\n');backend.stdin.flush()
    if not select.select([backend.stdout],[],[],35)[0]:raise RuntimeError('Flow backend timeout')
    response=json.loads(backend.stdout.readline());assert response.get('ok'),response
    return response['value']
reports=[];errors=[];unexpected=[];pages=[];images=[];page=None;context=None;source_audit=None
origin='http://127.0.0.1:4319';mesa='/admin/editorial/redacao-automatica/mesa'
production=mesa+'/producao/';batch='/admin/editorial/redacao-automatica/publicacao-lote'
image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
def report():
    (out/'flow-report.json').write_text(json.dumps(dict(passed=sum(t['passed'] for t in reports),
        failed=sum(not t['passed'] for t in reports),tests=reports,pageErrors=errors,unexpectedNetwork=unexpected,pages=pages,
        imageRequests=images,nativeStorage=not args.document_only,nativeClipboard=not args.document_only,nativeFinalNavigation=not args.document_only,boundaries=[
          'Next routing/RSC transport replaced by serialised actual server page result',
          'Actual loaders, packages, handlers, text parser, receipts and PostgreSQL',
          'Only fixture images and final Mesa landing document are fulfilled',
          'Authentication/middleware and physical public placement NOT certified']),ensure_ascii=False,indent=2))
with sync_playwright() as pw:
    launch=dict(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    if args.chromium:launch['executable_path']=args.chromium
    browser=pw.chromium.launch(**launch)
    def start(**kw):
        global page,context,source_audit
        if context:context.close()
        f=rpc(dict(kind='setup',**kw))
        context=browser.new_context(viewport={'width':1440,'height':1100},locale='pt-PT',timezone_id='Europe/Lisbon',
            service_workers='block',permissions=['clipboard-read','clipboard-write'])
        def route(r):
            url=r.request.url
            if url==origin+'/':r.fulfill(status=200,content_type='text/html',body='<html><head></head><body><div id="root"></div></body></html>')
            elif url==origin+batch:
                html='<html><head><style>'+ (out/'flow-browser.css').read_text() +'</style></head><body><div id="root"></div><script>'+(out/'flow-browser.js').read_text().replace('</script','<\\/script')+'</script><script>void window.__flowNavigate(location.pathname)</script></body></html>'
                r.fulfill(status=200,content_type='text/html',body=html)
            elif url==origin+mesa:
                pages.append(mesa);r.fulfill(status=200,content_type='text/html',body='<h1>Mesa da Redação</h1>')
            elif url in ['https://example.invalid/image.jpg','https://example.invalid/old.jpg','https://example.invalid/new.jpg'] and r.request.resource_type=='image':
                images.append(url);r.fulfill(status=200,content_type='image/png',body=image)
            else:unexpected.append(url);r.abort()
        context.route('**/*',route)
        page=context.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:errors.append(str(e)))
        page.expose_function('__http',lambda req:rpc(dict(kind='http',request=req)))
        def load(path):pages.append(path);return rpc(dict(kind='page',path=path))
        page.expose_function('__flowPage',load)
        if args.document_only:
            page.set_content('<html><head></head><body><div id="root"></div></body></html>')
            page.evaluate('''() => {
              const m=new Map(); let copied='';
              Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}});
              Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{copied=t;},readText:async()=>copied}});
              if(!crypto.randomUUID)crypto.randomUUID=()=> '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
            }''')
        else:page.goto(origin+'/')
        page.add_style_tag(content=(out/'flow-browser.css').read_text())
        page.add_script_tag(content=(out/'flow-browser.js').read_text())
        page.evaluate('(v)=>sessionStorage.setItem("jornada.mesa.preparation.v2",JSON.stringify(v.buffer))',f)
        page.evaluate('(v)=>window.__flowMount(v)',f)
        expect(page.get_by_role('button',name='Ver seleção',exact=True)).to_be_visible()
        page.get_by_role('button',name='Ver seleção',exact=True).click()
        expect(page.get_by_label('Seleção e trabalho de Produção',exact=True)).to_be_visible()
        assert page.get_by_label('Novos artigos da seleção',exact=True).count()==0
        expect(page.get_by_text('O número de novos artigos será definido na Produção.',exact=False)).to_be_visible()
        assert page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True).count()==0
        source_audit=rpc(dict(kind='source-state'))
        return f
    def prepare(mode='review',new=None):
        theme_control=page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True)
        legacy_theme_flow=theme_control.count()>0
        if legacy_theme_flow:
            theme_control.select_option(mode)
            if new is not None:page.get_by_label('Novos artigos do Tema Milan / Amorim',exact=True).fill(str(new))
        else:
            checks=page.locator('label').filter(has_text=re.compile(r'^Rever:')).locator('input[type="checkbox"]')
            for i in range(checks.count()):
                if mode in ('review','review-new'):checks.nth(i).check()
                elif mode=='new':checks.nth(i).uncheck()
        page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True).click()
        page.wait_for_function('(base)=>window.__flowReady.startsWith(base)',arg=production,timeout=12000)
        expect(page.get_by_role('heading',name='Produção',exact=True)).to_be_visible()
        did=page.evaluate('window.__flowReady').split('/')[-1]
        if not legacy_theme_flow:
            target_new=new if new is not None else (0 if mode=='review' else None)
            assert target_new is not None
            theme_region=page.get_by_label('Temas desta Produção')
            if theme_region.count():
                card=theme_region.locator('section').filter(has_text='Milan / Amorim')
                theme_new=0 if page.get_by_label('Número de novos artigos para material solto',exact=True).count() else target_new
                card.get_by_label('Novos artigos',exact=True).fill(str(theme_new))
                card.get_by_role('button',name='Definir quantidade',exact=True).click()
                expect(page.get_by_text('Quantidade do Tema guardada.',exact=True)).to_be_visible()
            loose=page.get_by_label('Número de novos artigos para material solto',exact=True)
            if loose.count():
                loose.fill(str(target_new));page.get_by_role('button',name='Definir objetivo',exact=True).click()
                expect(page.get_by_text('Planeamento guardado.',exact=True)).to_be_visible()
            label=f'Confirmar {target_new} '+('novo artigo' if target_new==1 else 'novos artigos')
            page.get_by_role('button',name=label,exact=True).click()
            page.wait_for_function('(base)=>window.__flowReady.startsWith(base)',arg=production,timeout=12000)
            expect(page.get_by_role('button',name='Guardar artigos e imagens',exact=True)).to_be_visible()
            assert rpc(dict(kind='source-state'))==source_audit
        s=rpc(dict(kind='flow-state',dossierId=did));plan=s['workspace']['selection_payload']['productionIntents']
        assert len(s['plans'])==plan['totals']['reviews']+plan['totals']['newArticles']
        return did,plan
    def package(did):
        page.get_by_role('button',name='Guardar artigos e imagens',exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Produção guardada.')).to_be_visible(timeout=12000)
        page.get_by_role('button',name='Copiar pacote para ChatGPT',exact=True).click()
        expect(page.get_by_role('status').filter(has_text=re.compile('Pacote com .* copiado'))).to_be_visible(timeout=12000)
        text=page.evaluate('navigator.clipboard.readText()');assert len(text)>200
        s=rpc(dict(kind='flow-state',dossierId=did))
        prepared=next(c['body'] for c in reversed(s['flowCalls']) if c.get('action')=='prepare_source_package' and c.get('status') in (200,201))
        assert prepared['ok'];return prepared['sourcePackage']['packageId'],text
    def return_text(pid,nochange=()):
        text=rpc(dict(kind='text',packageId=pid,noChange=list(nochange)))
        response=page.locator('textarea[placeholder^="Cola aqui os artigos gerados"]')
        response.fill(text);response.press('Control+Enter')
        if not args.document_only:page.wait_for_url(origin+batch,timeout=12000)
        page.wait_for_function('(path)=>window.__flowReady===path',arg=batch,timeout=12000)
        expect(page.get_by_role('heading',name='Publicação em lote',exact=True)).to_be_visible()
        return text
    def publish(new=False):
        if new:
            page.locator('#batch-competition').select_option('b0000000-0000-4000-8000-000000000900')
            page.locator('#batch-season').select_option('b0000000-0000-4000-8000-000000000901')
            page.locator('#batch-matchday').select_option('b0000000-0000-4000-8000-000000000902')
        button=page.get_by_role('button',name=re.compile('^(PUBLICAR|ATUALIZAR|CONCLUIR|RETOMAR)'))
        expect(button).to_be_enabled(timeout=12000)
        page.screenshot(path=str(out/f'flow-prepublish-{len(reports)}.png'),full_page=True)
        if args.document_only:page.evaluate('delete window.__flowLanding')
        button.click()
        if args.document_only:page.wait_for_function('(path)=>window.__flowLanding===path',arg=mesa,timeout=12000)
        else:page.wait_for_url(origin+mesa,timeout=12000)
    def expect_auto_nochange_return():
        if args.document_only:
            page.wait_for_function('(path)=>window.__flowLanding===path',arg=mesa,timeout=12000)
        else:
            page.wait_for_url(origin+mesa,timeout=12000)
    def mixed():
        f=start();did,plan=prepare('review-new',1)
        page.screenshot(path=str(out/'flow-workspace-mixed.png'),full_page=True)
        pid,text=package(did);assert 'Milan' in text and 'Pote' in text
        return_text(pid);publish(new=True)
        s=rpc(dict(kind='flow-state',dossierId=did));assert s['workspace']['workspace_state']=='consolidated'
        assert len(s['published'])==2 and len(s['receipts'])==2
        old=next(a for a in s['articles'] if a['id']==f['articles'][0]);target=next(o['target'] for o in plan['outputs'] if o['kind']=='existing')
        assert old['slug']==target['slug'] and old['matchday_id'] is None
        assert len(s['themeArticles'])==1
        fresh=next(a for a in s['articles'] if a['id']!=old['id'])
        assert fresh['id'] not in {a['id'] for a in s['themeArticles']}
        receipt=next(r for r in s['receipts'] if r['editorial_article_id']==fresh['id'])
        assert receipt['theme_id'] is None and receipt['context_key'].startswith('selection:')
        (out/'flow-mixed-result.json').write_text(json.dumps(s,ensure_ascii=False,indent=2))
    def materialization_refreshes_twelve_without_reload():
        start(independent=False);did,plan=prepare(mode='new',new=12)
        count=page.locator('section[aria-labelledby="output-count-title"] input[type="number"]')
        expect(count).to_have_value('12')
        cards=page.locator('article').filter(has=page.locator('input[name$=":image_choice"]'))
        expect(cards).to_have_count(12)
        expect(page.get_by_text('NEW_01',exact=True)).to_be_visible()
        expect(page.get_by_text('NEW_12',exact=True)).to_be_visible()
        assert len(plan['outputs'])==12 and all(o['kind']=='new' for o in plan['outputs'])
        pid,_=package(did)
        state=rpc(dict(kind='flow-state',dossierId=did))
        saved=next(c for c in reversed(state['flowCalls']) if c.get('action')=='save_article_plans_batch')
        assert saved['body']['outputCount']==12 and len(saved['body']['outputs'])==12
        assert pid and rpc(dict(kind='source-state'))==source_audit
    def nochange():
        start(independent=False,published=2);did,plan=prepare();pid,_=package(did)
        return_text(pid,[o['outputId'] for o in plan['outputs']]);expect_auto_nochange_return()
        s=rpc(dict(kind='flow-state',dossierId=did))
        assert len(s['receipts'])==2 and not s['published'] and s['workspace']['workspace_state']=='consolidated'
        assert all(a['body']=='Corpo antigo' for a in s['themeArticles'])
    def reopen_theme(f):
        global source_audit
        if not args.document_only:
            page.goto(origin+'/')
            page.add_style_tag(content=(out/'flow-browser.css').read_text())
            page.add_script_tag(content=(out/'flow-browser.js').read_text())
        page.evaluate('(path)=>window.__flowNavigate(path)',mesa+'/temas/'+f['theme'])
        expect(page.get_by_role('form',name='Escolhas de Produção',exact=True)).to_be_visible()
        assert page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True).count()==0
        expect(page.get_by_text('O número de novos artigos será definido na Produção.',exact=False)).to_be_visible()
        source_audit=rpc(dict(kind='source-state'))
    def new_then_review():
        f=start(independent=False);did,plan=prepare(mode='new',new=1);pid,copied=package(did)
        assert 'Corpo antigo' in copied
        return_text(pid);publish(new=True)
        first=rpc(dict(kind='flow-state',dossierId=did));assert len(first['receipts'])==1 and first['receipts'][0]['decision']=='NEW'
        old=next(a for a in first['themeArticles'] if a['id']==f['articles'][0]);assert old['body']=='Corpo antigo'
        fresh=next(a for a in first['articles'] if a['id']!=old['id'])
        assert fresh['id'] not in {a['id'] for a in first['themeArticles']}
        reopen_theme(f)
        assert page.locator('label').filter(has_text=re.compile(r'^Rever:')).count()==2
        did2,plan2=prepare();assert len(plan2['outputs'])==2 and all(o['kind']=='existing' for o in plan2['outputs'])
        pid2,_=package(did2);return_text(pid2,[o['outputId'] for o in plan2['outputs']]);expect_auto_nochange_return()
        second=rpc(dict(kind='flow-state',dossierId=did2));assert len(second['receipts'])==2
        assert all(receipt['decision']=='SEM_ALTERAÇÃO' for receipt in second['receipts'])
        assert second['themeArticles']==first['themeArticles']
        (out/'flow-new-then-review.json').write_text(json.dumps(dict(first=first,second=second),ensure_ascii=False,indent=2))
    def review_and_new():
        f=start(independent=False,published=2);did,plan=prepare(mode='review-new',new=2)
        assert len(plan['outputs'])==4
        pid,_=package(did);unchanged=next(o for o in plan['outputs'] if o['kind']=='existing')
        return_text(pid,[unchanged['outputId']]);publish(new=True)
        s=rpc(dict(kind='flow-state',dossierId=did));assert len(s['published'])==3 and len(s['receipts'])==4
        assert sorted(r['decision'] for r in s['receipts'])==['NEW','NEW','SEM_ALTERAÇÃO','UPDATE']
        assert next(a for a in s['themeArticles'] if a['id']==unchanged['target']['editorialArticleId'])['body']=='Corpo antigo'
    def only_update():
        f=start(independent=False);did,plan=prepare();pid,_=package(did)
        return_text(pid);publish()
        s=rpc(dict(kind='flow-state',dossierId=did));assert len(s['receipts'])==1 and s['receipts'][0]['decision']=='UPDATE'
        assert s['articles'][0]['matchday_id'] is None and s['articles'][0]['id']==f['articles'][0]
    def protected_manual_edit():
        f=start(independent=False);did,plan=prepare();pid,_=package(did);return_text(pid)
        button=page.get_by_role('button',name=re.compile('^(PUBLICAR|ATUALIZAR|CONCLUIR|RETOMAR)'))
        expect(button).to_be_enabled(timeout=12000)
        rpc(dict(kind='manual-edit',articleId=f['articles'][0]));button.click()
        expect(page.get_by_role('alert')).to_be_visible(timeout=12000)
        s=rpc(dict(kind='flow-state',dossierId=did));assert s['workspace']['workspace_state']=='active' and not s['receipts'] and not s['published']
        assert s['themeArticles'][0]['body']=='Edição manual posterior protegida'
        assert page.evaluate('sessionStorage.getItem("jornada.editorial.batch-transfer.v1")')
        page.screenshot(path=str(out/'flow-manual-conflict.png'),full_page=True)
    def test(name,fn):
        e,n=len(errors),len(unexpected)
        try:
            fn();assert len(errors)==e,errors[e:];assert len(unexpected)==n,unexpected[n:]
            reports.append(dict(name=name,passed=True));print('PASS',name,flush=True)
        except Exception:
            reports.append(dict(name=name,passed=False,error=traceback.format_exc()))
            if page:
                page.screenshot(path=str(out/'flow-failure.png'),full_page=True)
                (out/'flow-failure.txt').write_text(page.locator('body').inner_text())
            report();raise
        report()
    try:
        test('Materializing twelve outputs refreshes the preserved workspace without a page reload',materialization_refreshes_twelve_without_reload)
        test('Real visual mixed UPDATE with null matchday + selection NEW',mixed)
        test('Real visual all-SEM ALTERAÇÃO without article writes',nochange)
        test('Real visual NEW without review followed by explicit old-article review',new_then_review)
        test('Real visual mixed UPDATE, SEM ALTERAÇÃO and two NEW outputs',review_and_new)
        test('Real visual UPDATE only preserves its null matchday',only_update)
        test('Manual edit after preflight blocks publication and preserves response',protected_manual_edit)
        print(f'RESULT: {len(reports)} complete visual flows passed',flush=True)
    finally:
        report();browser.close();backend.stdin.close();backend.wait(timeout=10);log.close()
