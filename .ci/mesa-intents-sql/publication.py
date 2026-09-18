"""Real intent publication/finalization tests, using only disposable PostgreSQL 17.6.

Runs preparation tests first, then the candidate publication migration verbatim.
No URL, network host, production secret or Supabase project is accepted. The V15
article snapshot function and two helpers are loaded verbatim against synthetic
auxiliary tables; physical placement/profile projection is explicitly not in
scope (its sentinels raise if reached). All Mesa functions/triggers are real.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import runpy
import time
from uuid import uuid4

base = runpy.run_path(str(Path(__file__).with_name('run.py')))
execute, load, val, uid = (base[x] for x in ('execute', 'load', 'val', 'uid'))
prepare, preview, request = (base[x] for x in ('prepare', 'preview', 'request'))
expect_error, test, report = (base[x] for x in ('expect_error', 'test', 'report'))
ROOT, args, RESULTS = (base[x] for x in ('ROOT', 'args', 'RESULTS'))
MIGRATION = 'supabase/migrations/20260917213000_newsroom_mesa_intent_publication_v1.sql'
HOTFIX = 'supabase/migrations/20260918145300_newsroom_mesa_intent_update_revision_hotfix.sql'


def scalar(sql):
    return json.loads(execute(sql))


def function_from(path, name):
    """Load the exact CREATE FUNCTION, not a rewritten or successful stub."""
    source = (ROOT / path).read_text(encoding='utf-8-sig')
    marker = 'create function ' + name + '('
    assert source.count(marker) == 1, (path, name)
    definition = marker + source.split(marker, 1)[1].split('$function$;', 1)[0] + '$function$;'
    print('LOAD FUNCTION', name, hashlib.sha256(definition.encode()).hexdigest(), flush=True)
    execute(definition)


# Auxiliary live-snapshot schema: actual V15 implementation, no web access.
execute('''
create schema jornada_private;
create table jornada_private.matchday_live_layout_physical_cutovers(matchday_id uuid primary key);
create table public.matchday_editorial_profile_assignments(matchday_id uuid primary key);
create table public.matchday_editorial_desk_control(matchday_id uuid primary key,
 carryover_source_composition_id uuid, carryover_snapshot jsonb, updated_at timestamptz);
create table public.matchday_editorial_bank_items(id uuid primary key default gen_random_uuid(),
 matchday_id uuid, source_type text, source_id text, label text, title text, subtitle text,
 image_url text, link_url text, source_slug text, updated_at timestamptz);
create table public.matchday_editorials(matchday_id uuid primary key, title text, summary text,
 image_url text, headline_link_url text, side_block_label text, side_block_title text,
 side_block_author text, side_block_text text, side_block_image_url text, side_block_link_url text,
 complementary_label text, complementary_title text, complementary_text text,
 complementary_image_url text, complementary_link_url text, updated_at timestamptz);
create table public.site_editorials(id uuid primary key default gen_random_uuid(),
 headline_title text, headline_subtitle text, headline_image_url text, headline_link_url text,
 side_block_label text, side_block_title text, side_block_author text, side_block_text text,
 side_block_image_url text, side_block_link_url text, complementary_label text,
 complementary_title text, complementary_text text, complementary_image_url text,
 complementary_link_url text, updated_at timestamptz);
''')
for table in ('matchday_highlights', 'matchday_latest_news', 'matchday_horizontal_news',
              'site_editorial_highlights', 'site_editorial_latest_news',
              'site_editorial_horizontal_news', 'matchday_live_layout_items'):
    execute(f'''create table public.{table}(id uuid primary key default gen_random_uuid(),
      matchday_id uuid, slot_type text, label text, time_label text, title text,
      subtitle text, image_url text, link_url text, updated_at timestamptz);''')
for name in ('jornada_private.begin_matchday_live_layout_downstream_v14',
             'jornada_private.end_matchday_live_layout_downstream_v14',
             'public.refresh_matchday_live_layout_legacy'):
    execute(f"""create function {name}(uuid) returns void language plpgsql as $$
      begin raise exception 'physical-layout-projection-outside-this-fixture'; end; $$;""")
function_from('supabase/migrations/20260901201453_matchday_live_layout_cutover_bridge.sql',
              'jornada_private.acquire_matchday_live_layout_cutover_writer_lock')
for name in ('jornada_private.refresh_editorial_article_carryover_snapshot_v15',
             'public.sync_editorial_article_live_snapshots_v15'):
    function_from('supabase/migrations/20260905110018_matchday_publication_physical_placement_boundary_v15.sql', name)

from latest_bootstrap import install as install_latest_dependencies
latest_definitions = install_latest_dependencies(execute, ROOT)
(args.output / 'latest-definitions.json').write_text(json.dumps(latest_definitions, indent=2))

# Compare every pre-existing public/private function definition, ACL and config;
# only the declared dispatcher and private capture helper may change.
function_query = """select coalesce(jsonb_object_agg(p.oid::regprocedure::text,
 md5(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||coalesce(p.proconfig::text,''))), '{}')::text
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','jornada_private') and p.prokind='f';"""
old_functions = scalar(function_query)
old_articles = execute('select md5(jsonb_agg(to_jsonb(a) order by a.id)::text) from public.editorial_articles a;')
load(MIGRATION)
new_functions = scalar(function_query)
changed = {name for name, digest in old_functions.items() if new_functions.get(name) != digest}
assert changed == {'newsroom_mesa_intent_source_v1(uuid)', 'newsroom_mesa_consolidate_publication_v2(uuid)'}, changed
assert old_articles == execute('select md5(jsonb_agg(to_jsonb(a) order by a.id)::text) from public.editorial_articles a;')
print('PASS exact legacy function/ACL preservation; only two declared changes', flush=True)
load(HOTFIX)
assert 'if v_mode = ''create'' then' in execute("select pg_get_functiondef('public.newsroom_publish_mesa_intent_output_v1(uuid,uuid,uuid,uuid[],jsonb)'::regprocedure);")
load('supabase/sql/test-newsroom-mesa-contexts-production-2c-pg17.sql')


