"""Real production writers, disposable local PostgreSQL 17 only; no credentials.

Example: python .ci/production-images-sql/run.py --psql <psql> --port 55439 --user codex
The caller creates an EMPTY mesa_organization_test database. No remote host/URL
is accepted. Auxiliary sports/Storage identities are synthetic, not production.
"""
import argparse
import ast
import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--psql', required=True)
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--user', default='postgres')
args = parser.parse_args()
COMMAND = [args.psql, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
           '-p', str(args.port), '-U', args.user, '-d', 'mesa_organization_test']
ENV = {k: v for k, v in os.environ.items() if not k.startswith('PG')}


def execute(sql, role=False):
    proc = subprocess.run(COMMAND, input="set statement_timeout='30s'; set lock_timeout='5s';\n"
                          + ('set role service_role;\n' if role else '') + sql,
                          text=True, encoding='utf-8', capture_output=True, timeout=45, env=ENV)
    if proc.returncode:
        raise RuntimeError(proc.stderr.strip())
    return proc.stdout.strip()


def load(path):
    sql = (ROOT / path).read_text(encoding='utf-8-sig')
    if path.endswith('31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql'):
        sql = sql.split('create table public.newsroom_editorial_compose_requests')[0] + '\ncommit;'
    if path.endswith('20260924162021_newsroom_article_plan_output_classification_authority.sql'):
        # Verbatim schema, state writer and guards. Publication wrappers are not
        # exercised by this save; do not bootstrap unrelated Latest/publication.
        marker = 'create or replace function public.newsroom_publish_mesa_output_v3('
        assert sql.count(marker) == 1
        sql = sql.split(marker)[0] + '\ncommit;'
    if path.endswith('20260929084410_editorial_image_authority.sql'):
        marker = 'do $guard_image_only$'
        assert sql.count(marker) == 1
        sql = sql.split(marker)[0] + '\ncommit;'
    if path == '.ci/mesa-sql/bootstrap.sql':
        # The original harness uses Unix sockets. Windows tests use loopback.
        sql = sql.replace('inet_server_addr() IS NOT NULL', "inet_server_addr() <> '127.0.0.1'::inet")
        for role in ('anon', 'authenticated', 'service_role'):
            if execute(f"select count(*) from pg_roles where rolname='{role}'") == '1':
                import re
                sql = re.sub(r'CREATE ROLE ' + role + r'[^;]*;', '', sql)
    execute(sql)


def val(value):
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"


identity = execute("select current_database()||'|'||inet_server_addr()::text||'|'||current_setting('server_version_num')")
assert identity.startswith('mesa_organization_test|127.0.0.1/32|17') or identity.startswith('mesa_organization_test|127.0.0.1|17'), identity
assert execute("select count(*) from pg_tables where schemaname='public'") == '0', 'Must be an empty disposable database'
if execute("select count(*) from pg_roles where rolname='postgres'") == '0':
    execute('create role postgres nologin;')
constants = {}
for node in ast.parse((ROOT / '.ci/mesa-contexts-2c-sql/run.py').read_text()).body:
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
        try:
            constants[node.targets[0].id] = ast.literal_eval(node.value)
        except (ValueError, TypeError):
            pass
for path in constants['BASE_SQL'] + [
        'supabase/steps/31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql',
        'supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-rascunho-geracao-controlada-1-aplicar.sql',
        ] + constants['MESA_MIGRATIONS'] + [constants['MIGRATION_2C'],
        'supabase/migrations/20260924162021_newsroom_article_plan_output_classification_authority.sql',
        'supabase/migrations/20260924213644_newsroom_article_plan_classification_decision.sql',
        'supabase/migrations/20260929084410_editorial_image_authority.sql']:
    load(path)
execute("create schema storage; create table storage.objects(bucket_id text,name text,primary key(bucket_id,name)); grant usage on schema storage to service_role; grant select on storage.objects to service_role;")
protected = execute("select jsonb_object_agg(oid::text,md5(pg_get_functiondef(oid)||coalesce(proacl::text,''))) from pg_proc where proname in ('editorial_confirm_dossier_image_v1','newsroom_save_editorial_dossier_article_plan','newsroom_save_mesa_context_article_plan_v1','newsroom_save_dossier_article_plan_state_v3','newsroom_set_mesa_shared_outputs_v2')")
load('supabase/migrations/20260930092202_newsroom_production_images_atomic_save.sql')
assert protected == execute("select jsonb_object_agg(oid::text,md5(pg_get_functiondef(oid)||coalesce(proacl::text,''))) from pg_proc where proname in ('editorial_confirm_dossier_image_v1','newsroom_save_editorial_dossier_article_plan','newsroom_save_mesa_context_article_plan_v1','newsroom_save_dossier_article_plan_state_v3','newsroom_set_mesa_shared_outputs_v2')")
print('PASS existing writer definitions and grants unchanged', flush=True)

