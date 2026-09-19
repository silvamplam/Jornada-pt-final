"""Test real intent preparation RPCs in a disposable PostgreSQL 17 database.

Never accepts a URL, password, Supabase project or network hostname. CI uses a
Docker service ID; local use requires an absolute Unix socket path and psql.
The target must be the empty `mesa_organization_test` database on PostgreSQL 17.6.
"""
from __future__ import annotations
import argparse
import ast
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = 'supabase/migrations/20260917210000_newsroom_mesa_intent_preparation_v1.sql'
parser = argparse.ArgumentParser()
parser.add_argument('--socket', type=Path)
parser.add_argument('--psql', default='psql')
parser.add_argument('--port', type=int, default=5432)
parser.add_argument('--container', default='')
parser.add_argument('--output', type=Path, default=Path('/tmp/mesa-intents-evidence'))
args = parser.parse_args()
if args.container:
    if args.socket or not re.fullmatch(r'[0-9a-f]{12,64}', args.container):
        raise SystemExit('A disposable Docker service ID is required')
    COMMAND = ['docker', 'exec', '-i', args.container, 'psql']
else:
    if not args.socket or not args.socket.is_absolute() or not args.socket.is_dir():
        raise SystemExit('An absolute local Unix socket directory is required')
    COMMAND = [args.psql, '-h', str(args.socket), '-p', str(args.port)]
