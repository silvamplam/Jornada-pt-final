#!/usr/bin/env bash
set -euo pipefail
ROOT=$(pwd)
OUTPUT="$ROOT/.ci/migration-replay/output"
mkdir -p "$OUTPUT"
IMAGE=supabase/postgres:17.6.1.084
CID=''
cleanup() {
  for log in platform baseline init replay; do
    if [ -f "$OUTPUT/$log.log" ]; then echo "Last output: $log"; tail -n 18 "$OUTPUT/$log.log"; fi
  done
  if [ -n "$CID" ]; then
    docker logs "$CID" > "$OUTPUT/postgres.log" 2>&1 || true
    tail -n 12 "$OUTPUT/postgres.log"
    docker rm -f "$CID" >/dev/null
  fi
}
trap cleanup EXIT
# No production environment files, URLs, credentials, data or network enter the container.
test ! -e .ci/migration-replay/work/supabase/.temp/project-ref
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{json .RepoDigests}}' > "$OUTPUT/image.json"
CID=$(docker run --detach --network none --entrypoint bash \
  --mount "type=bind,source=$ROOT/.ci/migration-replay,target=/replay,readonly" \
  --mount "type=bind,source=$ROOT/supabase/migrations,target=/migrations,readonly" \
  "$IMAGE" /replay/container-entrypoint.sh)
test "$(docker inspect "$CID" --format '{{.HostConfig.NetworkMode}}')" = none
for attempt in $(seq 1 50); do
  if docker exec "$CID" pg_isready -U postgres; then break; fi
  sleep 1
done
docker exec "$CID" pg_isready -U postgres
docker exec "$CID" createdb -U postgres jornada_migration_replay
docker exec "$CID" psql -U postgres -d jornada_migration_replay -Atc "select current_setting('server_version')" | tee "$OUTPUT/version.txt"
grep -Fx '17.6' "$OUTPUT/version.txt"
docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay -f /replay/platform.sql > "$OUTPUT/platform.log" 2>&1
docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay -f /replay/baseline.sql > "$OUTPUT/baseline.log" 2>&1
# CLI receives a fresh project folder with no production link or seeds.
docker exec "$CID" mkdir -p /tmp/project/supabase/migrations
docker exec "$CID" bash -c 'cp /migrations/*.sql /tmp/project/supabase/migrations/'
docker cp .ci/migration-replay/tools/supabase "$CID":/tmp/supabase
docker exec "$CID" chmod +x /tmp/supabase
docker exec "$CID" /tmp/supabase init --workdir /tmp/project --yes > "$OUTPUT/init.log" 2>&1
# The explicit URL resolves only to this network-less container's own loopback.
docker exec "$CID" /tmp/supabase migration up --workdir /tmp/project \
  --db-url postgresql://postgres@127.0.0.1:5432/jornada_migration_replay \
  --include-all > "$OUTPUT/replay.log" 2>&1
docker exec "$CID" /tmp/supabase migration list --workdir /tmp/project \
  --db-url postgresql://postgres@127.0.0.1:5432/jornada_migration_replay \
  > "$OUTPUT/migration-list.txt" 2>&1
docker exec "$CID" /tmp/supabase db push --workdir /tmp/project \
  --db-url postgresql://postgres@127.0.0.1:5432/jornada_migration_replay \
  --skip-vault --dry-run > "$OUTPUT/dry-run.txt" 2>&1
docker exec "$CID" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d jornada_migration_replay \
  -f /replay/catalog.sql > "$OUTPUT/catalog.json"
node .ci/migration-replay/compare.mjs "$OUTPUT/catalog.json" "$OUTPUT/comparison.json"