load('supabase/migrations/20261001184732_editorial_confirm_dossier_image_security_definer.sql')
assert execute("select case when prosecdef then 't' else 'f' end from pg_proc where oid='public.editorial_confirm_dossier_image_v1(uuid,text)'::regprocedure") == 't'
assert execute("select has_function_privilege('service_role','public.editorial_confirm_dossier_image_v1(uuid,text)','execute')") == 't'
assert execute("select has_table_privilege('service_role','public.newsroom_editorial_dossier_images','update')") == 'f'
print('PASS dossier image confirmation is definer-scoped; service_role still has no table UPDATE', flush=True)

load('.ci/production-images-sql/fixtures.sql')
passed = 0


def fixture():
    return json.loads(execute('select test_production_images_fixture();'))


def state(dossier):
    return execute(f"select state_token from public.newsroom_production_save_state_v1('{dossier}')", True)


def snapshot(dossier):
    return execute(f"select test_production_images_snapshot('{dossier}')")


def save(f, outputs=None, token=None, key=None):
    return json.loads(execute("select result from public.newsroom_save_production_batch_v1("
        f"'{f['dossierId']}','{token or state(f['dossierId'])}','{key or uuid4()}',{val(outputs or f['outputs'])})", True))


def rejects(f, outputs, code, token=None, key=None):
    before = snapshot(f['dossierId'])
    try:
        save(f, outputs, token, key)
    except RuntimeError as error:
        assert code in str(error), str(error)
    else:
        raise AssertionError('Expected rejection: ' + code)
    assert before == snapshot(f['dossierId']), 'Partial persistence!'


def test(name, fn):
    global passed
    fn()
    passed += 1
    print('PASS', name, flush=True)


def direct_confirmation_permission():
    f = fixture()
    output = f['outputs'][0]
    image_id = output['imageChoice']['dossierImageId']
    decision_key = output['preparedImageDecisionKey']
    before = execute(f"select frozen_url from public.newsroom_editorial_dossier_images where id='{image_id}'")
    assert '/editorial/sha256/' not in before
    try:
        execute(f"update public.newsroom_editorial_dossier_images set source_url=frozen_url where id='{image_id}'", True)
    except RuntimeError as error:
        assert 'permission denied' in str(error), str(error)
    else:
        raise AssertionError('service_role unexpectedly gained direct UPDATE')
    execute(f"select public.editorial_confirm_dossier_image_v1('{image_id}','{decision_key}')", True)
    row = json.loads(execute(
        f"select jsonb_build_object('source',source_url,'frozen',frozen_url) "
        f"from public.newsroom_editorial_dossier_images where id='{image_id}'"
    ))
    assert row['source'] == before
    assert '/editorial/sha256/' in row['frozen']
    assert execute("select has_table_privilege('service_role','public.newsroom_editorial_dossier_images','update')") == 'f'


test('service_role confirms a ready dossier image only through the definer RPC', direct_confirmation_permission)


def success():
    f = fixture()
    r = save(f)
    assert len(r['outputs']) == 3
    rows = json.loads(execute(f"select jsonb_agg(jsonb_build_array(p.sort_order,p.dossier_image_id,i.frozen_url) order by p.sort_order) from public.newsroom_editorial_dossier_article_plans p join public.newsroom_editorial_dossier_images i on i.id=p.dossier_image_id where p.dossier_id='{f['dossierId']}'"))
    for idx, row in enumerate(rows):
        assert row[0] == (idx+1)*10 and row[1] == f['outputs'][idx]['imageChoice']['dossierImageId']
        assert '/editorial/sha256/' in row[2]
    assert state(f['dossierId']) == r['stateToken']


test('three plans + three images, correct associations and post-save token', success)


def rollback_image():
    f = fixture()
    f['outputs'][1]['preparedImageDecisionKey'] = 'missing-ready-decision'
    rejects(f, f['outputs'], 'query returned no rows')


test('invalid middle image rolls back earlier confirmation + plan + state; no receipt', rollback_image)


def rollback_plan():
    f = fixture()
    f['outputs'][1]['articleKind'] = 'invalid'
    rejects(f, f['outputs'], 'editorial_dossier_article_plan_kind_invalid')


test('invalid middle plan rolls back all image confirmations and plans', rollback_plan)


def stale():
    f = fixture()
    token = state(f['dossierId'])
    execute(f"update public.newsroom_editorial_dossiers set title='Concurrent edit' where id='{f['dossierId']}'")
    rejects(f, f['outputs'], 'production-batch-stale-state', token)


test('stale snapshot rejects whole batch', stale)