COMMAND += ['-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'mesa_organization_test']
# Ignore PG*, .env files and all connection credentials from the caller.
ENV = {k: os.environ[k] for k in ('PATH', 'LD_LIBRARY_PATH') if k in os.environ}
args.output.mkdir(parents=True, exist_ok=True)
RESULTS: list[dict] = []
PREVIEWS: list[dict] = []


def execute(text: str) -> str:
    proc = subprocess.run(COMMAND, input="SET statement_timeout='30s'; SET lock_timeout='10s';\n" + text,
                          text=True, capture_output=True, timeout=45, env=ENV)
    if proc.returncode:
        raise RuntimeError(proc.stderr.strip())
    return proc.stdout.strip()


def load(path: str, before: str | None = None):
    text = (ROOT / path).read_text(encoding='utf-8-sig')
    if before:
        assert text.count(before) == 1
        text = text.split(before)[0] + '\nCOMMIT;'
    print('LOAD', path, hashlib.sha256(text.encode()).hexdigest(), flush=True)
    execute(text)


def val(value) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return "'" + text.replace("'", "''") + "'::jsonb"


def uid(n: int) -> str:
    return f'b0000000-0000-4000-8000-{n:012}'


def request(key: int, review=True, fresh=0, theme=500, sources=None):
    return dict(version=1, preparationKey=uid(key), title='Ensaio de preparação',
                themes=[] if theme is None else [dict(themeId=uid(theme), action='prepare', reviewPublished=review, newArticleCount=fresh)],
                sources=sources or [])


def selection_request(key: int, source_ids, review_article_ids=(), new=0, theme_ids=(), candidate_article_ids=None):
    selection=dict(
      sourceIds=[uid(n) if isinstance(n,int) else n for n in source_ids],
      reviewArticleIds=[uid(n) if isinstance(n,int) else n for n in review_article_ids],
      newArticleCount=new)
    if theme_ids:
        selection['themeIds']=[uid(n) if isinstance(n,int) else n for n in theme_ids]
    if candidate_article_ids is not None:
        selection['candidateArticleIds']=[uid(n) if isinstance(n,int) else n for n in candidate_article_ids]
    return dict(version=1,preparationKey=uid(key),title='Seleção editorial',
                themes=[],sources=[],selection=selection)

def independent(n: int, count=1):
    return dict(sourceId=uid(n), destination='independent', newArticleCount=count)


def incorporate(n: int, theme=500):
    return dict(sourceId=uid(n), destination='theme', themeId=uid(theme))


def preview(req, keep=True):
    data = json.loads(execute(f'select public.newsroom_mesa_preview_intents_v1({val(req)});'))
    if keep:
        PREVIEWS.append(data)
    return data


def prepare(req, fingerprint=None):
    fp = fingerprint or preview(req)['authorityFingerprint']
    assert re.fullmatch('[0-9a-f]{64}', fp)
    return json.loads(execute(f"select public.newsroom_prepare_mesa_intents_v1({val(req)},'{fp}');"))


def expect_error(code: str, fn):
    try:
        fn()
    except RuntimeError as exc:
        assert code in str(exc), str(exc)
        return
    raise AssertionError(f'Expected {code}; request unexpectedly succeeded')


def counts():
    return execute("select jsonb_build_array((select count(*) from public.newsroom_editorial_theme_sources),"
                   "(select count(*) from public.newsroom_editorial_dossiers),"
                   "(select count(*) from public.newsroom_editorial_dossier_article_plans),"
                   "(select count(*) from public.newsroom_mesa_intent_preparations))::text;")


def test(name, fn):
    try:
        fn()
        RESULTS.append(dict(name=name, passed=True))
        print('PASS', name, flush=True)
    except Exception as exc:
        RESULTS.append(dict(name=name, passed=False, error=str(exc)))
        print('FAIL', name, str(exc), flush=True)
        report()
        raise


def report():
    (args.output / 'sql-report.json').write_text(json.dumps(dict(
        passed=sum(x['passed'] for x in RESULTS), failed=sum(not x['passed'] for x in RESULTS),
        database=identity, tests=RESULTS), ensure_ascii=False, indent=2))
    (args.output / 'sql-previews.json').write_text(json.dumps(PREVIEWS, ensure_ascii=False, indent=2))


identity = execute("select current_database()||'|'||current_setting('server_version_num')||'|'||coalesce(inet_server_addr()::text,'unix-socket');")
assert identity == 'mesa_organization_test|170006|unix-socket', identity
print('TARGET', identity, flush=True)
assert execute("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p');") == '0', 'Test database must be empty'
constants = {}
for node in ast.parse((ROOT / '.ci/mesa-contexts-2c-sql/run.py').read_text()).body:
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
        try:
            constants[node.targets[0].id] = ast.literal_eval(node.value)
        except (ValueError, TypeError):
            pass
for path in constants['BASE_SQL']:
    load(path)
load('supabase/steps/31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql', 'create table public.newsroom_editorial_compose_requests')
load('supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-rascunho-geracao-controlada-1-aplicar.sql')
for path in constants['MESA_MIGRATIONS']:
    load(path)
load(constants['MIGRATION_2C'])
load(constants['SCOPED_READ_MIGRATION'])
load('supabase/migrations/20260914114311_newsroom_mesa_theme_continuity_v1.sql')
load('supabase/sql/newsroom-mesa-global-article-candidates-v1.sql')

# Capture old function definitions, privileges and configuration before applying
# the additive migration. A failed comparison must stop the build.
old_functions_query = """select coalesce(jsonb_object_agg(p.oid::regprocedure::text,
  md5(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||coalesce(p.proconfig::text,''))), '{}')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
  and p.proname not in ('newsroom_mesa_normalize_intent_v1','newsroom_mesa_intent_source_v1',
    'newsroom_mesa_preview_intents_v1','newsroom_prepare_mesa_intents_v1');"""
before_functions = execute(old_functions_query)
load(MIGRATION)
assert before_functions == execute(old_functions_query)
print('PASS original RPC definitions/privileges unchanged', flush=True)
load('supabase/sql/newsroom-mesa-selection-context-v1.sql')
post_selection_functions = execute(old_functions_query)
load('supabase/sql/test-newsroom-mesa-contexts-production-2c-pg17.sql')

seed = []
for n in range(1, 31):
    seed.append(f"""insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,
      detected_at,first_detected_at,last_detected_at,processing_status) values('{uid(n)}','__intent_test__',
      'https://example.invalid/{n}','https://example.invalid/{n}','Fonte {n}',now(),now(),now(),'ready_for_review');
      insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at)
      values('{uid(100+n)}','{uid(n)}',repeat('a',64),'[{{"type":"paragraph","text":"Fonte local {n}"}}]',
      '{{"fixture":true}}','2026-09-17T10:00:00Z');
      insert into public.newsroom_editorial_article_classifications(newsroom_article_id,classification_key,classification_source)
      values('{uid(n)}','sporting','automatic');""")
for n in range(500, 524):
    seed.append(f"insert into public.newsroom_editorial_themes(id,title,classification_key) values('{uid(n)}','Tema {n}','sporting');")
for theme, sources in [(500,[1,2]), (501,[4]), (502,[5]), (503,[6]), (504,[7])]:
    for n in sources:
        seed.append(f"select public.newsroom_set_editorial_theme_source_membership_v1('{uid(theme)}','{uid(n)}',true);")
seed.append(f"""insert into public.competitions(id) values('{uid(900)}');
insert into public.seasons(id,competition_id) values('{uid(901)}','{uid(900)}');
insert into public.matchdays(id,season_id) values('{uid(902)}','{uid(901)}');""")
for article, theme, matchday, status in [(2001,500,902,'published'), (2002,502,902,'published'), (2003,503,None,'published'), (2004,501,902,'draft')]:
    seed.append(f"""insert into public.editorial_articles(id,title,slug,status,label,subtitle,body,author,matchday_id,published_at)
      values('{uid(article)}','Artigo {article}','artigo-{article}','{status}','Ante','Pós','Corpo original','Editor',
      {'null' if matchday is None else repr(uid(matchday))},'2026-09-17T11:00:00Z');
      insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id) values('{uid(theme)}','{uid(article)}');""")
execute('\n'.join(seed))
execute(f"""insert into public.editorial_articles(id,title,slug,status,label,subtitle,body,author,matchday_id,published_at)
  values('{uid(2101)}','Histórico A','historico-a','published','Ante','Pós','Corpo A','Editor','{uid(902)}','2026-09-17T11:10:00Z'),
        ('{uid(2102)}','Histórico B','historico-b','published','Ante','Pós','Corpo B','Editor','{uid(902)}','2026-09-17T11:20:00Z'),
        ('{uid(2103)}','Legado direto','legado-direto','published','Ante','Pós','Corpo C','Editor','{uid(902)}','2026-09-17T11:30:00Z'),
        ('{uid(2104)}','Legado output','legado-output','published','Ante','Pós','Corpo D','Editor','{uid(902)}','2026-09-17T11:40:00Z'),
        ('{uid(2105)}','Rascunho','rascunho-global','draft','Ante','Pós','Corpo draft','Editor','{uid(902)}','2026-09-17T11:50:00Z');
  insert into public.newsroom_editorial_dossiers(id,title)
    values('{uid(9201)}','Dossiê histórico A'),('{uid(9202)}','Dossiê histórico B'),('{uid(9203)}','Dossiê rascunho');
  insert into public.newsroom_editorial_dossier_sources(id,dossier_id,newsroom_article_id,newsroom_snapshot_id,source_role,sort_order)
    values('{uid(9211)}','{uid(9201)}','{uid(17)}','{uid(117)}','primary',10),
          ('{uid(9212)}','{uid(9202)}','{uid(17)}','{uid(117)}','primary',10),
          ('{uid(9213)}','{uid(9203)}','{uid(20)}','{uid(120)}','primary',10);
  insert into public.newsroom_editorial_dossier_article_plans(
    id,dossier_id,working_title,status,sort_order,article_kind,length_mode,editorial_instructions,destination,editorial_article_id,image_choice
  ) values
    ('{uid(9221)}','{uid(9201)}','Plano histórico A','planned',10,'news','standard','','new','{uid(2101)}','unselected'),
    ('{uid(9222)}','{uid(9202)}','Plano histórico B','planned',10,'news','standard','','new','{uid(2102)}','unselected'),
    ('{uid(9223)}','{uid(9203)}','Plano rascunho','planned',10,'news','standard','','new','{uid(2105)}','unselected');
  insert into public.newsroom_editorial_dossier_article_plan_sources(dossier_id,article_plan_id,dossier_source_id,sort_order)
    values('{uid(9201)}','{uid(9221)}','{uid(9211)}',10),('{uid(9202)}','{uid(9222)}','{uid(9212)}',10),
          ('{uid(9203)}','{uid(9223)}','{uid(9213)}',10);
  insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
  values(
    '{uid(9301)}','2026','09',
    jsonb_build_object('version',2,'packageId','{uid(9301)}','year','2026','month','09','entries',jsonb_build_array(
      jsonb_build_object('status','prepared','position',1,'articlePosition',1,'newsroomArticleId','{uid(18)}',
        'newsroomSnapshotId','{uid(118)}','publishedArticleId','{uid(2103)}','usedAt','2026-09-17T11:31:00Z')
    )),
    'Pacote legado direto'
  ),(
    '{uid(9302)}','2026','09',
    jsonb_build_object('version',2,'packageId','{uid(9302)}','year','2026','month','09',
      'entries',jsonb_build_array(jsonb_build_object('status','prepared','position',1,'articlePosition',1,
        'newsroomArticleId','{uid(19)}','newsroomSnapshotId','{uid(119)}')),
      'outputs',jsonb_build_array(jsonb_build_object('position',1,'sourceArticlePosition',1,
        'publishedArticleId','{uid(2104)}','usedAt','2026-09-17T11:41:00Z'))
    ),
    'Pacote legado output'
  );""")
original_articles = execute("select md5(jsonb_agg(to_jsonb(a) order by a.id)::text) from public.editorial_articles a;")



def global_candidates(source_ids=(), theme_ids=()):
    def ids(values):
        return "array[" + ",".join(repr(value) for value in values) + "]::uuid[]" if values else "'{}'::uuid[]"
    return json.loads(execute(
        f"select candidates from public.newsroom_mesa_global_article_candidates_v1({ids(source_ids)},{ids(theme_ids)});"
    ))


def global_candidate_resolver():
    theme_candidates=global_candidates((),[uid(500)])
    assert [row['editorialArticleId'] for row in theme_candidates]==[uid(2001)]
    assert theme_candidates[0]['evidence']['kinds']==['theme_relation']

    dossier_candidates=global_candidates([uid(17)])
    assert {row['editorialArticleId'] for row in dossier_candidates}=={uid(2101),uid(2102)}
    assert all(row['evidence']['kinds']==['dossier_plan'] for row in dossier_candidates)

    assert [row['editorialArticleId'] for row in global_candidates([uid(18)])]==[uid(2103)]
    execute(f"select public.newsroom_set_editorial_theme_source_membership_v1('{uid(520)}','{uid(18)}',true);")
    by_theme_source=global_candidates((),[uid(520)])
    assert [row['editorialArticleId'] for row in by_theme_source]==[uid(2103)]
    assert 'legacy_package' in by_theme_source[0]['evidence']['kinds']
    assert [row['editorialArticleId'] for row in global_candidates([uid(19)])]==[uid(2104)]
    assert global_candidates([uid(20)])==[]

    mixed=global_candidates([uid(17)],[uid(500)])
    assert {row['editorialArticleId'] for row in mixed}=={uid(2001),uid(2101),uid(2102)}
    # One source may legitimately have several published articles: ambiguity
    # is returned to the editor and is never collapsed into an automatic winner.
    assert len(global_candidates([uid(17)]))==2

    for role in ['anon','authenticated']:
        expect_error('permission denied',lambda role=role:execute(
          f"set role {role};select * from public.newsroom_mesa_global_article_candidates_v1('{{{uid(17)}}}','{{}}');"
        ))
    service=json.loads(execute(
      f"set role service_role;select candidates from public.newsroom_mesa_global_article_candidates_v1('{{{uid(17)}}}','{{}}');"
    ))
    assert len(service)==2

def no_writes_preview():
    old = counts()
    p = preview(request(8000, sources=[incorporate(3)]))
    assert p['totals'] == dict(contexts=1, sources=3, reviews=1, newArticles=0)
    assert p['incorporations'] == [dict(themeId=uid(500),sourceId=uid(3))]
    assert counts() == old


def three_modes():
    for index, (review, fresh) in enumerate([(True,0),(True,2),(False,2)]):
        p = prepare(request(8010+index, review, fresh))['plan']
        assert p['totals'] == dict(contexts=1,sources=2,reviews=int(review),newArticles=fresh)
        assert len(p['contexts'][0]['publishedArticles']) == 1
        for o in p['outputs']:
            assert o['outputId'] and o['productionContextId']
            if o['kind'] == 'existing':
                assert o['target']['editorialArticleId'] == uid(2001)
                assert o['target']['slug'] == 'artigo-2001'
        did=p['dossierId']
        rows=json.loads(execute(f"select jsonb_agg(jsonb_build_object('destination',destination,'target',update_target_editorial_article_id)) from public.newsroom_editorial_dossier_article_plans where dossier_id='{did}';"))
        assert sum(x['destination']=='update' for x in rows)==int(review)
        assert sum(x['destination']=='new' for x in rows)==fresh


def unpublished():
    p=prepare(request(8020,False,2,501))['plan']
    assert p['contexts'][0]['publishedArticles']==[]
    assert len(p['outputs'])==2 and all(o['kind']=='new' for o in p['outputs'])
    expect_error('mesa-intent-nothing-to-review',lambda:preview(request(8021,True,0,501)))
    expect_error('mesa-intent-theme-work-missing',lambda:preview(request(8022,False,0)))


def mixed():
    p=prepare(request(8030,sources=[independent(3)]))['plan']
    src, theme=p['contexts']
    assert src['kind']=='source' and src['themeId'] is None and src['publishedArticles']==[]
    assert [s['newsroomArticleId'] for s in src['sources']]==[uid(3)]
    assert [s['newsroomArticleId'] for s in theme['sources']]==[uid(1),uid(2)]
    for o in p['outputs']:
        ids=json.loads(execute(f"select jsonb_agg(s.newsroom_article_id order by s.newsroom_article_id) from public.newsroom_editorial_dossier_article_plan_sources ps join public.newsroom_editorial_dossier_sources s on s.id=ps.dossier_source_id where ps.article_plan_id='{o['outputId']}';"))
        assert ids==([uid(1),uid(2)] if o['kind']=='existing' else [uid(3)])
    assert execute(f"select count(*) from public.newsroom_editorial_theme_sources where newsroom_article_id='{uid(3)}';")=='0'


def incorporation():
    req=request(8040,sources=[incorporate(3),independent(8,2)])
    p=preview(req); r=prepare(req,p['authorityFingerprint'])
    assert r['plan']['totals']==dict(contexts=2,sources=4,reviews=1,newArticles=2)
    assert execute(f"select count(*) from public.newsroom_editorial_theme_sources where theme_id='{uid(500)}' and newsroom_article_id='{uid(3)}';")=='1'
    assert execute(f"select count(*) from public.newsroom_editorial_theme_sources where newsroom_article_id='{uid(8)}';")=='0'
    before=counts(); again=prepare(req,p['authorityFingerprint'])
    assert again['preparationAction']=='reused' and again['plan']==r['plan'] and before==counts()
    expect_error('mesa-intent-preparation-conflict',lambda:prepare(request(8040,False,1,sources=[incorporate(3),independent(8,2)]),p['authorityFingerprint']))
    expect_error('mesa-intent-preparation-conflict',lambda:prepare(req,'0'*64))


def null_matchday():
    p=prepare(request(8050,theme=503))['plan']
    assert p['outputs'][0]['target']['matchdayId'] is None
    assert p['outputs'][0]['target']['article']['matchday_id'] is None


def deferred():
    req=request(8060,theme=None,sources=[independent(8),dict(sourceId=uid(9998),destination='defer')])
    req['themes']=[dict(themeId=uid(9999),action='defer')]
    p=prepare(req)['plan']
    assert p['totals']['contexts']==1 and p['totals']['reviews']==0
    assert p['deferred']==dict(themeIds=[uid(9999)],sourceIds=[uid(9998)])


def stale_snapshot():
    req=request(8070,sources=[incorporate(9)])
    p=preview(req); old=counts()
    execute(f"insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at) values('{uid(1111)}','{uid(1)}',repeat('b',64),'[{{\"type\":\"paragraph\",\"text\":\"Nova versão\"}}]','{{}}','2026-09-17T12:00:00Z');")
    expect_error('mesa-intent-authority-stale',lambda:prepare(req,p['authorityFingerprint']))
    assert counts()==old
    updated=preview(req)
    assert updated['contexts'][0]['sources'][0]['newsroomSnapshotId']==uid(1111)
    prepare(req,updated['authorityFingerprint'])


def stale_body():
    for key, review, fresh in [(8080,True,0),(8081,False,1)]:
        req=request(key,review,fresh); p=preview(req); old=counts()
        execute(f"update public.editorial_articles set body='Alteração entretanto' where id='{uid(2001)}';")
        expect_error('mesa-intent-authority-stale',lambda:prepare(req,p['authorityFingerprint']))
        assert counts()==old
        execute(f"update public.editorial_articles set body='Corpo original' where id='{uid(2001)}';")


def unchanged_reread():
    req=request(8090)
    first=preview(req); time.sleep(.025); second=preview(req)
    assert first['capturedAt']!=second['capturedAt']
    assert first['authorityFingerprint']==second['authorityFingerprint']


def failure_rolls_back():
    # Failure injected AFTER association and workspace creation; rollback must
    # remove both the membership and the intermediate workspace/plan rows.
    execute("""create function public.intent_test_fail() returns trigger language plpgsql as $$
      begin raise exception 'intent-test-late-failure'; end; $$;
      create trigger intent_test_failure before insert on public.newsroom_mesa_intent_preparations
      for each row execute function public.intent_test_fail();""")
    old=counts()
    try:
        expect_error('intent-test-late-failure',lambda:prepare(request(8100,sources=[incorporate(10)])))
        assert counts()==old
    finally:
        execute('drop trigger intent_test_failure on public.newsroom_mesa_intent_preparations; drop function public.intent_test_fail();')
    assert execute(f"select count(*) from public.newsroom_editorial_theme_sources where newsroom_article_id='{uid(10)}';")=='0'


def parallel_replay():
    req=request(8110,sources=[incorporate(10)])
    p=preview(req)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:prepare(req,p['authorityFingerprint']),range(2)))
    assert {r['preparationAction'] for r in results}=={'created','reused'}
    assert results[0]['dossierId']==results[1]['dossierId']
    assert execute(f"select count(*) from public.newsroom_mesa_intent_preparations where preparation_key='{uid(8110)}';")=='1'