def fixture(*, published=1, review=True, new=0, independent=False, null_matchday=False, sources=1):
    """Independent IDs per scenario; no scenario silently depends on earlier edits."""
    theme = str(uuid4())
    source_ids, article_ids = [], []
    execute(f"insert into public.newsroom_editorial_themes(id,title,classification_key) values('{theme}','Milan / Amorim','sporting');")
    for index in range(sources + int(independent)):
        source, snap = str(uuid4()), str(uuid4())
        source_ids.append(source)
        title = 'Pote independente' if index == sources else 'Milan / Amorim'
        execute(f"""insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,
          detected_at,first_detected_at,last_detected_at,processing_status) values('{source}','__publication_test__',
          'https://example.invalid/{source}','https://example.invalid/{source}','{title}',now(),now(),now(),'ready_for_review');
          insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at)
          values('{snap}','{source}',repeat('d',64),'[{{"type":"paragraph","text":"{title} fonte sintética"}}]',
          '{{"fixture":true}}','2026-09-17T10:00:00Z');
          insert into public.newsroom_editorial_article_classifications(newsroom_article_id,classification_key,classification_source)
          values('{source}','sporting','automatic');""")
        if index < sources:
            execute(f"select public.newsroom_set_editorial_theme_source_membership_v1('{theme}','{source}',true);")
    for index in range(published):
        aid = str(uuid4()); article_ids.append(aid)
        execute(f"""insert into public.editorial_articles(id,status,scope,author,label,title,subtitle,body,slug,
          image_url,image_caption,published_at,competition_id,season_id,matchday_id)
          values('{aid}','published','{'competition' if null_matchday else 'matchday'}','Editor','Ante',
          'Artigo {index}','Pós','Corpo original','original-{aid}','https://example.invalid/image.png','Legenda original',
          '2026-09-17T09:00:00Z','{uid(900)}','{uid(901)}',{ 'null' if null_matchday else repr(uid(902)) });
          insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id) values('{theme}','{aid}');""")
    req = dict(version=1,preparationKey=str(uuid4()),title='Ensaio publicação',
               themes=[dict(themeId=theme,action='prepare',reviewPublished=review,newArticleCount=new)],
               sources=[dict(sourceId=source_ids[-1],destination='independent',newArticleCount=1)] if independent else [])
    prep = prepare(req)
    return dict(theme=theme, sources=source_ids, articles=article_ids, request=req,
                dossier=prep['dossierId'], plan=prep['plan'])


