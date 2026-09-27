#!/usr/bin/env bash
set -euo pipefail
ROOT=$(pwd)
OUTPUT="$ROOT/.ci/migration-replay/output"
mkdir -p "$OUTPUT"
IMAGE=supabase/postgres:17.6.1.084
CID=''
CLI_CID=''
cleanup() {
  for log in platform baseline init replay; do
    if [ -f "$OUTPUT/$log.log" ]; then echo "Last output: $log"; grep -E 'Applying migration|ERROR:' "$OUTPUT/$log.log" | tail -n 2 || true; tail -n 18 "$OUTPUT/$log.log"; fi
  done
  if [ -n "$CID" ]; then
    docker logs "$CID" > "$OUTPUT/postgres.log" 2>&1 || true
    tail -n 12 "$OUTPUT/postgres.log"
    docker rm -f "$CID" >/dev/null
  fi
  if [ -n "$CLI_CID" ]; then docker rm -f "$CLI_CID" >/dev/null; fi
}
trap cleanup EXIT
# No production environment files, URLs, credentials, data or network enter the container.
test ! -e .ci/migration-replay/work/supabase/.temp/project-ref
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{json .RepoDigests}}' > "$OUTPUT/image.json"
CID=$(docker run --detach --network none --user postgres --entrypoint bash \
  --mount "type=bind,source=$ROOT/.ci/migration-replay,target=/replay,readonly" \
  --mount "type=bind,source=$ROOT/supabase/migrations,target=/migrations,readonly" \
  "$IMAGE" /replay/container-entrypoint.sh)
test "$(docker inspect "$CID" --format '{{.HostConfig.NetworkMode}}')" = none
for attempt in $(seq 1 50); do
  test "$(docker inspect "$CID" --format '{{.State.Running}}')" = true
  if docker exec "$CID" pg_isready -U postgres; then break; fi
  sleep 1
done
docker exec "$CID" pg_isready -U postgres
docker exec "$CID" createdb -U postgres jornada_migration_replay
docker exec "$CID" psql -U postgres -d jornada_migration_replay -Atc "select current_setting('server_version')" | tee "$OUTPUT/version.txt"
grep -Fx '17.6' "$OUTPUT/version.txt"
docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay -f /replay/platform.sql > "$OUTPUT/platform.log" 2>&1
docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay -f /replay/baseline.sql > "$OUTPUT/baseline.log" 2>&1
# The official CLI needs a conventional glibc loader, unlike the Nix-based DB image.
# Its sidecar shares ONLY the DB container's network namespace: still no external network.
docker pull ubuntu:24.04
mkdir -p "$OUTPUT/work/supabase/migrations"
test -z "$(ls -A "$OUTPUT/work/supabase/migrations/")"
CLI_CID=$(docker run --detach --network "container:$CID" \
  --mount "type=bind,source=$OUTPUT/work,target=/project" \
  --mount "type=bind,source=$ROOT/.ci/migration-replay/tools,target=/tools,readonly" \
  ubuntu:24.04 sleep infinity)
test "$(docker inspect "$CLI_CID" --format '{{.HostConfig.NetworkMode}}')" = "container:$CID"
cli() { docker exec "$CLI_CID" /tools/supabase "$@"; }
cli init --workdir /project --yes > "$OUTPUT/init.log" 2>&1
# The explicit URL resolves only to this network-less container's own loopback.
for migration in supabase/migrations/*.sql; do
  name=$(basename "$migration")
  cp "$migration" "$OUTPUT/work/supabase/migrations/"
  if [ "$name" = 20260901214531_matchday_live_layout_source_retirement.sql ]; then
    docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay \
      -f /replay/fixtures/retirement-before.sql >> "$OUTPUT/replay.log" 2>&1
  fi
  cli migration up --workdir /project \
    --db-url postgresql://postgres@127.0.0.1:5432/jornada_migration_replay?sslmode=disable \
    --include-all --yes >> "$OUTPUT/replay.log" 2>&1
  if [ "$name" = 20260901214531_matchday_live_layout_source_retirement.sql ]; then
    docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay \
      -f /replay/fixtures/retirement-after.sql >> "$OUTPUT/replay.log" 2>&1
  fi
done
cli migration list --workdir /project \
  --db-url postgresql://postgres@127.0.0.1:5432/jornada_migration_replay?sslmode=disable \
  > "$OUTPUT/migration-list.txt" 2>&1
cli db push --workdir /project \
  --db-url postgresql://postgres@127.0.0.1:5432/jornada_migration_replay?sslmode=disable \
  --skip-vault --dry-run > "$OUTPUT/dry-run.txt" 2>&1
docker exec "$CID" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay \
  -f /replay/catalog.sql > "$OUTPUT/catalog.json"
node .ci/migration-replay/compare.mjs "$OUTPUT/catalog.json" "$OUTPUT/comparison.json"