def invalid_shapes():
    for field,value in [('newArticleCount',-1),('newArticleCount',1.5),('newArticleCount','2'),('reviewPublished','true')]:
        req=request(8120); req['themes'][0][field]=value
        expect_error('mesa-intent-theme-invalid',lambda:preview(req))
    req=request(8121); req['targets']=[uid(2002)]
    expect_error('mesa-intent-input-invalid',lambda:preview(req))
    req=request(8122); req['themes']*=2
    expect_error('mesa-intent-selection-duplicate',lambda:preview(req))
    expect_error('mesa-intent-incorporation-target-invalid',lambda:preview(request(8123,sources=[incorporate(11,501)])))
    expect_error('mesa-intent-no-work-requested',lambda:preview(request(8124,theme=None)))
    expect_error('mesa-intent-independent-source-not-loose',lambda:preview(request(8125,theme=None,sources=[independent(1)])))


def limits():
    old=counts()
    expect_error('mesa-intent-output-limit',lambda:prepare(request(8130,True,30)))
    expect_error('mesa-intent-source-limit',lambda:prepare(request(8131,sources=[incorporate(n) for n in range(11,31)])))
    assert old==counts()


def unusable():
    execute(f"insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,detected_at,first_detected_at,last_detected_at,processing_status) values('{uid(31)}','__intent_test__','https://example.invalid/31','https://example.invalid/31','Sem snapshot',now(),now(),now(),'ready_for_review');")
    expect_error('mesa-intent-source-snapshot-unavailable',lambda:preview(request(8140,theme=None,sources=[independent(31)])))
    execute(f"insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at) values('{uid(1112)}','{uid(12)}',repeat('c',64),'[]','{{}}','2026-09-17T12:00:00Z');")
    expect_error('mesa-intent-source-snapshot-unavailable',lambda:preview(request(8141,theme=None,sources=[independent(12)])))
    execute(f"delete from public.newsroom_editorial_article_classifications where newsroom_article_id='{uid(13)}';")
    expect_error('mesa-intent-classification-required',lambda:preview(request(8142,theme=None,sources=[independent(13)])))