def package(f, *, intent=True):
    pid = str(uuid4()); d = f['dossier']
    entries = scalar(f"""select jsonb_agg(jsonb_build_object('id',s.id,'article',s.newsroom_article_id,
      'snapshot',s.newsroom_snapshot_id) order by s.id) from public.newsroom_editorial_dossier_sources s
      where s.dossier_id='{d}' and s.included;""")
    outputs = []
    context_ids = {}
    for index, o in enumerate(f['plan']['outputs'], 1):
        ids = scalar(f"""select jsonb_agg(s.dossier_source_id order by s.dossier_source_id)
          from public.newsroom_mesa_production_context_sources s where s.dossier_id='{d}'
          and s.production_context_id='{o['productionContextId']}';""")
        context_ids[o['outputId']] = ids
        outputs.append(dict(position=index,outputId=o['outputId'],sourceArticlePosition=1,
          focus='Trabalho editorial sintético',imageNewsroomArticleId=None,contextSourceIds=ids,
          articlePlan=dict(dossierId=d,articlePlanId=o['outputId'],contextId=o['productionContextId'],
            workingTitle='Trabalho',articleKind='news',articleKindLabel='Notícia',lengthMode='standard',
            lengthModeLabel='Normal',editorialInstructions='',destination='update' if o['kind']=='existing' else 'new',
            workspaceContractVersion=2,sourceScope='context')))
    manifest = dict(version=5,provenanceContract='mesa-v2',packageId=pid,year='2026',month='09',
      createdAt='2026-09-17T11:00:00Z',markdownFileName='ensaio.md',genre='news',genreLabel='Notícia',
      suggestedTitle=None,additionalInstructions=None,selectedCount=len(entries),articleCount=len(outputs),
      preparedCount=len(entries),failedCount=0,imageCount=0,localDirectory=None,imagesArchiveFileName=None,
      outputs=outputs,entries=[dict(position=i,articlePosition=1,newsroomArticleId=e['article'],
        newsroomSnapshotId=e['snapshot'],provenanceSourceId=e['id'],status='prepared',sourceCode='fixture',
        sourceName='Fixture',title='Fonte',errorCode=None,imageUrl=None,publishedAt=None,publishedAtPrecision=None)
        for i,e in enumerate(entries,1)])
    if intent:
        manifest['productionIntents'] = f['plan']
    execute(f"insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown) values('{pid}','2026','09',{val(manifest)},'Pacote sintético');")
    return dict(id=pid,manifest=manifest,ids=context_ids)


def article(o):
    target = o.get('target')
    aid = target['editorialArticleId'] if target else str(uuid4())
    return dict(id=aid,slug=target['slug'] if target else 'novo-'+aid,
      label='Ante atualizado',title='Título atualizado '+o['slot'],subtitle='Pós atualizado',body='Corpo atualizado '+o['slot'],
      imageUrl=None if target else 'https://example.invalid/new.png',author='Editor',
      publishedAt='2026-09-17T15:00:00Z',matchdayId=target['matchdayId'] if target else uid(902),
      mode='update' if target else 'create')


def uuid_array(ids):
    return 'array[' + ','.join(repr(x) for x in ids) + ']::uuid[]'


def publish_sql(f,p,o,a,*,ids=None,legacy=False):
    fn = 'newsroom_publish_mesa_output_v2' if legacy else 'newsroom_publish_mesa_intent_output_v1'
    return f"select row_to_json(r) from public.{fn}('{f['dossier']}','{o['outputId']}','{p['id']}',{uuid_array(ids if ids is not None else p['ids'][o['outputId']])},{val(a)}) r;"


def publish(f,p,o,a,**kw):
    return scalar(publish_sql(f,p,o,a,**kw))


def finish(f,p,unchanged=()):
    return scalar(f"select public.newsroom_finalize_mesa_intents_v1('{f['dossier']}','{p['id']}',{uuid_array(unchanged)});")


def read_article(aid):
    return scalar(f"select to_jsonb(a) from public.editorial_articles a where a.id='{aid}';")


def receipts(f):
    return scalar(f"select coalesce(jsonb_agg(to_jsonb(r) order by r.output_id),'[]') from public.newsroom_mesa_intent_article_receipts r where r.dossier_id='{f['dossier']}';")


def state(f):
    return execute(f"select workspace_state from public.newsroom_mesa_production_contexts where dossier_id='{f['dossier']}';")


def final_counts(f):
    d = f['dossier']
    return scalar(f"""select jsonb_build_array(
      (select count(*) from public.newsroom_mesa_output_publications where dossier_id='{d}'),
      (select count(*) from public.newsroom_mesa_publication_events where dossier_id='{d}'),
      (select count(*) from public.newsroom_mesa_intent_article_receipts where dossier_id='{d}'),
      (select count(*) from public.newsroom_mesa_intent_finalizations where dossier_id='{d}'));""")


