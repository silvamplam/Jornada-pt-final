import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260831110517_matchday_editorial_bank_contextual_classification.sql",
  "utf8",
);

function section(startNeedle: string, endNeedle: string): string {
  const start = migration.indexOf(startNeedle);
  assert.ok(start >= 0, `secao inicial nao encontrada: ${startNeedle}`);

  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `secao final nao encontrada: ${endNeedle}`);

  return migration.slice(start, end);
}

test("bank recebe a tripla contextual e os dominios fechados", () => {
  assert.match(migration, /add column classification_key text,/);
  assert.match(migration, /add column classification_source text,/);
  assert.match(migration, /add column classified_at timestamptz,/);
  assert.match(
    migration,
    /'benfica',[\s\S]*'sporting',[\s\S]*'fc_porto',[\s\S]*'other_liga_clubs',[\s\S]*'outside_liga_other'/,
  );
  assert.match(
    migration,
    /'automatic',[\s\S]*'continuity_assisted',[\s\S]*'manual'/,
  );
  assert.match(
    migration,
    /num_nonnulls\([\s\S]*classification_key,[\s\S]*classification_source,[\s\S]*classified_at[\s\S]*\) in \(0, 3\)/,
  );
  assert.match(
    migration,
    /matchday_editorial_bank_items_classification_article_only_check/,
  );
});

test("backfill automatico e continuidade sao validados antes do cutover", () => {
  const automaticBackfill = migration.indexOf(
    "classification_source = 'automatic'",
  );
  const continuityBackfill = migration.indexOf(
    "classification_source = 'continuity_assisted'",
  );
  const publicCutover = migration.indexOf(
    "create or replace function\npublic.matchday_editorial_profile_classification_plan(",
  );

  assert.ok(automaticBackfill >= 0);
  assert.ok(continuityBackfill > automaticBackfill);
  assert.ok(publicCutover > continuityBackfill);
  assert.match(
    migration,
    /contextual-classification-backfill-missing-automatic/,
  );
  assert.match(
    migration,
    /contextual-classification-backfill-missing-continuity/,
  );
  assert.doesNotMatch(
    migration,
    /contextual-classification-backfill-missing-continuity:[\s\S]{0,80}146/,
  );
});