def overlapping_themes():
    execute(f"insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id) values('{uid(504)}','{uid(2001)}');")
    req=request(8150); req['themes'].append(dict(themeId=uid(504),action='prepare',reviewPublished=True,newArticleCount=0))
    expect_error('mesa-intent-review-target-conflict',lambda:preview(req))
    req['themes'][1].update(reviewPublished=False,newArticleCount=1)
    p=prepare(req)['plan']
    assert p['totals']['reviews']==1 and p['totals']['newArticles']==1 and len(p['contexts'])==2


def same_member():
    req=request(8160,sources=[incorporate(1)])
    p=preview(req); old=execute('select count(*) from public.newsroom_editorial_theme_sources;')
    assert p['incorporations']==[]
    prepare(req)
    assert execute('select count(*) from public.newsroom_editorial_theme_sources;')==old


def context_mixture():
    req=request(8170)
    req['themes'] += [dict(themeId=uid(501),action='prepare',reviewPublished=False,newArticleCount=2),
                      dict(themeId=uid(502),action='prepare',reviewPublished=False,newArticleCount=1)]
    req['sources']=[incorporate(14,501),incorporate(15,502),independent(16,2)]
    p=prepare(req)['plan']
    assert p['totals']['contexts']==4 and p['totals']['reviews']==1 and p['totals']['newArticles']==5
    bykey={c['key']:c for c in p['contexts']}
    assert uid(14) in [s['newsroomArticleId'] for s in bykey['theme:'+uid(501)]['sources']]
    assert uid(14) not in [s['newsroomArticleId'] for s in bykey['theme:'+uid(502)]['sources']]