def update_preserves_identity_and_live_snapshots():
    f = fixture(null_matchday=True); p = package(f); o = f['plan']['outputs'][0]; a = article(o)
    before = read_article(a['id']); link = '/noticias/'+a['slug']
    execute(f"""insert into public.site_editorial_highlights(title,link_url) values('Antigo','{link}');
      insert into public.matchday_editorial_bank_items(matchday_id,source_type,source_id,title,link_url)
      values('{uid(902)}','editorial_article','{a['id']}','Antigo','{link}');
      insert into public.matchday_editorial_desk_control(matchday_id,carryover_snapshot)
      values('{uid(902)}',{val(dict(version=2,headline=dict(title='Antigo',link_url=link)))});""")
    result = publish(f,p,o,a)
    assert result['publication_action']=='updated' and result['consolidated'] is False
    after = read_article(a['id'])
    for key in ('id','slug','scope','competition_id','season_id','matchday_id','published_at','created_at','image_caption','image_url'):
        assert before[key]==after[key], key
    assert after['body']==a['body'] and final_counts(f)==[1,0,0,0] and state(f)=='active'
    assert execute(f"select title from public.site_editorial_highlights where link_url='{link}';")==a['title']
    assert execute(f"select title from public.matchday_editorial_bank_items where source_id='{a['id']}';")==a['title']
    assert execute(f"select carryover_snapshot->'headline'->>'title' from public.matchday_editorial_desk_control where matchday_id='{uid(902)}';")==a['title']
    final = finish(f,p)
    assert final['updatedCount']==1 and final_counts(f)==[1,1,1,1] and state(f)=='consolidated'
    assert receipts(f)[0]['decision']=='UPDATE'
    assert finish(f,p)['action']=='reused' and final_counts(f)==[1,1,1,1]


def update_can_revise_article_owned_by_original_creation_plan():
    f=fixture(); p=package(f); o=f['plan']['outputs'][0]; a=article(o)
    original_dossier=str(uuid4()); original_plan=str(uuid4())
    execute(f"""insert into public.newsroom_editorial_dossiers(id,title) values('{original_dossier}','Produção original');
      insert into public.newsroom_editorial_dossier_article_plans(
        id,dossier_id,working_title,status,sort_order,article_kind,length_mode,
        editorial_instructions,destination,editorial_article_id,image_choice
      ) values(
        '{original_plan}','{original_dossier}','Plano original','planned',10,'news','standard',
        '','new','{a['id']}','unselected'
      );""")
    result=publish(f,p,o,a)
    assert result['publication_action']=='updated'
    assert execute(f"select editorial_article_id::text from public.newsroom_editorial_dossier_article_plans where id='{original_plan}';")==a['id']
    assert execute(f"select editorial_article_id is null from public.newsroom_editorial_dossier_article_plans where id='{o['outputId']}';")=='t'
    assert execute(f"select editorial_article_id::text from public.newsroom_mesa_output_publications where dossier_id='{f['dossier']}' and article_plan_id='{o['outputId']}';")==a['id']
    finish(f,p)
    assert receipts(f)[0]['decision']=='UPDATE'


def all_no_change():
    f=fixture(published=2); p=package(f)
    before=[read_article(x) for x in f['articles']]
    ids=[o['outputId'] for o in f['plan']['outputs']]
    result=finish(f,p,ids)
    assert result['noChangeCount']==2 and result['newCount']==result['updatedCount']==0
    assert before==[read_article(x) for x in f['articles']]
    assert {r['decision'] for r in receipts(f)}=={'SEM_ALTERAÇÃO'}
    assert final_counts(f)==[0,1,2,1] and state(f)=='consolidated'
    assert finish(f,p,list(reversed(ids)))['action']=='reused'
    expect_error('mesa-intent-finalization-conflict',lambda:finish(f,p,ids[:1]))
    # A completed replay records history; it never overwrites a later manual edit.
    execute(f"update public.editorial_articles set body='Edição posterior' where id='{f['articles'][0]}';")
    assert finish(f,p,ids)['action']=='reused'
    assert read_article(f['articles'][0])['body']=='Edição posterior'


def mixed_and_partial():
    f=fixture(published=2,new=1,independent=True); p=package(f)
    existing=[o for o in f['plan']['outputs'] if o['kind']=='existing']
    fresh=[o for o in f['plan']['outputs'] if o['kind']=='new']
    publish(f,p,existing[0],article(existing[0]))
    expect_error('mesa-intent-publication-incomplete',lambda:finish(f,p,[existing[1]['outputId']]))
    assert final_counts(f)==[1,0,0,0] and state(f)=='active'
    p2=package(f)
    expect_error('mesa-intent-publication-package-conflict',lambda:publish(f,p2,fresh[0],article(fresh[0])))
    written={}
    for o in fresh:
        a=article(o); publish(f,p,o,a); written[o['contextKey']]=a['id']
    result=finish(f,p,[existing[1]['outputId']])
    assert (result['updatedCount'],result['newCount'],result['noChangeCount'])==(1,2,1)
    assert final_counts(f)==[3,1,3,1]
    theme_articles=scalar(f"select jsonb_agg(editorial_article_id) from public.newsroom_editorial_theme_articles where theme_id='{f['theme']}';")
    independent_article=written['source:'+f['sources'][-1]]
    assert independent_article not in theme_articles
    assert read_article(independent_article)['status']=='published'
    assert written['theme:'+f['theme']] in theme_articles
    assert {r['editorial_article_id'] for r in receipts(f)}==set(theme_articles)
    assert execute(f"select count(*) from public.newsroom_editorial_theme_sources where theme_id='{f['theme']}' and newsroom_article_id='{f['sources'][-1]}';")=='0'