test("motor derivado continua separado da autoridade persistida", () => {
  const body = section(
    "create or replace function\npublic.matchday_editorial_profile_derived_classification_plan_v1(",
    "create schema jornada_private authorization postgres;",
  );

  assert.match(
    body,
    /matchday_editorial_profile_classification_plan_actuality_v1\(/,
  );
  assert.doesNotMatch(body, /classification_key/);
});

test("autorizacao interna e privada substitui totalmente o GUC", () => {
  assert.doesNotMatch(migration, /jornada\.bank_classification_internal_id/);
  assert.match(
    migration,
    /create schema jornada_private authorization postgres;/,
  );
  assert.match(
    migration,
    /matchday_editorial_bank_classification_authorizations \([\s\S]*backend_pid integer not null,[\s\S]*transaction_id xid8 not null,[\s\S]*bank_item_id uuid not null,[\s\S]*primary key \(backend_pid, transaction_id, bank_item_id\)/,
  );
  assert.match(migration, /pg_catalog\.pg_backend_pid\(\)/);
  assert.match(migration, /pg_catalog\.pg_current_xact_id\(\)/);
  assert.match(
    migration,
    /jornada_private\.authorize_matchday_editorial_bank_classification_writes\(/,
  );
  assert.match(
    migration,
    /jornada_private\.revoke_matchday_editorial_bank_classification_writes\(/,
  );
  assert.match(
    migration,
    /revoke all on all functions in schema jornada_private\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /revoke all on all tables in schema jornada_private\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /revoke all on schema jornada_private\s+from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(migration, /grant[\s\S]{0,120}jornada_private/i);
  assert.doesNotMatch(migration, /current_user\s*=\s*'postgres'/i);
});

test("guarda protege manual e invalida identidade contextual", () => {
  const body = section(
    "create or replace function\npublic.guard_matchday_editorial_bank_contextual_classification()",
    "drop trigger if exists\n  guard_matchday_editorial_bank_contextual_classification",
  );

  assert.match(body, /old\.classification_source = 'manual'/);
  assert.match(body, /old\.id is distinct from new\.id/);
  assert.match(body, /old\.matchday_id is distinct from new\.matchday_id/);
  assert.match(body, /v_old_source_type is distinct from v_new_source_type/);
  assert.match(body, /v_old_source_id is distinct from v_new_source_id/);
  assert.match(body, /matchday_editorial_bank_classification_authorizations/);
  assert.match(body, /new\.classification_key := null;/);
});

test("refresh automatico e set-based por jornada", () => {
  const body = section(
    "create function\njornada_private.refresh_matchday_editorial_bank_automatic_classifications(",
    "create or replace function\npublic.refresh_matchday_editorial_bank_contextual_classification(",
  );

  assert.match(body, /with targets as materialized/);
  assert.match(body, /target_matchdays as materialized/);
  assert.match(body, /derived_raw as materialized/);
  assert.match(
    body,
    /cross join lateral[\s\S]*matchday_editorial_profile_derived_classification_plan_v1\(/,
  );
  assert.equal(
    body.match(/matchday_editorial_profile_derived_classification_plan_v1\(/g)
      ?.length,
    1,
  );
  assert.match(
    body,
    /update public\.matchday_editorial_bank_items as bank_row/,
  );
  assert.match(body, /classification_source is distinct from 'manual'/);
  assert.match(
    body,
    /classification_source[\s\n]+is distinct from 'continuity_assisted'/,
  );
  assert.match(body, /left join derived as derived_row/);
  assert.match(
    body,
    /join public\.editorial_articles as article_row[\s\S]*article_row\.status = 'published'/,
  );
  assert.match(body, /when derived_row\.classification_key is null then null/);
  assert.doesNotMatch(
    body,
    /resolved_row\.classification_key is null[\s\S]{0,80}bank_row\.classified_at/,
  );
  assert.doesNotMatch(body, /bank_row\.classified_at/);
  assert.match(
    body,
    /foreach v_matchday_id in array v_changed_matchday_ids loop/,
  );
});

test("writer interno preserva manual e continuidade materializada", () => {
  const body = section(
    "create function\njornada_private.write_matchday_editorial_bank_contextual_classification(",
    "create function\njornada_private.refresh_matchday_editorial_bank_automatic_classifications(",
  );

  assert.match(
    body,
    /v_bank\.classification_source = 'manual'[\s\S]*return false;/,
  );
  assert.match(
    body,
    /v_bank\.classification_source = 'continuity_assisted'[\s\S]*return false;/,
  );
  assert.match(
    body,
    /authorize_matchday_editorial_bank_classification_writes\(/,
  );
  assert.match(body, /revoke_matchday_editorial_bank_classification_writes\(/);
});

test("materializador agrupa bank rows e inclui matchday", () => {
  const body = section(
    "create or replace function\npublic.materialize_matchday_editorial_bank_contextual_classification()",
    "-- ============================================================\n-- 8. INVALIDACAO DOS INPUTS SEMANTICOS",
  );

  assert.match(
    body,
    /old_row\.matchday_id is distinct from new_row\.matchday_id/,
  );
  assert.match(
    body,
    /old_row\.source_type is distinct from new_row\.source_type/,
  );
  assert.match(body, /old_row\.source_id is distinct from new_row\.source_id/);
  assert.match(body, /old_row\.status is distinct from new_row\.status/);
  assert.match(
    body,
    /refresh_matchday_editorial_bank_automatic_classifications\([\s\S]*p_bank_item_ids => v_automatic_bank_item_ids/,
  );
  assert.match(
    body,
    /after insert on public\.matchday_editorial_bank_items\s+referencing new table as new_rows\s+for each statement/,
  );
  assert.match(
    body,
    /after update on public\.matchday_editorial_bank_items\s+referencing old table as old_rows new table as new_rows\s+for each statement/,
  );
  assert.doesNotMatch(body, /old_row\.label/);
  assert.doesNotMatch(body, /old_row\.title/);
  assert.doesNotMatch(body, /old_row\.subtitle/);
});

test("distribuicao do bank corre uma vez por jornada depois da materializacao", () => {
  const body = section(
    "create or replace function\npublic.refresh_matchday_editorial_profile_distribution_from_bank()",
    "create or replace function\npublic.sync_matchday_editorial_selection_from_bank()",
  );

  assert.match(body, /foreach v_matchday_id in array v_matchday_ids loop/);
  assert.match(
    body,
    /refresh_matchday_editorial_profile_distribution\(\s*v_matchday_id/,
  );
  assert.match(
    body,
    /create trigger refresh_profile_distribution_from_bank_insert[\s\S]*for each statement/,
  );
  assert.match(
    body,
    /create trigger refresh_profile_distribution_from_bank_update[\s\S]*for each statement/,
  );
  assert.doesNotMatch(body, /for each row/);
});

test("artigo refresca todas as participacoes automaticas contextuais", () => {
  const body = section(
    "create function\njornada_private.refresh_automatic_classifications_from_articles_update()",
    "create function\njornada_private.refresh_automatic_classifications_from_teams_update()",
  );

  assert.match(body, /old_row\.label is distinct from new_row\.label/);
  assert.match(body, /old_row\.title is distinct from new_row\.title/);
  assert.match(body, /old_row\.subtitle is distinct from new_row\.subtitle/);
  assert.match(body, /old_row\.body is distinct from new_row\.body/);
  assert.match(body, /old_row\.status is distinct from new_row\.status/);
  assert.match(body, /p_source_ids => v_source_ids/);
  assert.doesNotMatch(body, /p_matchday_ids =>/);
  assert.match(
    migration,
    /after update on public\.editorial_articles\s+referencing old table as old_rows new table as new_rows\s+for each statement/,
  );
});

test("todos os inputs semanticos mutaveis possuem refresh dirigido", () => {
  const teams = section(
    "create function\njornada_private.refresh_automatic_classifications_from_teams_update()",
    "create function\njornada_private.refresh_automatic_classifications_from_aliases_insert()",
  );
  const aliases = section(
    "create function\njornada_private.refresh_automatic_classifications_from_aliases_update()",
    "create function\njornada_private.refresh_automatic_classifications_from_season_teams_insert()",
  );
  const seasonTeams = section(
    "create function\njornada_private.refresh_automatic_classifications_from_season_teams_update()",
    "create function\njornada_private.refresh_automatic_classifications_from_competitions_update()",
  );
  const competitions = section(
    "create function\njornada_private.refresh_automatic_classifications_from_competitions_update()",
    "create function\njornada_private.refresh_automatic_classifications_from_seasons_update()",
  );
  const seasons = section(
    "create function\njornada_private.refresh_automatic_classifications_from_seasons_update()",
    "create function\njornada_private.refresh_automatic_classifications_from_matchdays_update()",
  );
  const matchdays = section(
    "create function\njornada_private.refresh_automatic_classifications_from_matchdays_update()",
    "create trigger refresh_contextual_classification_from_articles_insert",
  );

  assert.match(
    teams,
    /old_row\.slug is distinct from new_row\.slug[\s\S]*old_row\.name is distinct from new_row\.name[\s\S]*old_row\.short_name is distinct from new_row\.short_name[\s\S]*old_row\.public_name is distinct from new_row\.public_name/,
  );
  assert.match(
    aliases,
    /old_row\.team_id is distinct from new_row\.team_id[\s\S]*old_row\.alias is distinct from new_row\.alias[\s\S]*old_row\.normalized_alias[\s\S]*old_row\.status is distinct from new_row\.status/,
  );
  assert.match(
    seasonTeams,
    /old_row\.season_id is distinct from new_row\.season_id/,
  );
  assert.match(
    seasonTeams,
    /old_row\.team_id is distinct from new_row\.team_id/,
  );
  assert.match(seasonTeams, /old_row\.status is distinct from new_row\.status/);
  assert.match(competitions, /old_row\.name is distinct from new_row\.name/);
  assert.match(competitions, /old_row\.slug is distinct from new_row\.slug/);
  assert.match(
    seasons,
    /old_row\.competition_id is distinct from new_row\.competition_id/,
  );
  assert.match(
    matchdays,
    /old_row\.season_id is distinct from new_row\.season_id/,
  );
  assert.match(
    migration,
    /refresh_contextual_classification_from_season_teams_update[\s\S]*after update on public\.season_teams/,
  );
  assert.match(
    migration,
    /refresh_contextual_classification_from_competitions_update[\s\S]*after update on public\.competitions/,
  );
  assert.match(
    migration,
    /refresh_contextual_classification_from_matchdays_update[\s\S]*after update on public\.matchdays/,
  );
  assert.match(
    migration,
    /referencing old table as old_rows new table as new_rows[\s\S]*for each statement/,
  );
});

test("reader publico projeta classification_key persistida", () => {
  const body = section(
    "create or replace function\npublic.matchday_editorial_profile_classification_plan(",
    "-- Continuidade deixa de percorrer",
  );

  assert.match(body, /bank_row\.classification_key as classified_zone_key/);
  assert.doesNotMatch(body, /classification_plan_actuality_v1/);
});

test("reader de continuidade comeca na declaracao e le o alvo", () => {
  const body = section(
    "create or replace function\npublic.matchday_editorial_profile_continuity_classification_plan(",
    "create or replace function\npublic.matchday_editorial_profile_reconcile_token_uncached(",
  );

  assert.match(body, /bank_row\.classification_key as classified_zone_key/);
  assert.doesNotMatch(body, /with recursive matchday_chain/);
  assert.doesNotMatch(
    body,
    /cross join lateral public\.matchday_editorial_profile_classification_plan/,
  );
});

test("token observa id key e source sem churn de timestamp", () => {
  const body = section(
    "create or replace function\npublic.matchday_editorial_profile_reconcile_token_uncached(",
    "notify pgrst, 'reload schema';",
  );

  assert.match(body, /bank_row\.id as bank_item_id/);
  assert.match(body, /bank_row\.classification_key/);
  assert.match(body, /bank_row\.classification_source/);
  assert.doesNotMatch(body, /bank_row\.classified_at/);
});

test("Lote 2C nao redefine Apply v8 v9 ou v10", () => {
  assert.doesNotMatch(
    migration,
    /create(?: or replace)? function\s+public\.apply_matchday_editorial_profile_workspace_v(?:8|9|10)\(/,
  );
});

test("Lote 2C nao cria zonas placements ou Desalojadas", () => {
  assert.doesNotMatch(migration, /matchday_live_layout_zones/);
  assert.doesNotMatch(migration, /matchday_live_layout_blocks/);
  assert.doesNotMatch(migration, /matchday_live_placements/);
  assert.doesNotMatch(migration, /matchday_editorial_displacements/);
});