def selection_context():
    req=selection_request(8190,[17],[2101],2)
    p=preview(req)
    assert p['totals']==dict(contexts=1,sources=1,reviews=1,newArticles=2)
    assert p['contexts'][0]['kind']=='selection'
    assert p['contexts'][0]['key']=='selection:'+uid(8190)
    assert [x['editorialArticleId'] for x in p['contexts'][0]['publishedArticles']]==[uid(2101)]
    assert [o['kind'] for o in p['outputs']]==['existing','new','new']
    prepared=prepare(req,p['authorityFingerprint'])['plan']
    assert prepared['contexts'][0]['kind']=='selection'
    assert execute(f"select context_kind from public.newsroom_mesa_production_context_items where dossier_id='{prepared['dossierId']}';")=='selection'

def selection_ambiguity_is_explicit():
    both=preview(selection_request(8191,[17],[2101,2102],0))
    assert [x['editorialArticleId'] for x in both['contexts'][0]['publishedArticles']]==[uid(2101),uid(2102)]
    one=preview(selection_request(8192,[17],[2102],1))
    assert [x['editorialArticleId'] for x in one['contexts'][0]['publishedArticles']]==[uid(2102)]
    assert [o['kind'] for o in one['outputs']]==['existing','new']
    expect_error('mesa-intent-selection-target-unavailable',lambda:preview(selection_request(8193,[17],[2999],0)))
    expect_error('mesa-intent-selection-invalid',lambda:preview(selection_request(8194,[17],[],0)))