def new_does_not_review_old():
    f=fixture(review=False,new=1); p=package(f); old=f['articles'][0]
    before=read_article(old); o=f['plan']['outputs'][0]; a=article(o)
    assert all(o['kind']=='new' for o in f['plan']['outputs'])
    publish(f,p,o,a); finish(f,p)
    assert read_article(old)==before
    assert len(receipts(f))==1 and receipts(f)[0]['editorial_article_id']==a['id'] and receipts(f)[0]['decision']=='NEW'
    current=scalar(f"select public.newsroom_mesa_intent_latest_receipts_v1('{f['theme']}');")
    assert {r['articleId'] for r in current}=={a['id']}
    # Later explicit review evaluates both actually published articles.
    req=deepcopy(f['request']); req['preparationKey']=str(uuid4())
    req['themes'][0].update(reviewPublished=True,newArticleCount=0)
    prep=prepare(req); next_f={**f,'dossier':prep['dossierId'],'plan':prep['plan']}; next_p=package(next_f)
    assert {o['target']['editorialArticleId'] for o in next_f['plan']['outputs']}=={old,a['id']}
    finish(next_f,next_p,[o['outputId'] for o in next_f['plan']['outputs']])
    latest=scalar(f"select public.newsroom_mesa_intent_latest_receipts_v1('{f['theme']}');")
    assert {r['articleId'] for r in latest}=={old,a['id']}
    assert {r['decision'] for r in latest}=={'SEM_ALTERAÇÃO'}


def retries_and_conflicts():
    f=fixture(new=1); p=package(f)
    for o in f['plan']['outputs']:
        a=article(o); first=publish(f,p,o,a); second=publish(f,p,o,a)
        assert first['editorial_article_id']==second['editorial_article_id'] and second['publication_action']=='reused'
        expect_error('mesa-publication-provenance-conflict',lambda:publish(f,p,o,{**a,'body':'Outro texto'}))
    assert final_counts(f)==[2,0,0,0]
    finish(f,p); assert finish(f,p)['action']=='reused'
    assert final_counts(f)==[2,1,2,1]


def stale_target_and_null_identity():
    for field,value in [('body','Manual'),('slug','manual-slug'),('scope','general')]:
        f=fixture(null_matchday=True);p=package(f);o=f['plan']['outputs'][0];a=article(o)
        execute(f"update public.editorial_articles set {field}='{value}' where id='{a['id']}';")
        expect_error('mesa-intent-update-target-stale',lambda:publish(f,p,o,a))
        expect_error('mesa-intent-no-change-target-stale',lambda:finish(f,p,[o['outputId']]))
        assert read_article(a['id'])[field]==value and final_counts(f)==[0,0,0,0]
    f=fixture(null_matchday=True);p=package(f);o=f['plan']['outputs'][0];a=article(o)
    for change in [dict(id=str(uuid4())),dict(slug='wrong'),dict(matchdayId=uid(902)),dict(mode='create')]:
        expect_error('mesa-publication-',lambda:publish(f,p,o,{**a,**change}))
    assert final_counts(f)==[0,0,0,0]


def edits_after_partial_write():
    f=fixture(new=1);p=package(f);o=f['plan']['outputs'][0];a=article(o)
    publish(f,p,o,a)
    execute(f"update public.editorial_articles set body='Edição depois de publicar' where id='{a['id']}';")
    expect_error('mesa-intent-published-result-stale',lambda:publish(f,p,o,a))
    expect_error('mesa-intent-published-result-stale',lambda:finish(f,p))
    assert final_counts(f)==[1,0,0,0] and state(f)=='active'
    assert read_article(a['id'])['body']=='Edição depois de publicar'


def snapshots():
    f=fixture();p=package(f);o=f['plan']['outputs'][0];a=article(o)
    source=f['plan']['contexts'][0]['sources'][0]
    execute(f"""insert into public.newsroom_article_snapshots(article_id,content_hash,body,source_metadata,extracted_at)
      values('{source['newsroomArticleId']}',repeat('e',64),'[{{"type":"paragraph","text":"Captura posterior"}}]',
        '{{}}','2026-09-17T12:00:00Z');""")
    publish(f,p,o,a);finish(f,p)
    assert receipts(f)[0]['sources'][0]['newsroomSnapshotId']==source['newsroomSnapshotId']
    f=fixture();p=package(f);o=f['plan']['outputs'][0];a=article(o)
    sid=f['plan']['contexts'][0]['sources'][0]['newsroomSnapshotId']
    mutation=f"update public.newsroom_article_snapshots set body='[{{\"type\":\"paragraph\",\"text\":\"Mutada\"}}]' where id='{sid}';"
    expect_error('snapshots are immutable',lambda:execute(mutation))
    # Deliberate corruption injection ONLY in the guarded disposable database.
    # Restore the immutable trigger in the same transaction; production APIs
    # cannot make this write. The publication fingerprint must still detect it.
    execute("begin; alter table public.newsroom_article_snapshots disable trigger newsroom_article_snapshots_immutable;"
            + mutation + "alter table public.newsroom_article_snapshots enable trigger newsroom_article_snapshots_immutable; commit;")
    expect_error('mesa-intent-frozen-source-stale',lambda:publish(f,p,o,a))
    expect_error('mesa-intent-frozen-source-stale',lambda:finish(f,p,[o['outputId']]))
    assert final_counts(f)==[0,0,0,0]


