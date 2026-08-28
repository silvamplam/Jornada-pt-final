import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

const route = readFileSync(
  join(
    root,
    "app/api/admin/editorial/jornada/[matchdayId]/agenda-tv/route.ts",
  ),
  "utf8",
);

const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260828154500_apply_matchday_agenda_tv_sync_v1.sql",
  ),
  "utf8",
);

test("endpoint Agenda e TV é autónomo da Mesa editorial", () => {
  assert.match(
    route,
    /apply_matchday_agenda_tv_sync_v1/,
  );

  assert.doesNotMatch(
    route,
    /applyChanges|currentDraft|commitDraft|draftPageControls|thematic/,
  );
});

test("apply é atómico e protege contra estado entretanto alterado", () => {
  assert.match(
    migration,
    /security definer/,
  );
  assert.match(
    migration,
    /agenda-tv-v1-incomplete-matchday/,
  );
  assert.match(
    migration,
    /agenda-tv-v1-stale-state/,
  );
  assert.match(
    migration,
    /broadcast_channel_id/,
  );
  assert.match(
    migration,
    /scheduled_date/,
  );
  assert.match(
    migration,
    /kickoff_at/,
  );
});

test("endpoint bloqueia quando não há correspondência ou canal exato", () => {
  assert.match(
    route,
    /agenda-tv-blocked/,
  );
  assert.match(
    route,
    /channel_not_found/,
  );
  assert.match(
    route,
    /source_conflict/,
  );
});