def selection_can_mix_theme_member_and_loose_source():
    # Earlier scenarios may already have organized source 3. The property under
    # test is that selection preserves organization exactly as it found it.
    memberships_before=execute(f"""select coalesce(jsonb_agg(jsonb_build_object(
      'themeId',theme_id,'sourceId',newsroom_article_id) order by theme_id,newsroom_article_id),'[]'::jsonb)::text
      from public.newsroom_editorial_theme_sources
      where newsroom_article_id in ('{uid(1)}','{uid(3)}');""")
    req=selection_request(8195,[1,3],[],3)
    p=prepare(req)['plan']
    assert p['totals']==dict(contexts=1,sources=2,reviews=0,newArticles=3)
    assert p['contexts'][0]['kind']=='selection'
    assert {s['newsroomArticleId'] for s in p['contexts'][0]['sources']}=={uid(1),uid(3)}
    memberships_after=execute(f"""select coalesce(jsonb_agg(jsonb_build_object(
      'themeId',theme_id,'sourceId',newsroom_article_id) order by theme_id,newsroom_article_id),'[]'::jsonb)::text
      from public.newsroom_editorial_theme_sources
      where newsroom_article_id in ('{uid(1)}','{uid(3)}');""")
    assert memberships_after==memberships_before



def selection_theme_union():
    memberships_before=execute(f"""select coalesce(jsonb_agg(to_jsonb(m) order by m.theme_id,m.newsroom_article_id),'[]'::jsonb)::text
      from public.newsroom_editorial_theme_sources m
      where m.theme_id='{uid(500)}' or m.newsroom_article_id='{uid(3)}';""")
    req=selection_request(8196,[3],[2001],1,theme_ids=[500],candidate_article_ids=[2001])
    p=prepare(req)['plan']
    assert p['totals']==dict(contexts=1,sources=3,reviews=1,newArticles=1)
    assert len(p['contexts'])==1 and p['contexts'][0]['kind']=='selection'
    assert {x['newsroomArticleId'] for x in p['contexts'][0]['sources']}=={uid(1),uid(2),uid(3)}
    assert [x['editorialArticleId'] for x in p['contexts'][0]['candidateArticles']]==[uid(2001)]
    assert [o['kind'] for o in p['outputs']]==['existing','new']
    memberships_after=execute(f"""select coalesce(jsonb_agg(to_jsonb(m) order by m.theme_id,m.newsroom_article_id),'[]'::jsonb)::text
      from public.newsroom_editorial_theme_sources m
      where m.theme_id='{uid(500)}' or m.newsroom_article_id='{uid(3)}';""")
    assert memberships_after==memberships_before