def no_image():
    f = fixture()
    for o in f['outputs']:
        o.update(imageChoice={'mode': 'unselected'}, preparedImageDecisionKey=None, automaticImage=False)
    r = save(f)
    assert execute(f"select count(*) from public.newsroom_editorial_dossier_article_plans where dossier_id='{f['dossierId']}' and image_choice='unselected' and dossier_image_id is null") == '3'
    ids = json.loads(execute(f"select to_jsonb(confirmed_image_plan_ids) from public.newsroom_production_save_state_v1('{f['dossierId']}')"))
    assert set(ids) == {o['articlePlanId'] for o in r['outputs']}
    # Explicit no-image is sticky after reload, including against an automatic proposal.
    for idx, o in enumerate(f['outputs']):
        o.update(articlePlanId=r['outputs'][idx]['articlePlanId'])
    first = f['outputs'][0]
    image_id = execute(f"select id from public.newsroom_editorial_dossier_images where dossier_id='{f['dossierId']}' order by id limit 1")
    first.update(imageChoice={'mode': 'dossier_image', 'dossierImageId': image_id}, automaticImage=True)
    rejects(f, f['outputs'], 'production-batch-human-image-choice-preserved')


test('Sem imagem persists; reload cannot replace that choice automatically', no_image)


def retry():
    f = fixture()
    token, key = state(f['dossierId']), str(uuid4())
    first = save(f, token=token, key=key)
    before = snapshot(f['dossierId'])
    assert save(f, token=token, key=key) == first
    assert before == snapshot(f['dossierId'])
    for idx, o in enumerate(f['outputs']):
        o['articlePlanId'] = first['outputs'][idx]['articlePlanId']
    second = save(f)
    assert [o['articlePlanId'] for o in second['outputs']] == [o['articlePlanId'] for o in first['outputs']]


test('identical retry creates nothing; already confirmed images are idempotent', retry)


def invalid_state():
    f = fixture()
    f['outputs'][1]['classificationMode'] = 'manual'
    rejects(f, f['outputs'], 'production_workspace_article_plan_classification_invalid')


test('state writer failure rolls back both confirmation and plan creation', invalid_state)


def mismatch():
    f = fixture()
    f['outputs'][1]['imageChoice'] = f['outputs'][0]['imageChoice']
    f['outputs'][1]['preparedImageDecisionKey'] = f['outputs'][0]['preparedImageDecisionKey']
    rejects(f, f['outputs'], 'production-batch-image-output-mismatch')


test('an automatic candidate from another output is rejected', mismatch)


def update_human():
    f = fixture()
    article = str(uuid4())
    execute(f"insert into public.editorial_articles(id,title,slug,status,image_url) values('{article}','Existing','{article}','published','https://legacy.example/human.jpg')")
    for o in f['outputs']:
        o.update(destination='update', updateTargetEditorialArticleId=article,
                 imageChoice={'mode': 'preserve_published'}, automaticImage=False, preparedImageDecisionKey=None)
    result = save(f)
    for idx, o in enumerate(f['outputs']):
        o['articlePlanId'] = result['outputs'][idx]['articlePlanId']
    f['outputs'][1]['automaticImage'] = True
    rejects(f, f['outputs'], 'production-batch-human-image-choice-preserved')
    assert execute(f"select image_url from public.editorial_articles where id='{article}'") == 'https://legacy.example/human.jpg'


test('UPDATE retains human/published choice and never edits the published article', update_human)


def retry_rejection():
    f = fixture()
    token, key = state(f['dossierId']), str(uuid4())
    broken = json.loads(json.dumps(f['outputs']))
    broken[1]['preparedImageDecisionKey'] = 'missing'
    rejects(f, broken, 'query returned no rows', token, key)
    assert len(save(f, token=token, key=key)['outputs']) == 3


test('rejected attempt leaves no receipt; valid retry succeeds', retry_rejection)


def count_failure():
    f = fixture()
    # The real final sync rejects a cancelled workspace after earlier writers.
    execute(f"update public.newsroom_mesa_production_contexts set workspace_state='abandoned',abandoned_at=now() where dossier_id='{f['dossierId']}'")
    rejects(f, f['outputs'], 'mesa-article-plan-context-workspace-invalid')


test('inactive dossier cannot save', count_failure)


def sync_failure():
    f = fixture()
    for o in f['outputs']:
        o['productionContextId'] = None
    rejects(f, f['outputs'], 'mesa-shared-outputs-plan-context-invalid')


test('final output-count sync failure rolls back every plan, image and selection', sync_failure)


def missing_original():
    f = fixture()
    key = f['outputs'][1]['preparedImageDecisionKey']
    execute(f"delete from storage.objects where name=(select image->>'path' from public.editorial_image_decisions where decision_key='{key}')")
    rejects(f, f['outputs'], 'image-materialization-required')


