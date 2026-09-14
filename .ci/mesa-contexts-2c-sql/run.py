"""Run the Mesa 2C/scoped-read migrations on an isolated PostgreSQL 17.6 container.

This runner accepts only the GitHub Actions service-container id. It never reads
connection variables, repository secrets, .env files, or Supabase credentials.
"""
import hashlib
import os
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[2]
CONTAINER_ID = os.environ.get("MESA_2C_TEST_CONTAINER", "")
if not re.fullmatch(r"[0-9a-f]{12,64}", CONTAINER_ID):
    raise SystemExit("A GitHub Actions PostgreSQL service container ID is required")

PSQL = [
    "docker",
    "exec",
    "-i",
    CONTAINER_ID,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "mesa_organization_test",
]


def read_sql(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def execute(sql: str) -> str:
    process = subprocess.run(
        PSQL,
        input="SET statement_timeout='30s'; SET lock_timeout='10s';\n" + sql,
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=60,
        check=False,
    )
    if process.stdout.strip():
        print(process.stdout.strip(), flush=True)
    if process.stderr.strip():
        print(process.stderr.strip(), flush=True)
    if process.returncode:
        detail = " | ".join((process.stderr or process.stdout).strip().splitlines()[-12:])
        detail = detail.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error title=PostgreSQL 17 harness::{detail}", flush=True)
        raise RuntimeError(f"psql exited with {process.returncode}")
    return process.stdout.strip()


def load(path: str, *, before: str | None = None) -> None:
    content = read_sql(path)
    if before is not None:
        if content.count(before) != 1:
            raise RuntimeError(f"Expected one cutoff marker in {path}")
        content = content.split(before, 1)[0] + "\nCOMMIT;\n"
    digest = hashlib.sha256(content.encode()).hexdigest()
    print(f"LOAD {path} sha256={digest}", flush=True)
    execute(content)


BASE_SQL = [
    ".ci/mesa-sql/bootstrap.sql",
    "supabase/steps/15-redacao-automatica-newsroom-apply.sql",
    "supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-aplicar.sql",
    "supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigos-planeados-schema-1-aplicar.sql",
    "supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigo-planeado-rascunho-controlado-1-aplicar.sql",
]

MESA_MIGRATIONS = [
    "supabase/steps/53-redacao-automatica-pacotes-fontes-persistentes-apply.sql",
    "supabase/migrations/20260908112602_newsroom_editorial_themes_foundation.sql",
    "supabase/migrations/20260908122938_newsroom_editorial_article_classifications_foundation.sql",
    "supabase/migrations/20260909100000_newsroom_editorial_production_workspace_foundation.sql",
    "supabase/migrations/20260910223000_newsroom_mesa_theme_organization_v1.sql",
    "supabase/migrations/20260911232119_jornada_mesa_grupos_temas_v2.sql",
    "supabase/migrations/20260911232721_jornada_mesa_grupos_temas_v2_fk_indexes.sql",
    "supabase/migrations/20260912004733_jornada_dossie_producao_sem_limite.sql",
    "supabase/migrations/20260912152810_mesa_production_workspace_v2_provenance.sql",
    "supabase/migrations/20260912173257_allow_mesa_v2_source_package_manifest_v5.sql",
    "supabase/migrations/20260912175044_mesa_workspace_shared_output_scope_v2.sql",
]

MIGRATION_2C = "supabase/migrations/20260913134418_newsroom_mesa_contexts_production_2c.sql"
TEST_2C = "supabase/sql/test-newsroom-mesa-contexts-production-2c-pg17.sql"
SCOPED_READ_PREFLIGHT = "supabase/sql/validate-newsroom-mesa-scoped-read-model-v1-preflight-pg17.sql"
SCOPED_READ_MIGRATION = "supabase/migrations/20260914074012_newsroom_mesa_scoped_read_model_v1.sql"
SCOPED_READ_POSTFLIGHT = "supabase/sql/validate-newsroom-mesa-scoped-read-model-v1-postflight-pg17.sql"

PROTECTED_SCHEMA_SNAPSHOT_SQL = r"""
select pg_catalog.jsonb_build_object(
  'functions', (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      p.oid::regprocedure::text || '|' || pg_catalog.pg_get_userbyid(p.proowner)
      || '|' || p.prosecdef::text || '|' || p.provolatile::text || '|'
      || coalesce(p.proconfig::text, '') || '|'
      || coalesce(p.proacl::text, '') || '|'
      || pg_catalog.pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text
    ), ''))
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proname <> all(array[
        'newsroom_mesa_timestamp_text_valid_v1',
        'newsroom_mesa_source_candidates_v1',
        'newsroom_mesa_source_counts_v1',
        'newsroom_mesa_page_identities_v1',
        'newsroom_mesa_theme_summaries_v1'
      ])
  ),
  'relations', (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      c.oid::regclass::text || '|' || c.relkind::text || '|'
      || pg_catalog.pg_get_userbyid(c.relowner) || '|'
      || coalesce(c.relacl::text, '') || '|'
      || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
      || '|' || c.relreplident::text, E'\n' order by c.oid::regclass::text
    ), ''))
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  ),
  'columns', (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      a.attrelid::regclass::text || '|' || a.attnum::text || '|' || a.attname
      || '|' || a.atttypid::regtype::text || '|' || a.attnotnull::text
      || '|' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), ''),
      E'\n' order by a.attrelid::regclass::text, a.attnum
    ), ''))
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and a.attnum > 0 and not a.attisdropped
  ),
  'indexes', (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      indexname || '|' || indexdef, E'\n' order by indexname
    ), ''))
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname <> all(array[
        'newsroom_articles_cycle_page_v1',
        'newsroom_articles_source_cycle_page_v1',
        'newsroom_editorial_source_packages_manifest_gin_v1',
        'newsroom_mesa_production_contexts_source_refs_gin_v1'
      ])
  ),
  'triggers', (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      t.tgrelid::regclass::text || '|' || t.tgname || '|'
      || pg_catalog.pg_get_triggerdef(t.oid, true), E'\n'
      order by t.tgrelid::regclass::text, t.tgname
    ), ''))
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
  ),
  'constraints', (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      c.conrelid::regclass::text || '|' || c.conname || '|'
      || pg_catalog.pg_get_constraintdef(c.oid, true), E'\n'
      order by c.conrelid::regclass::text, c.conname
    ), ''))
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'
  ),
  'policies', (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      p.polrelid::regclass::text || '|' || p.polname || '|' || p.polcmd::text
      || '|' || p.polpermissive::text || '|' || p.polroles::text
      || '|' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')
      || '|' || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
      E'\n' order by p.polrelid::regclass::text, p.polname
    ), ''))
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  ),
  'roles', (
    select pg_catalog.md5(pg_catalog.string_agg(
      rolname || '|' || rolsuper::text || '|' || rolinherit::text
      || '|' || rolcreaterole::text || '|' || rolcreatedb::text
      || '|' || rolcanlogin::text || '|' || rolreplication::text
      || '|' || rolbypassrls::text, E'\n' order by rolname
    )) from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  )
)::text;
"""

READ_OBJECT_CONTRACT_SQL = r"""
with read_functions(oid) as (
  select pg_catalog.unnest(array[
    'public.newsroom_mesa_source_candidates_v1(timestamptz,text)'::regprocedure,
    'public.newsroom_mesa_source_counts_v1(timestamptz,text)'::regprocedure,
    'public.newsroom_mesa_page_identities_v1(timestamptz,text,text,text,integer,integer)'::regprocedure,
    'public.newsroom_mesa_theme_summaries_v1(uuid[])'::regprocedure
  ])
), permission_functions(oid) as (
  select pg_catalog.unnest(array[
    'public.newsroom_mesa_timestamp_text_valid_v1(text)'::regprocedure,
    'public.newsroom_mesa_source_candidates_v1(timestamptz,text)'::regprocedure,
    'public.newsroom_mesa_source_counts_v1(timestamptz,text)'::regprocedure,
    'public.newsroom_mesa_page_identities_v1(timestamptz,text,text,text,integer,integer)'::regprocedure,
    'public.newsroom_mesa_theme_summaries_v1(uuid[])'::regprocedure
  ])
), expected_indexes(name) as (
  values
    ('newsroom_articles_cycle_page_v1'),
    ('newsroom_articles_source_cycle_page_v1'),
    ('newsroom_editorial_source_packages_manifest_gin_v1'),
    ('newsroom_mesa_production_contexts_source_refs_gin_v1')
)
select
  (select pg_catalog.count(*) from read_functions)::text || '|'
  || (select pg_catalog.count(*) from expected_indexes expected
      where pg_catalog.to_regclass('public.' || expected.name) is not null)::text || '|'
  || (select pg_catalog.count(*) from permission_functions target
      where pg_catalog.has_function_privilege('service_role', target.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', target.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', target.oid, 'EXECUTE'))::text || '|'
  || (select pg_catalog.count(*) from read_functions target
      join pg_catalog.pg_proc p on p.oid = target.oid
      where not p.prosecdef and p.provolatile = 's')::text;
"""


server = execute(
    "select current_database() || '|' || current_setting('server_version_num') || '|' "
    "|| coalesce(inet_server_addr()::text, 'unix-socket');"
)
server_version = execute("show server_version;")
if server != "mesa_organization_test|170006|unix-socket" or not server_version.startswith("17.6"):
    raise SystemExit(f"Unexpected PostgreSQL target: {server}; version={server_version}")
print(f"PASS: isolated PostgreSQL {server_version} target {server}", flush=True)

for sql_path in BASE_SQL:
    load(sql_path)

load(
    "supabase/steps/31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql",
    before="create table public.newsroom_editorial_compose_requests",
)
load("supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-rascunho-geracao-controlada-1-aplicar.sql")

for sql_path in MESA_MIGRATIONS:
    load(sql_path)

load(MIGRATION_2C)
print("PASS: Mesa 2C migration applied on PostgreSQL 17.6", flush=True)
load(TEST_2C)
print("RESULT: MESA_CONTEXTS_2C_SQL PASS", flush=True)

protected_schema_before = execute(PROTECTED_SCHEMA_SNAPSHOT_SQL)

load(SCOPED_READ_PREFLIGHT)
print("PASS: scoped-read preflight", flush=True)

load(SCOPED_READ_MIGRATION)
print("PASS: scoped-read migration applied", flush=True)

load(SCOPED_READ_POSTFLIGHT)
print("PASS: scoped-read postflight", flush=True)

read_contract = execute(READ_OBJECT_CONTRACT_SQL)
if read_contract != "4|4|5|4":
    raise RuntimeError(f"Scoped-read object/permission contract invalid: {read_contract}")
print("PASS: four read functions, four indexes and service_role permissions", flush=True)

protected_schema_after = execute(PROTECTED_SCHEMA_SNAPSHOT_SQL)
if protected_schema_after != protected_schema_before:
    raise RuntimeError(
        "Existing write functions, locks, containment or authorities changed: "
        f"before={protected_schema_before} after={protected_schema_after}"
    )
print("PASS: existing write RPCs, locks, containment and authorities unchanged", flush=True)
print("RESULT: MESA_SCOPED_READ_SQL PASS", flush=True)