def selection_theme_finds_article_without_theme_article_relation():
    assert execute(f"select count(*) from public.newsroom_editorial_theme_articles where theme_id='{uid(520)}';")=='0'
    stale=selection_request(8197,[],[],1,theme_ids=[520],candidate_article_ids=[])
    expect_error('mesa-intent-selection-candidates-stale',lambda:preview(stale))
    req=selection_request(8198,[],[2103],0,theme_ids=[520],candidate_article_ids=[2103])
    p=prepare(req)['plan']
    assert p['totals']==dict(contexts=1,sources=1,reviews=1,newArticles=0)
    assert p['contexts'][0]['sources'][0]['newsroomArticleId']==uid(18)
    assert p['outputs'][0]['target']['editorialArticleId']==uid(2103)
    assert execute(f"select count(*) from public.newsroom_editorial_theme_articles where theme_id='{uid(520)}';")=='0'

def permissions():
    req=request(8180); p=preview(req)
    for role in ['anon','authenticated']:
        expect_error('permission denied',lambda:execute(f"set role {role}; select public.newsroom_mesa_preview_intents_v1({val(req)});"))
        expect_error('permission denied',lambda:execute(f"set role {role}; select public.newsroom_prepare_mesa_intents_v1({val(req)},'{p['authorityFingerprint']}');"))
        expect_error('permission denied',lambda:execute(f'set role {role}; select * from public.newsroom_mesa_intent_preparations;'))
    result=json.loads(execute(f"set role service_role; select public.newsroom_prepare_mesa_intents_v1({val(req)},'{p['authorityFingerprint']}');"))
    assert result['preparationAction']=='created'
    expect_error('permission denied',lambda:execute("set role service_role; delete from public.newsroom_mesa_intent_preparations;"))
    expect_error('permission denied',lambda:execute("set role service_role; update public.newsroom_mesa_intent_preparations set frozen_plan='{}';"))