def source_and_package_tampering():
    f=fixture(independent=True);p=package(f);o=f['plan']['outputs'][0];a=article(o)
    other=next(x for x in f['plan']['outputs'] if x['contextKey']!=o['contextKey'])
    expect_error('mesa-publication-source-invalid',lambda:publish(f,p,o,a,ids=p['ids'][other['outputId']]))
    expect_error('mesa-publication-input-invalid',lambda:publish(f,p,o,a,ids=[]))
    ids=p['ids'][o['outputId']]
    expect_error('mesa-publication-input-invalid',lambda:publish(f,p,o,a,ids=ids+ids))
    altered=deepcopy(p['manifest'])
    context=next(c for c in altered['productionIntents']['contexts'] if c['kind']=='theme')
    assert context['reviewPublished'] is True
    context['reviewPublished']=False
    execute(f"update public.newsroom_editorial_source_packages set manifest={val(altered)} where id='{p['id']}';")
    expect_error('mesa-intent-publication-package-invalid',lambda:publish(f,p,o,a))
    assert final_counts(f)==[0,0,0,0]


def decision_validation():
    f=fixture(new=1);p=package(f);existing,new=f['plan']['outputs']
    for ids in [[str(uuid4())],[new['outputId']],[existing['outputId']]*2]:
        expect_error('mesa-intent-',lambda:finish(f,p,ids))
    publish(f,p,existing,article(existing))
    expect_error('mesa-intent-no-change-already-published',lambda:finish(f,p,[existing['outputId']]))
    assert final_counts(f)==[1,0,0,0]


def concurrency():
    f=fixture();p=package(f);o=f['plan']['outputs'][0];a=article(o)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:publish(f,p,o,a),range(2)))
    assert {r['publication_action'] for r in results}=={'updated','reused'}
    assert final_counts(f)==[1,0,0,0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:finish(f,p),range(2)))
    assert {r['action'] for r in results}=={'consolidated','reused'}
    assert final_counts(f)==[1,1,1,1]
    # Different preparations trying to revise the same captured article: one wins.
    f=fixture();p=package(f);req=deepcopy(f['request']);req['preparationKey']=str(uuid4())
    prep=prepare(req);f2={**f,'dossier':prep['dossierId'],'plan':prep['plan']};p2=package(f2)
    def attempt(item):
        fx,px=item;ox=fx['plan']['outputs'][0]
        try:return publish(fx,px,ox,article(ox))['publication_action']
        except RuntimeError as exc:
            assert 'mesa-intent-update-target-stale' in str(exc),str(exc)
            return 'stale'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert set(pool.map(attempt,[(f,p),(f2,p2)]))=={'updated','stale'}


def late_finalization_rollback():
    f=fixture();p=package(f);o=f['plan']['outputs'][0]
    execute("""create function public.publication_test_fail() returns trigger language plpgsql as $$
      begin raise exception 'injected-receipt-failure'; end; $$;
      create trigger publication_test_failure before insert on public.newsroom_mesa_intent_article_receipts
      for each row execute function public.publication_test_fail();""")
    try:
        expect_error('injected-receipt-failure',lambda:finish(f,p,[o['outputId']]))
        assert final_counts(f)==[0,0,0,0] and state(f)=='active'
    finally:
        execute('drop trigger publication_test_failure on public.newsroom_mesa_intent_article_receipts; drop function public.publication_test_fail();')
    finish(f,p,[o['outputId']]);assert final_counts(f)==[0,1,1,1]