test('ready receipt without local original cannot be selected', missing_original)


def request_conflict():
    f = fixture()
    key, token = str(uuid4()), state(f['dossierId'])
    save(f, token=token, key=key)
    f['outputs'][0]['workingTitle'] = 'Different payload'
    rejects(f, f['outputs'], 'production-batch-request-conflict', token, key)


test('same request ID with different payload rejects without modifying previous success', request_conflict)


def upload():
    f = fixture()
    token = state(f['dossierId'])
    key = f['outputs'][0]['preparedImageDecisionKey']
    row = json.loads(execute(f"select to_jsonb(x) from public.newsroom_add_dossier_upload_image_v1('{f['dossierId']}',(select image->>'publicUrl' from public.editorial_image_decisions where decision_key='{key}'),'editorial-images',(select image->>'path' from public.editorial_image_decisions where decision_key='{key}'),'manual.jpg') x", True))
    assert state(f['dossierId']) == token, 'Adding to the bank must not invalidate the open form'
    f['outputs'][0].update(imageChoice={'mode': 'dossier_image', 'dossierImageId': row['dossier_image_id']}, preparedImageDecisionKey=None, automaticImage=False)
    assert len(save(f, token=token)['outputs']) == 3


test('manual upload preserves snapshot and saves through local image authority', upload)


def revision_conflict():
    f = fixture()
    f['outputs'][1]['imageChoice'] = f['outputs'][0]['imageChoice']
    rejects(f, f['outputs'], 'production-batch-image-revision-conflict')


test('two different revisions of one shared dossier image cannot silently overwrite one another', revision_conflict)


def source_conflict():
    f = fixture()
    f['outputs'][1]['preparedImageDecisionKey'] = f['outputs'][0]['preparedImageDecisionKey']
    f['outputs'][1]['automaticImage'] = False
    rejects(f, f['outputs'], 'image-decision-source-conflict')


test('manual choice still uses the existing provenance guard; source mismatch rolls back all', source_conflict)


def concurrent_same_request():
    f = fixture()
    token, key = state(f['dossierId']), str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: save(f, token=token, key=key), range(2)))
    assert results[0] == results[1]
    assert execute(f"select count(*) from public.newsroom_editorial_dossier_article_plans where dossier_id='{f['dossierId']}'") == '3'
    assert execute(f"select count(*) from public.newsroom_production_save_receipts where dossier_id='{f['dossierId']}'") == '1'


test('simultaneous identical retries return one receipt and three plans, not six', concurrent_same_request)


def concurrent_stale_request():
    f = fixture()
    token = state(f['dossierId'])
    def attempt(_):
        try:
            return save(f, token=token)
        except RuntimeError as error:
            assert 'production-batch-stale-state' in str(error), str(error)
            return None
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))
    assert sum(result is not None for result in results) == 1
    assert execute(f"select count(*) from public.newsroom_editorial_dossier_article_plans where dossier_id='{f['dossierId']}'") == '3'


test('two simultaneous saves from one snapshot: one succeeds, the other is stale', concurrent_stale_request)


def automatic_revision():
    f = fixture()
    result = save(f)
    for idx, o in enumerate(f['outputs']):
        o['articlePlanId'] = result['outputs'][idx]['articlePlanId']
    old = f['outputs'][0]['preparedImageDecisionKey']
    other = f['outputs'][1]['preparedImageDecisionKey']
    revised = 'new-revision:' + str(uuid4())
    execute(f"insert into public.editorial_image_decisions(decision_key,source_url,state,image) select '{revised}',(select source_url from public.editorial_image_decisions where decision_key='{old}'),'ready',image from public.editorial_image_decisions where decision_key='{other}'")
    f['outputs'][0]['preparedImageDecisionKey'] = revised
    rejects(f, f['outputs'], 'production-batch-human-image-choice-preserved')
    f['outputs'][0]['automaticImage'] = False  # Explicit editor reacquisition, then final save.
    assert len(save(f)['outputs']) == 3


test('automatic revision cannot replace confirmed bytes; explicit human revision can', automatic_revision)


def source_limit():
    f = fixture()
    f['outputs'][1]['sourceIds'] *= 21
    rejects(f, f['outputs'], 'production-batch-output-invalid')


test('existing maximum of twenty sources per plan is preserved', source_limit)
assert execute("select has_function_privilege('anon','public.newsroom_save_production_batch_v1(uuid,text,uuid,jsonb)','execute')") == 'f'
assert execute("select has_table_privilege('authenticated','public.newsroom_production_save_receipts','select')") == 'f'
print(f'{passed} behavioural tests PASS; real writers + access checks PASS; {identity}', flush=True)
