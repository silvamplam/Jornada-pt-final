#!/usr/bin/env bash
set -euo pipefail
# This entrypoint runs only inside an ephemeral --network none container.
mkdir -p /tmp/jornada-pg
initdb -D /tmp/jornada-pg -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8
exec postgres -D /tmp/jornada-pg \
  -c listen_addresses=127.0.0.1 \
  -c shared_preload_libraries=pg_cron,pg_net \
  -c cron.database_name=jornada_migration_replay \
  -c cron.launch_active_jobs=off \
  -c max_connections=30