def stable_edit_identity():
    assert original_articles==execute("select md5(jsonb_agg(to_jsonb(a) order by a.id)::text) from public.editorial_articles a;")
    assert execute('select count(*) from public.newsroom_mesa_output_publications;')=='0'
    assert execute('select count(*) from public.newsroom_mesa_publication_events;')=='0'
    assert post_selection_functions==execute(old_functions_query)


for name,fn in [
    ('resolvedor global conserva proveniência e ambiguidade sem adivinhar',global_candidate_resolver),
    ('preview não associa nem escreve',no_writes_preview),
    ('três modos criam planos reais com destinos separados',three_modes),
    ('Tema sem publicados e rascunho não geram revisões',unpublished),
    ('Tema publicado + fonte independente isolados',mixed),
    ('incorporação e replay sem duplicação',incorporation),
    ('artigo sem jornada mantém contexto nulo',null_matchday),
    ('adiar Tema indisponível não bloqueia fonte independente',deferred),
    ('snapshot novo invalida captura anterior antes de escrever',stale_snapshot),
    ('alteração do corpo publicado invalida revisão e referência',stale_body),
    ('reler material igual não provoca conflito pelo relógio',unchanged_reread),
    ('falha tardia reverte associações e todos os planos',failure_rolls_back),
    ('dois cliques concorrentes produzem um único workspace',parallel_replay),
    ('pedidos malformados e alvos forjados são rejeitados',invalid_shapes),
    ('limites rejeitam conjunto sem truncar nem escrever',limits),
    ('snapshot ausente/vazio e classificação ausente são explícitos',unusable),
    ('mesmo artigo não recebe duas revisões simultâneas',overlapping_themes),
    ('fonte já associada não duplica a relação',same_member),
    ('decisões independentes em vários Temas e fontes',context_mixture),
    ('selection congela fontes juntas e mantém Article Plans existentes',selection_context),
    ('selection preserva ambiguidade e alvos explícitos',selection_ambiguity_is_explicit),
    ('selection mistura fonte de Tema e fonte solta sem reorganizar',selection_can_mix_theme_member_and_loose_source),
    ('selection une Tema e fontes soltas num único contexto',selection_theme_union),
    ('Tema sem relação de artigo recupera artigo pela proveniência da fonte',selection_theme_finds_article_without_theme_article_relation),
    ('permissões negam clientes e escrita direta',permissions),
    ('preparação não publica nem marca artigos revistos',stable_edit_identity),
]:
    test(name,fn)
report()
print(f'RESULT: {len(RESULTS)} SQL behavior groups passed; {len(PREVIEWS)} real-authority plans exported',flush=True)
