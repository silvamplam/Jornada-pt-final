"""Isolated PostgreSQL integration test; never reads connection env or .env files."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
CID = os.environ.get('MESA_TEST_CONTAINER', '')
if not re.fullmatch(r'[0-9a-f]{12,64}', CID):
    raise SystemExit('A GitHub Actions PostgreSQL service container ID is required')
CMD = ['docker', 'exec', '-i', CID, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'mesa_organization_test']
RESULTS = []


def sql(text, *, allow_failure=False):
    proc = subprocess.run(CMD, input="SET statement_timeout='20s'; SET lock_timeout='10s';\n" + text,
                          text=True, encoding='utf-8', capture_output=True, timeout=35)
    if proc.returncode and not allow_failure:
        raise RuntimeError(proc.stderr + '\n' + proc.stdout)
    return proc


def text(path):
    return (ROOT / path).read_text(encoding='utf-8-sig').replace('\r\n', '\n')


def load(path, before=None):
    content = text(path)
    print('LOAD', path, hashlib.sha256(content.encode()).hexdigest(), flush=True)
    if before:
        assert content.count(before) == 1, path
        content = content.split(before)[0] + '\nCOMMIT;\n'
    out = sql(content)
    if out.stdout.strip():
        print(out.stdout, flush=True)


def case(name, fn):
    try:
        fn()
        RESULTS.append({'test': name, 'result': 'PASS'})
        print('PASS:', name, flush=True)
    except Exception as exc:
        RESULTS.append({'test': name, 'result': 'FAIL', 'detail': str(exc)})
        print('FAIL:', name, '\n', exc, flush=True)


def scalar(query):
    return sql(query).stdout.strip()


def uid(n):
    return f'95000000-0000-4000-8000-{n:012d}'


def check(value, message):
    if not value:
        raise AssertionError(message)


def organize(key, theme=None, sources=(1,), title='Cobertura de teste'):
    theme_sql = f"'{theme}'" if theme else 'null'
    source_sql = ','.join("'" + uid(i) + "'" for i in sources)
    return f"select row_to_json(r) from public.newsroom_organize_theme_sources_v1('{uid(key)}',{theme_sql},'{title}','sporting',array[{source_sql}]::uuid[]) r;"


def row(statement):
    return json.loads(scalar('SET ROLE service_role; ' + statement))


def prepare(theme, key, source=1):
    return f"select row_to_json(r) from public.newsroom_prepare_theme_dossier_v1('{theme}','{uid(key)}','Producao de teste',array['{uid(source)}']::uuid[],array['{uid(100+source)}']::uuid[],'{{}}'::uuid[]) r;"


def parallel_same_request():
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(lambda _: row(organize(501, sources=(1, 2))), range(6)))
    check(len({r['theme_id'] for r in rows}) == 1, 'duplicate themes')
    check(sum(not r['reused'] for r in rows) == 1, 'request executed more than once')


def parallel_preparation():
    theme = row(organize(502))['theme_id']
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(lambda _: row(prepare(theme, 601)), range(6)))
    check(len({r['dossier_id'] for r in rows}) == 1, 'duplicate dossiers')
    check(sum(r['preparation_action'] == 'created' for r in rows) == 1, 'preparation executed more than once')


def cross_theme_conflict():
    themes = [row(organize(503 + i))['theme_id'] for i in range(2)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda t: sql('SET ROLE service_role; ' + prepare(t, 602), allow_failure=True), themes))
    check(sum(p.returncode == 0 for p in results) == 1, 'one parent must win')
    check(all(p.returncode == 0 or 'dossier-already-linked' in p.stderr for p in results), 'unexpected rejection')
    check(scalar(f"select count(*) from public.newsroom_editorial_dossiers where preparation_key='{uid(602)}'") == '1', 'wrong dossier count')


def legacy_delete_race():
    theme = row(organize(510, sources=(1, 2)))['theme_id']
    dossier = row(prepare(theme, 610, source=2))['dossier_id']
    # T1 inserts a dossier source and completes its membership trigger but holds
    # the transaction open. T2 tries the pre-existing membership-removal writer.
    statement = f"""BEGIN; SET LOCAL ROLE service_role;
INSERT INTO public.newsroom_editorial_dossier_sources(dossier_id,newsroom_article_id,newsroom_snapshot_id)
VALUES('{dossier}','{uid(1)}','{uid(101)}');
SELECT pg_sleep(3); COMMIT;"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(sql, statement)
        # Observe T1 sleeping only after all insertion triggers have completed.
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if scalar("select count(*) from pg_stat_activity where datname=current_database() and wait_event='PgSleep'") != '0':
                break
            time.sleep(.1)
        else:
            raise AssertionError('concurrency barrier was not reached')
        removal = sql(f"SET ROLE service_role; select * from public.newsroom_set_editorial_theme_source_membership_v1('{theme}','{uid(1)}',false);", allow_failure=True)
        future.result()
    check(removal.returncode == 0 or 'source-in-dossier' in removal.stderr, 'unexpected removal error: ' + removal.stderr)
    check(scalar(f"select count(*) from public.newsroom_editorial_theme_sources where theme_id='{theme}' and newsroom_article_id='{uid(1)}'") == '1',
          'CONTAINMENT BROKEN: committed dossier source missing from its parent Theme')


