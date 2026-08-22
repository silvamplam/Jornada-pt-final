import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

const migration = source(
  "supabase/migrations/20260822154500_matchday_editorial_profile_assignment.sql",
);
const profile = EDITORIAL_PROFILES.liga_portugal_v1;

test("a migration persiste exclusivamente a atribuição de perfil à Jornada", () => {
  assert.match(
    migration,
    /create table public\.matchday_editorial_profile_assignments/i,
  );
  assert.doesNotMatch(
    migration,
    /create table if not exists public\.matchday_editorial_profile_assignments/i,
  );
  assert.match(
    migration,
    /matchday_id uuid primary key references public\.matchdays\(id\) on delete cascade/i,
  );
  assert.match(migration, /profile_key text not null/i);
  assert.match(
    migration,
    /check \(profile_key = 'liga_portugal_v1'\)/i,
  );
  assert.deepEqual(Object.keys(EDITORIAL_PROFILES), ["liga_portugal_v1"]);
  assert.equal(profile.competitionSlug, "liga-portugal");
});

test("a RPC valida a Jornada, a competição e aplica a atribuição de forma idempotente", () => {
  assert.match(
    migration,
    /create function public\.set_matchday_editorial_profile_assignment\s*\(\s*p_matchday_id uuid,\s*p_profile_key text\s*\)/i,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.set_matchday_editorial_profile_assignment/i,
  );
  assert.match(
    migration,
    /from public\.matchdays as matchday_row[\s\S]*?join public\.seasons as season_row[\s\S]*?join public\.competitions as competition_row/i,
  );
  assert.match(migration, /for update of matchday_row/i);
  assert.match(
    migration,
    /raise exception 'matchday-editorial-profile-matchday-not-found'/i,
  );
  assert.match(
    migration,
    /if p_profile_key is null then[\s\S]*?delete from public\.matchday_editorial_profile_assignments[\s\S]*?return null/i,
  );
  assert.match(
    migration,
    /if p_profile_key is distinct from 'liga_portugal_v1' then[\s\S]*?matchday-editorial-profile-invalid-profile/i,
  );
  assert.match(
    migration,
    /v_competition_slug is distinct from 'liga-portugal'[\s\S]*?matchday-editorial-profile-incompatible-competition/i,
  );
  assert.equal(profile.competitionSlug, "liga-portugal");
  assert.match(
    migration,
    /if v_current_profile_key = p_profile_key then\s*return v_current_profile_key/i,
  );
  assert.match(
    migration,
    /update public\.matchday_editorial_profile_assignments[\s\S]*?updated_at = v_now/i,
  );
});

test("a tabela e a RPC mantêm a escrita exclusivamente controlada", () => {
  assert.match(
    migration,
    /alter table public\.matchday_editorial_profile_assignments enable row level security/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.matchday_editorial_profile_assignments\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select on table public\.matchday_editorial_profile_assignments to service_role/i,
  );
  assert.deepEqual(
    migration.match(
      /grant\s+[^;]*on table public\.matchday_editorial_profile_assignments\s+to service_role/gi,
    ),
    [
      "grant select on table public.matchday_editorial_profile_assignments to service_role",
    ],
  );
  assert.doesNotMatch(
    migration,
    /grant\s+[^;]*(?:insert|update|delete)[^;]*on table public\.matchday_editorial_profile_assignments[^;]*to service_role/i,
  );
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function public\.set_matchday_editorial_profile_assignment\(uuid, text\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.set_matchday_editorial_profile_assignment\(uuid, text\)\s+to service_role/i,
  );
});

test("a migration não ativa Jornadas nem altera o circuito legacy", () => {
  const beforeRpc = migration
    .toLowerCase()
    .split("create function public.set_matchday_editorial_profile_assignment")[0];

  assert.ok(beforeRpc);
  assert.doesNotMatch(
    beforeRpc,
    /insert into public\.matchday_editorial_profile_assignments/i,
  );
  assert.doesNotMatch(migration, /alter table public\.matchdays/i);
  assert.doesNotMatch(migration, /matchday_editorial_desk_control/i);
  assert.doesNotMatch(
    migration,
    /alter\s+(?:table\s+)?public\.(matchday_live_layout_items|matchday_horizontal_news|matchday_latest_news|matchday_editorials|matchday_highlights|matchday_reference_compositions)/i,
  );
  assert.doesNotMatch(migration, /newsroom_editorial_profiles/i);
});