def legacy_boundary():
    # Legacy RPC must roll back its earlier article write when the guard rejects it.
    f=fixture();p=package(f);o=f['plan']['outputs'][0];a=article(o);before=read_article(a['id'])
    expect_error('mesa-intent-publication-path-required',lambda:publish(f,p,o,a,legacy=True))
    assert before==read_article(a['id']) and final_counts(f)==[0,0,0,0]
    assert execute(f"select public.newsroom_mesa_consolidate_publication_v2('{f['dossier']}');")=='f'
    # A pre-intent 2C workspace still publishes and automatically consolidates.
    # Reuse the real public preparation/plan RPCs, not rewritten legacy functions.
    refs=[dict(newsroomArticleId=s['newsroomArticleId'],newsroomSnapshotId=s['newsroomSnapshotId'])
      for s in f['plan']['contexts'][0]['sources']]
    raw=scalar(f"select row_to_json(r) from public.newsroom_prepare_mesa_contexts_v3('{uuid4()}','Legado',{val([dict(kind='theme',themeId=f['theme'],sources=refs)])},null,'{{}}') r;")
    d=raw['dossier_id']
    cid=execute(f"select id from public.newsroom_mesa_production_context_items where dossier_id='{d}';")
    ids=scalar(f"select jsonb_agg(dossier_source_id) from public.newsroom_mesa_production_context_sources where dossier_id='{d}';")
    oid=execute(f"select r.article_plan_id from public.newsroom_save_mesa_context_article_plan_v1('{d}',null,'Legado','planned',10,'news','standard','',{uuid_array(ids)},'{cid}') r;")
    execute(f"select public.newsroom_save_dossier_article_plan_state_v1('{d}','{oid}','new',null,'{{}}','unselected',null); select public.newsroom_set_mesa_shared_outputs_v2('{d}',array['{oid}']::uuid[]);")
    ox=dict(outputId=oid,productionContextId=cid,kind='new',contextKey='theme:'+f['theme'],slot='NEW_01',target=None)
    old={**f,'dossier':d,'plan':dict(outputs=[ox])};op=package(old,intent=False)
    result=publish(old,op,ox,article(ox),legacy=True)
    assert result['publication_action']=='created' and result['consolidated'] is True
    assert state(old)=='consolidated' and final_counts(old)==[1,1,0,0]


def material_projection():
    f=fixture(review=False,new=2,sources=2);p=package(f)
    articles=[]
    for o in f['plan']['outputs']:
        a=article(o);publish(f,p,o,a);articles.append(a['id'])
    finish(f,p)
    mats=scalar(f"select jsonb_agg(to_jsonb(m)) from public.newsroom_mesa_material_versions m where production_dossier_id='{f['dossier']}';")
    assert len(mats)==1 and set(mats[0]['article_ids'])==set(articles) and len(mats[0]['source_refs'])==2
    assert execute(f"select count(*) from public.newsroom_mesa_theme_materials where theme_id='{f['theme']}';")=='1'


def permissions():
    f=fixture();p=package(f);o=f['plan']['outputs'][0];a=article(o)
    for role in ('anon','authenticated'):
        expect_error('permission denied',lambda:execute(f'set role {role}; '+publish_sql(f,p,o,a)))
        expect_error('permission denied',lambda:execute(f"set role {role};select public.newsroom_finalize_mesa_intents_v1('{f['dossier']}','{p['id']}','{{}}');"))
        expect_error('permission denied',lambda:execute(f"set role {role};select public.newsroom_mesa_intent_latest_receipts_v1('{f['theme']}');"))
    for table in ('newsroom_mesa_intent_finalizations','newsroom_mesa_intent_article_receipts'):
        assert execute(f"select relrowsecurity and relforcerowsecurity from pg_class where oid='public.{table}'::regclass;")=='t'
        expect_error('permission denied',lambda:execute(f'set role service_role;delete from public.{table};'))
    assert scalar('set role service_role;'+publish_sql(f,p,o,a))['publication_action']=='updated'
    result=scalar(f"set role service_role;select public.newsroom_finalize_mesa_intents_v1('{f['dossier']}','{p['id']}','{{}}');")
    assert result['updatedCount']==1
    assert len(scalar(f"set role service_role;select public.newsroom_mesa_intent_latest_receipts_v1('{f['theme']}');"))==1



def completion_order_does_not_rewind_receipts():
    f=fixture();p=package(f)
    time.sleep(.02)
    req=deepcopy(f['request']);req['preparationKey']=str(uuid4())
    prep=prepare(req);f2={**f,'dossier':prep['dossierId'],'plan':prep['plan']};p2=package(f2)
    assert f['plan']['capturedAt']<f2['plan']['capturedAt']
    finish(f2,p2,[o['outputId'] for o in f2['plan']['outputs']])
    finish(f,p,[o['outputId'] for o in f['plan']['outputs']])
    latest=scalar(f"select public.newsroom_mesa_intent_latest_receipts_v1('{f['theme']}');")
    assert len(latest)==1 and latest[0]['capturedAt']==f2['plan']['capturedAt']


