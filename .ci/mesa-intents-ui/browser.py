"""Real Mesa -> Production v2 planning -> canonical v1 browser/SQL integration."""
import argparse
import base64
import json
from pathlib import Path
import re
import select
import subprocess
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
    line=backend.stdout.readline();result=json.loads(line)
    if not result.get('ok'):raise AssertionError(result.get('error',line))
    return result['value']

STORAGE='jornada.mesa.preparation.v2'
reports=[];errors=[];external=[];page=None;context=None
image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')

def report():
    (output/'browser-report.json').write_text(json.dumps({
        'passed':sum(t['passed'] for t in reports),'failed':sum(not t['passed'] for t in reports),
        'tests':reports,'pageErrors':errors,'unexpectedNetwork':external,
        'nativeBrowserStorage':not args.document_only,'nativeBrowserUUID':not args.document_only,
        'boundaries':['Next router records the requested workspace URL',
                      'fetch IPC invokes actual route handlers and PostgreSQL; no HTTP server',
                      'the actual Production grouping component is mounted after Mesa navigation'],
    },ensure_ascii=False,indent=2))

with sync_playwright() as playwright:
    launch={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    if args.chromium:launch['executable_path']=args.chromium
    browser=playwright.chromium.launch(**launch)

    def start(openPanel=True,**kw):
        global page,context
        if context:context.close()
        fixture=rpc({'kind':'setup',**kw})
        context=browser.new_context(viewport={'width':1440,'height':1100},locale='pt-PT',timezone_id='Europe/Lisbon',service_workers='block')
        def route(r):
            if r.request.url=='http://127.0.0.1:4319/':r.fulfill(status=200,content_type='text/html',body='<html><head></head><body><div id="root"></div></body></html>')
            elif r.request.url=='https://example.invalid/image.jpg' and r.request.resource_type=='image':r.fulfill(status=200,content_type='image/png',body=image)
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
        page.evaluate('(fixture)=>window.__mount(fixture)',fixture)
        tray=page.locator('section[aria-label="Ações da seleção"]');expect(tray).to_be_visible()
        if openPanel:
            page.get_by_role('button',name='Ver seleção',exact=True).click()
            expect(page.get_by_label('Seleção e trabalho de Produção',exact=True)).to_be_visible()
            expect(page.get_by_text('O número de novos artigos será definido na Produção.',exact=False)).to_be_visible()
            assert page.get_by_label('Novos artigos da seleção',exact=True).count()==0
            assert page.get_by_label('Trabalho do Tema Milan / Amorim',exact=True).count()==0
        fixture['audit']=rpc({'kind':'state'})['sourceAudit']
        return fixture

    def submit():page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True).click()
    def stored():return page.evaluate('(key)=>JSON.parse(sessionStorage.getItem(key)||"null")',STORAGE)
    def assert_sources_unchanged(expected):
        actual=rpc({'kind':'state'})['sourceAudit'];assert actual==expected,(expected,actual);assert actual['usage']==[]
    def prepare_planning(fixture,submit_now=True):
        if submit_now:submit()
        page.wait_for_function('window.__navigations.length === 1',timeout=10000)
        url=page.evaluate('window.__navigations[0]');assert re.fullmatch('/admin/editorial/redacao-automatica/mesa/producao/[a-f0-9-]{36}',url)
        did=url.split('/')[-1];state=rpc({'kind':'state'})
        assert not any(item['dossier_id']==did for item in state['preparations'])
        prep=next(item for item in state['groupingPreparations'] if item['dossier_id']==did)
        grouping=rpc({'kind':'grouping','dossierId':did});assert grouping['state']=='planned'
        assert prep['request']['selection']['sourceIds']==sorted([s['newsroomArticleId'] for s in fixture['buffer']['sources']])
        page.evaluate('(grouping)=>window.__mountGrouping(grouping)',grouping)
        expect(page.get_by_label('Planeamento dos artigos desta Produção')).to_be_visible()
        assert_sources_unchanged(fixture['audit'])
        return did,grouping

    def theme_card():return page.get_by_label('Temas desta Produção').locator('section').filter(has_text='Milan / Amorim')
    def set_theme_count(value):
        card=theme_card();card.get_by_label('Novos artigos',exact=True).fill(str(value));card.get_by_role('button',name='Definir quantidade',exact=True).click()
        expect(page.get_by_text('Quantidade do Tema guardada.',exact=True)).to_be_visible()
    def set_loose_target(value):
        page.get_by_label('Número de novos artigos para material solto',exact=True).fill(str(value));page.get_by_role('button',name='Definir objetivo',exact=True).click()
        expect(page.get_by_text('Planeamento guardado.',exact=True)).to_be_visible()
    def merge_groups(count):
        checks=page.locator('ol').get_by_role('checkbox');assert checks.count()>=count
        for index in range(count):checks.nth(index).check()
        page.get_by_role('button',name='Agrupar num artigo',exact=True).click();expect(page.get_by_text('Planeamento guardado.',exact=True)).to_be_visible()
    def split_group():
        checks=page.locator('ol').get_by_role('checkbox')
        for index in range(checks.count()):
            if checks.nth(index).locator('xpath=ancestor::li').get_attribute('data-size')!='1':checks.nth(index).check();break
        page.get_by_role('button',name='Separar',exact=True).click();expect(page.get_by_text('Planeamento guardado.',exact=True)).to_be_visible()
    def materialize(did,expected_new):
        label=f'Confirmar {expected_new} '+('novo artigo' if expected_new==1 else 'novos artigos')
        page.get_by_role('button',name=label,exact=True).click();expect(page.get_by_text('Estrutura confirmada.',exact=False)).to_be_attached()
        state=rpc({'kind':'state'});plan=next(item['frozen_plan'] for item in state['preparations'] if item['dossier_id']==did)
        grouping=rpc({'kind':'grouping','dossierId':did});assert grouping['state']=='materialized'
        assert sum(output['kind']=='new' for output in plan['outputs'])==expected_new
        return plan,grouping
    def set_all_reviews(selected):
        checks=page.locator('ul').get_by_role('checkbox')
        for index in range(checks.count()):(checks.nth(index).check if selected else checks.nth(index).uncheck)()

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
            f=start(openPanel=False,**options);tray=page.locator('section[aria-label="Ações da seleção"]')
            assert page.get_by_label('Seleção e trabalho de Produção',exact=True).count()==0
            box=tray.bounding_box();assert box;heights.append(box['height']);assert box['height']<=100,box;assert_sources_unchanged(f['audit'])
        assert max(heights)-min(heights)<=2,heights
        f=start(extra=True,openPanel=False);tray=page.locator('section[aria-label="Ações da seleção"]');before=tray.bounding_box()['height']
        page.get_by_role('button',name='Ver seleção',exact=True).click();panel=page.get_by_label('Seleção e trabalho de Produção',exact=True)
        expect(panel).to_be_visible();assert page.evaluate('(el)=>getComputedStyle(el).position',panel.element_handle())=='fixed';assert abs(tray.bounding_box()['height']-before)<=1
        assert page.get_by_label('Novos artigos da seleção',exact=True).count()==0
        expect(page.get_by_text('O número de novos artigos será definido na Produção.',exact=False)).to_be_visible()
        assert page.get_by_text('Material selecionado · 1 Tema · 2 fontes soltas',exact=True).count()==1
        assert page.get_by_text('Destino desta fonte',exact=True).count()==0
        expect(page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True)).to_be_visible();assert_sources_unchanged(f['audit'])

    def mixed():
        f=start();did,g=prepare_planning(f)
        assert len(g['sources'])==2 and len(g['existingOutputs'])==1
        assert {s['newsroomArticleId'] for s in g['sources']}=={f['material']['id'],f['loose']['id']}
        assert g['targetCount'] is None and g['themes'][0]['targetCount'] is None
        set_theme_count(0);set_loose_target(1);plan,_=materialize(did,1)
        assert sum(o['kind']=='existing' for o in plan['outputs'])==1
        assert next(o for o in plan['outputs'] if o['kind']=='existing')['target']['editorialArticleId']==f['articles'][0]
        assert {s['newsroomArticleId'] for s in plan['contexts'][0]['sources']}=={f['material']['id'],f['loose']['id']};assert_sources_unchanged(f['audit'])

    def theme_case(new_count,review):
        f=start(independent=False)
        if not review:set_all_reviews(False)
        did,g=prepare_planning(f);assert len(g['existingOutputs'])==(1 if review else 0)
        set_theme_count(new_count);plan,_=materialize(did,new_count)
        assert plan['totals']['reviews']==(1 if review else 0) and plan['totals']['newArticles']==new_count;assert_sources_unchanged(f['audit'])

    def without_published(draft=False):
        f=start(published=1 if draft else 0,draft=draft,independent=False);assert page.locator('ul').get_by_role('checkbox').count()==0
        did,g=prepare_planning(f);assert g['existingOutputs']==[]
        set_theme_count(1);plan,_=materialize(did,1);assert all(o['kind']=='new' for o in plan['outputs']);assert_sources_unchanged(f['audit'])

    def combined_preserves_material_and_clears_selection():
        f=start();did,g=prepare_planning(f);saved=stored();assert not saved['sources'] and not saved.get('themes')
        assert {s['newsroomArticleId'] for s in g['sources']}=={f['material']['id'],f['loose']['id']};assert_sources_unchanged(f['audit'])
        set_theme_count(0);set_loose_target(1);materialize(did,1);assert_sources_unchanged(f['audit'])

    def selection_cardinality():
        f=start(sourceOnly=True,extra=True);did,g=prepare_planning(f)
        assert g['targetCount'] is None and len(g['groups'])==2 and len(g['sources'])==2
        expect(page.get_by_text('2 fontes · 2 grupos · objetivo por definir',exact=True)).to_be_visible()
        assert page.get_by_label('Número de novos artigos para material solto',exact=True).get_attribute('max')=='2'
        set_loose_target(1);merge_groups(2);expect(page.get_by_text('2 fontes · 1 grupos · objetivo 1',exact=True)).to_be_visible()
        split_group();expect(page.get_by_text('2 fontes · 2 grupos · objetivo 1',exact=True)).to_be_visible()
        merge_groups(2);plan,_=materialize(did,1)
        assert len(plan['contexts'][0]['sources'])==2 and len(plan['outputs'])==1;assert_sources_unchanged(f['audit'])

    def explicit_zero_is_not_unconfigured():
        f=start(sourceOnly=True);did,g=prepare_planning(f);assert g['targetCount'] is None
        expect(page.get_by_text('TOTAL',exact=True).locator('..')).to_contain_text('Por definir')
        set_loose_target(0);g=rpc({'kind':'grouping','dossierId':did});assert g['targetCount']==0 and g['groups']==[]
        expect(page.get_by_text('1 fontes · 0 grupos · objetivo 0',exact=True)).to_be_visible();assert_sources_unchanged(f['audit'])

    def only_source():
        f=start(sourceOnly=True);did,g=prepare_planning(f);assert g['targetCount'] is None and len(g['groups'])==1
        set_loose_target(1);plan,_=materialize(did,1)
        assert {s['newsroomArticleId'] for s in plan['contexts'][0]['sources']}=={f['loose']['id']};assert_sources_unchanged(f['audit'])

    def lost_response():
        f=start();before=len(rpc({'kind':'state'})['groupingPreparations']);rpc({'kind':'faults','value':{'loseResponse':True}});submit()
        expect(page.get_by_role('status').filter(has_text='Resposta perdida')).to_be_visible();assert len(rpc({'kind':'state'})['groupingPreparations'])==before+1
        assert len(stored()['sources'])==1 and len(stored()['themes'])==1
        saved=page.evaluate('(key)=>JSON.parse(sessionStorage.getItem(key+".intents.v1"))',STORAGE)
        page.evaluate('(f)=>window.__mount(f)',f);page.get_by_role('button',name='Ver seleção',exact=True).click()
        did,_=prepare_planning(f);prep=next(p for p in rpc({'kind':'state'})['groupingPreparations'] if p['dossier_id']==did)
        assert prep['preparation_key']==saved['attempt']['preparationKey'] and len(rpc({'kind':'state'})['groupingPreparations'])==before+1
        set_theme_count(0);set_loose_target(1);materialize(did,1);assert_sources_unchanged(f['audit'])

    def stale_published():
        f=start(independent=False);before=len(rpc({'kind':'state'})['groupingPreparations']);rpc({'kind':'faults','value':{'newPublished':True}});submit()
        expect(page.get_by_role('status').filter(has_text='mudou')).to_be_visible();assert len(rpc({'kind':'state'})['groupingPreparations'])==before
        assert stored()['themes'][0]['themeId']==f['theme'];expect(page.get_by_text(re.compile('Foram encontrados vários artigos Jornada relacionados'))).to_be_visible()
        set_all_reviews(True);did,g=prepare_planning(f);assert len(g['existingOutputs'])==2
        set_theme_count(0);plan,_=materialize(did,0);assert plan['totals']['reviews']==2;assert_sources_unchanged(f['audit'])

    def explicit_article_selection():
        f=start(openPanel=False,sourceOnly=True,published=3,explicitArticles=True)
        choices=page.get_by_role('checkbox',name=re.compile('^Selecionar artigo publicado:'))
        expect(choices).to_have_count(3)
        for index in range(3):expect(choices.nth(index)).not_to_be_checked()
        choices.nth(0).check();choices.nth(1).check();choices.nth(0).uncheck();choices.nth(2).check()
        expected=sorted([f['articles'][1],f['articles'][2]])
        assert sorted(stored()['sources'][0]['editorialArticleIds'])==expected
        page.evaluate('(fixture)=>window.__mount(fixture)',f)
        expect(choices.nth(0)).not_to_be_checked();expect(choices.nth(1)).to_be_checked();expect(choices.nth(2)).to_be_checked()
        page.screenshot(path=str(output/'explicit-article-selection.png'),full_page=True)
        page.get_by_role('button',name='Ver seleção',exact=True).click()
        page.get_by_role('button',name='Adicionar a tema',exact=True).click()
        panel=page.get_by_role('region',name='Adicionar a tema',exact=True)
        panel.get_by_role('combobox').select_option(f['theme']);panel.get_by_role('button',name='Confirmar',exact=True).click()
        expect(page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True)).to_have_count(0)
        state=rpc({'kind':'state'})
        assert sorted(a['id'] for a in state['articles'])==expected
        command=next(c['body'] for c in state['httpCalls'] if (c['body'] or {}).get('action')=='organize_sources')
        assert sorted(command['editorialArticleIds'])==expected
        assert not any(c['method']=='POST' and c['path'].endswith('/preparar') for c in state['httpCalls'])
    def organization_only():
        f=start(sourceOnly=True);before=len(rpc({'kind':'state'})['groupingPreparations'])
        page.get_by_role('button',name='Adicionar a tema',exact=True).click();panel=page.get_by_role('region',name='Adicionar a tema',exact=True)
        panel.get_by_role('combobox').select_option(f['theme']);panel.get_by_role('button',name='Confirmar',exact=True).click()
        expect(page.get_by_role('button',name='PREPARAR PRODUÇÃO',exact=True)).to_have_count(0)
        state=rpc({'kind':'state'});assert len(state['groupingPreparations'])==before;assert any(m['newsroom_article_id']==f['loose']['id'] for m in state['memberships'])
        assert not any(c['method']=='POST' and c['path'].endswith('/preparar') for c in state['httpCalls'])

    try:
        for name,fn in [
            ('selection bar stays compact and moves NEW decisions to Production',compact_selection_does_not_consume_workspace),
            ('mixed Theme and loose material freezes all inputs then materializes EXISTING plus one NEW',mixed),
            ('Theme review and two NEWs are decided in Production',lambda:theme_case(2,True)),
            ('Theme can create two NEWs without review',lambda:theme_case(2,False)),
            ('Theme can review with explicit zero NEW',lambda:theme_case(0,True)),
            ('unpublished Theme materializes NEW only',without_published),
            ('draft is not a publication and materializes NEW only',lambda:without_published(True)),
            ('successful planning preserves frozen material and clears only browser selection',combined_preserves_material_and_clears_selection),
            ('two loose sources start unconfigured and group without losing material',selection_cardinality),
            ('explicit zero NEW differs from an unconfigured target',explicit_zero_is_not_unconfigured),
            ('one loose source is configured and materialized in Production',only_source),
            ('lost prepare response retries one v2 preparation and one canonical plan',lost_response),
            ('published set change writes nothing until refreshed choices are confirmed',stale_published),
            ('Only explicitly checked published articles belong to the Theme',explicit_article_selection),
            ('Add to Theme remains organization-only and does not prepare Production',organization_only),
        ]:test(name,fn)
        assert not rpc({'kind':'state'})['forbidden']
        print(f'RESULT: {len(reports)} Mesa v2 browser/handler/PostgreSQL cases passed',flush=True)
    finally:
        report();browser.close();backend.stdin.close();backend.wait(timeout=10);stderr.close()
