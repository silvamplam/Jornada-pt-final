"""Run the Mesa 2C migration and contracts on an isolated PostgreSQL 17.6 container.

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

MIGRATION_2C = "supabase/migrations/20260913095708_newsroom_mesa_contexts_production_2c.sql"
TEST_2C = "supabase/sql/test-newsroom-mesa-contexts-production-2c-pg17.sql"


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
