# Migration history reconciliation — 2026-09-27

Reconstruction complete on `jornada-supabase-migration-history-reconciliation-20260927`.
See [REPORT.md](REPORT.md) for the final replay, comparison, decisions and proposed repairs.
The subsequent [global-suite gate](GLOBAL-SUITE-GATE.md) confirms zero new failures
against current main. Repairs remain deferred until after PR/merge, main
confirmation and a fresh read-only production preflight.
Production is read-only throughout this phase. No remote repair or migration execution is authorized.

## Evidence and historical authority

`remote-history.json` preserves all 143 recorded entries, including complete `statements[]`
and server-side MD5 of the newline-joined statements. `manifest.json` adds per-statement
SHA-256 and rendered-file SHA-256. No credentials, Vault values or editorial rows were exported.
`production-catalog.json` records application DDL, signatures, security, owners, ACL,
constraints, indexes, triggers, policies and cron definitions. `platform-catalog.json`
records only the platform definitions/default ACL needed for comparison.

All 143 historical files use the exact remote statements, with only newline/semicolon
delimiters inserted between array elements. The 74 renamed files and every E/S/D decision
are recorded in `decisions.json`. Original local SQL remains at Git base
`a4da9d88174694b61d9b149b960c8a1f8b517dd8`.

## Replay, not production deployment

`.ci/migration-replay/baseline.sql` is a dependency snapshot, outside the migration history.
It is NOT a claim about the database at a historical date and must NEVER be applied to an
existing production database. Original foundation files and omitted migrated columns are
listed in `baseline-provenance.json`. No production data is included.

The v18 corrective migration is explicitly guarded for `jornada_migration_replay` and
records definitions already present in production. It must NOT execute in production.
Historical v17 is restored so that v27 must perform its original patch; the guard is retained.

The CI workflow uses a fresh PostgreSQL 17.6 container with real Supabase extensions,
`--network none`, `cron.launch_active_jobs=off`, no production credentials and no seed data.
CLI migration execution, list and dry-run use only loopback inside that container.
Full replay and catalogue comparison are required before any proposed remote repair.

Current repair authorization: **none**. Final decisions are recorded in `repair-plan.json`;
all six proposed repairs remain unexecuted and require explicit authorization.

## Historical execution prerequisites discovered by full replay

The CLI applies every migration in version order, stopping on its first SQL error.
Two explicitly isolated prerequisites are needed; they are not production migrations
and do not change any historical file or version:

* `20260901214531` repairs exactly one pre-existing continuity-v6 transition and
  aborts when there are zero candidates. `fixtures/retirement-before.sql` creates
  one entirely synthetic competition/season/source/target/article/transition.
  Replica mode is used only while loading that legacy state; normal trigger and
  constraint execution is restored before the historical migration. Its own
  cardinality and state/hash checks run unchanged. `retirement-after.sql` checks
  retirement and removes the synthetic dependency graph immediately afterwards.
* `20260907222744` uses literal `replace()` on a v18 body whose recorded SQL has
  different whitespace. `fixtures/v28-format-prerequisite.sql` restores only the
  spacing of the three relevant roundup expressions in the installed function.
  A regression test proves identical SQL tokens, and the SQL guard independently
  rejects any non-whitespace difference. v28 itself still performs the functional
  roundup correction. No validation is added retroactively to historical v18.

Consequently, reproduction requires the documented baseline and replay harness;
the historical migration directory alone is not a blank-database bootstrap.
Every attempt and its first failure are retained in `attempts.json`.