def snapshot_sync_failure_rolls_back_publication():
    f=fixture();p=package(f);o=f['plan']['outputs'][0];a=article(o);before=read_article(a['id'])
    # Fail in the REAL sync function at an explicitly out-of-scope projector,
    # after canonical/output writes. The whole publication must roll back.
    md=str(uuid4())
    execute(f"insert into public.matchdays(id,season_id) values('{md}','{uid(901)}');"
            f"insert into public.matchday_highlights(matchday_id,link_url) values('{md}','/noticias/{a['slug']}');"
            f"insert into jornada_private.matchday_live_layout_physical_cutovers values('{md}');")
    expect_error('physical-layout-projection-outside-this-fixture',lambda:publish(f,p,o,a))
    assert read_article(a['id'])==before and final_counts(f)==[0,0,0,0]
    execute(f"delete from jornada_private.matchday_live_layout_physical_cutovers where matchday_id='{md}';")
    publish(f,p,o,a);finish(f,p)
    assert final_counts(f)==[1,1,1,1]


def finalize_waits_for_inflight_writer():
    f=fixture();p=package(f);o=f['plan']['outputs'][0];a=article(o)
    # The writer holds the same workspace lock before finalization starts.
    # Observe PgSleep to prove overlap instead of relying on thread scheduling.
    sql=(f"begin;set local application_name='intent-{f['dossier']}';select 1 from public.newsroom_mesa_production_contexts where dossier_id='{f['dossier']}' for update;"
         "select pg_sleep(0.5);"+publish_sql(f,p,o,a)+"commit;")
    with ThreadPoolExecutor(max_workers=2) as pool:
        writer=pool.submit(execute,sql)
        observed=False
        for _ in range(100):
            if execute(f"select exists(select 1 from pg_stat_activity where wait_event='PgSleep' and application_name='intent-{f['dossier']}');")=='t':
                observed=True;break
            time.sleep(.005)
        assert observed,'Concurrent writer did not enter the expected lock barrier'
        final=pool.submit(finish,f,p)
        writer.result();result=final.result()
    assert result['updatedCount']==1 and final_counts(f)==[1,1,1,1]


for name,fn in [
    ('UPDATE preserva identidade/contexto nulo e executa sync V15 real',update_preserves_identity_and_live_snapshots),
    ('UPDATE posterior não disputa a ligação canónica do Article Plan original',update_can_revise_article_owned_by_original_creation_plan),
    ('ciclo só SEM ALTERAÇÃO sem reescrita e replay histórico',all_no_change),
    ('UPDATE + NEW + SEM ALTERAÇÃO + Pote independente, publicação parcial',mixed_and_partial),
    ('NEW hoje não revê antigos; revisão posterior avalia todos os publicados',new_does_not_review_old),
    ('repetições reutilizam escritas; conteúdo diferente é conflito',retries_and_conflicts),
    ('edição manual e identidade divergente bloqueiam UPDATE e SEM ALTERAÇÃO',stale_target_and_null_identity),
    ('edição após publicação parcial não é sobrescrita nem certificada',edits_after_partial_write),
    ('snapshot posterior não invalida pacote; mutação da captura congelada invalida',snapshots),
    ('fontes de outro contexto e pacote adulterado não publicam',source_and_package_tampering),
    ('decisões inexistentes, duplicadas e contraditórias são rejeitadas',decision_validation),
    ('publicação/finalização concorrentes e dois ciclos para o mesmo artigo',concurrency),
    ('falha no recibo reverte evento e finalização; retry conclui',late_finalization_rollback),
    ('guard bloqueia publisher antigo só nos intents; legado 2C continua a publicar',legacy_boundary),
    ('materiais técnicos mantêm artigos e fontes do próprio contexto',material_projection),
    ('RLS, privilégios e execução exclusiva pelo servidor',permissions),
    ('concluir captura antiga depois não faz recuar o recibo mais recente',completion_order_does_not_rewind_receipts),
    ('falha no sync V15 reverte artigo, proveniência e utilização das fontes',snapshot_sync_failure_rolls_back_publication),
    ('finalização espera pela publicação em curso antes de certificar',finalize_waits_for_inflight_writer),
]:
    test(name,fn)

report()
files=[MIGRATION,HOTFIX,'.ci/mesa-intents-sql/publication.py','.ci/mesa-intents-sql/run.py']
(args.output/'publication-source-hashes.json').write_text(json.dumps({
  'basis':'c34b202ee815fcfb85ca2c238c49676cd6faa04b',
  'files':{path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in files},
  'scope':'real Mesa SQL + V15 article sync on synthetic auxiliary tables; physical/profile projection excluded',
},ensure_ascii=False,indent=2))
print(f'RESULT: {len(RESULTS)} SQL behavior groups passed (20 preparation + 18 publication)',flush=True)