try:
    for entry in json.loads(text('.ci/mesa-sql/inputs.json')):
        check(hashlib.sha256(text(entry['path']).encode()).hexdigest() == entry['sha256Lf'], 'SQL input differs from the approved snapshot: ' + entry['path'])
    check(scalar("select current_database() || ':' || current_setting('server_version_num') || ':' || coalesce(inet_server_addr()::text,'unix-socket')") == 'mesa_organization_test:170006:unix-socket', 'unexpected server')
    load('.ci/mesa-sql/bootstrap.sql')
    load('supabase/steps/15-redacao-automatica-newsroom-apply.sql')
    load('supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-aplicar.sql')
    load('supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigos-planeados-schema-1-aplicar.sql')
    load('supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigo-planeado-rascunho-controlado-1-aplicar.sql')
    # Verbatim frozen-source columns + immutable-identity trigger from step 31.
    # Unrelated compose/generation operations below this marker are not needed.
    load('supabase/steps/31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql', 'create table public.newsroom_editorial_compose_requests')
    load('supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-rascunho-geracao-controlada-1-aplicar.sql')
    load('supabase/steps/53-redacao-automatica-pacotes-fontes-persistentes-apply.sql')
    load('supabase/migrations/20260908112602_newsroom_editorial_themes_foundation.sql')
    load('supabase/migrations/20260909100000_newsroom_editorial_production_workspace_foundation.sql')
    case('Foundation regression before new migration', lambda: load('supabase/sql/jornada-redacao-workspace-producao-fundacao-1-smoke-rollback.sql'))
    # Existing membership must not receive a fictional last-seen baseline.
    for n in (1, 2):
        sql(f"""insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,detected_at,first_detected_at,last_detected_at,processing_status)
values('{uid(n)}','__mesa_ci__','https://example.invalid/ci-{n}','https://example.invalid/ci-{n}','Fonte {n}',now(),now(),now(),'ready_for_review');
insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at)
values('{uid(100+n)}','{uid(n)}',repeat('{n}',64),'[{{"type":"paragraph","text":"Texto de teste"}}]','{{}}',now());""")
    legacy = scalar(f"insert into public.newsroom_editorial_themes(title,classification_key) values('Tema anterior','sporting') returning id;")
    sql(f"select * from public.newsroom_set_editorial_theme_source_membership_v1('{legacy}','{uid(1)}',true);")
    load('supabase/migrations/20260910223000_newsroom_mesa_theme_organization_v1.sql')
    case('No invented last-seen history', lambda: check(scalar(f"select reference_snapshot_id is null and reference_at is null from public.newsroom_editorial_theme_sources where theme_id='{legacy}'") == 't', 'old source marked seen'))
    case('Exact delivered smoke including rollback', lambda: load('supabase/sql/jornada-mesa-organizacao-v1-smoke-rollback.sql'))
    case('Smoke left no source data', lambda: check(scalar("select count(*) from public.newsroom_articles where source_code='__mesa_organization_smoke__'") == '0', 'rollback did not remove fixtures'))
    case('Foundation regression after new migration', lambda: load('supabase/sql/jornada-redacao-workspace-producao-fundacao-1-smoke-rollback.sql'))
    case('Permissions, rollback, immutable versions and legacy writers', lambda: load('.ci/mesa-sql/contracts.sql'))
    case('Six simultaneous requests produce one Theme', parallel_same_request)
    case('Six simultaneous preparations produce one Dossier', parallel_preparation)
    case('Same preparation cannot acquire two parents', cross_theme_conflict)
    case('Legacy deletion cannot race committed dossier membership', legacy_delete_race)
except Exception as exc:
    RESULTS.append({'test': 'Test environment or migration load', 'result': 'FAIL', 'detail': str(exc)})
    print('FAIL:', exc, flush=True)
finally:
    (ROOT / 'mesa-sql-resultados.json').write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding='utf-8')
    print('MESA_SQL_RESULTS=' + json.dumps(RESULTS, ensure_ascii=False), flush=True)
    failures = [r for r in RESULTS if r['result'] != 'PASS']
    print(f"RESULT: {len(RESULTS)-len(failures)} PASS; {len(failures)} FAIL", flush=True)
    raise SystemExit(1 if failures or not RESULTS else 0)
