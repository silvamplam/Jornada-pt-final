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
  "supabase/migrations/20260822172842_matchday_editorial_profile_state_distribution.sql",
);
const profile = EDITORIAL_PROFILES.liga_portugal_v1;
const tableDefinition = migration.slice(
  migration.indexOf("create table public.matchday_editorial_profile_state_items"),
  migration.indexOf("create unique index matchday_editorial_profile_state_items_placement_key"),
);

test("o estado temático é independente e usa identidade canónica estável", () => {
  assert.match(
    migration,
    /create table public\.matchday_editorial_profile_state_items/i,
  );
  assert.doesNotMatch(migration, /create table if not exists/i);
  assert.match(
    tableDefinition,
    /matchday_id uuid not null references public\.matchdays\(id\) on delete cascade/i,
  );
  assert.doesNotMatch(
    tableDefinition,
    /references public\.matchday_editorial_profile_assignments/i,
  );
  assert.doesNotMatch(tableDefinition, /bank_item_id/i);
  assert.match(
    tableDefinition,
    /unique \(matchday_id, profile_key, source_type, source_id\)/i,
  );
  assert.match(
    migration,
    /unique index matchday_editorial_profile_state_items_placement_key[\s\S]*matchday_id,[\s\S]*profile_key,[\s\S]*zone_key,[\s\S]*sort_order[\s\S]*where zone_key is not null/i,
  );
  assert.match(
    tableDefinition,
    /\(zone_key is null and sort_order is null\)[\s\S]*\(zone_key is not null and sort_order > 0\)/i,
  );
});

test("a fonte é o banco ativo e o artigo editorial fornece os dados canónicos", () => {
  assert.match(
    migration,
    /from public\.matchday_editorial_bank_items as bank_row[\s\S]*join public\.editorial_articles as article_row[\s\S]*article_row\.id::text = pg_catalog\.btrim\(bank_row\.source_id\)/i,
  );
  assert.match(
    migration,
    /lower\(pg_catalog\.btrim\(bank_row\.status\)\) = 'active'/i,
  );
  assert.match(
    migration,
    /lower\(pg_catalog\.btrim\(bank_row\.source_type\)\) = 'editorial_article'/i,
  );
  assert.doesNotMatch(
    migration,
    /matchday_(?:latest_news|horizontal_news|highlights)\.id|matchday_reference_composition_items\.id/i,
  );
});

test("a classificação dá precedência estrutural à label e evita substrings ambíguas", () => {
  assert.match(
    migration,
    /strpos\(candidate_row\.normalized_label, '\|'\)[\s\S]*structural_label/i,
  );
  assert.match(
    migration,
    /substr\(\s*candidate_row\.normalized_label,\s*1,\s*pg_catalog\.strpos\(candidate_row\.normalized_label, '\|'\) - 1\s*\)[\s\S]*as label_prefix/i,
  );
  assert.match(
    migration,
    /regexp_replace\([\s\S]*candidate_row\.structural_label,[\s\S]*'\^reacoes ao\[\[:space:\]\]\+'/i,
  );
  assert.match(
    migration,
    /alias_row\.normalized_alias = subject_row\.evidence/i,
  );
  assert.doesNotMatch(migration, /strpos\([^\n]*normalized_alias|position\([^\n]*normalized_alias/i);

  const labelDecision = migration.indexOf("when candidate_row.profile_priority = 1");
  const outsideTeamDecision = migration.indexOf(
    "when candidate_row.outside_team_match_count > 0",
  );
  const competitionDecision = migration.indexOf(
    "when candidate_row.matches_competition_label",
  );
  const specialLabelDecision = migration.indexOf(
    "when candidate_row.normalized_label in",
  );
  const textFallback = migration.indexOf(
    "candidate_row.mentions_benfica::integer",
  );
  assert.ok(
    labelDecision >= 0
      && outsideTeamDecision > labelDecision
      && competitionDecision > outsideTeamDecision
      && specialLabelDecision > competitionDecision
      && textFallback > specialLabelDecision,
  );

  assert.match(
    migration,
    /when candidate_row\.profile_priority = 1 then 'benfica'[\s\S]*when candidate_row\.profile_priority = 2 then 'sporting'[\s\S]*when candidate_row\.profile_priority = 3 then 'fc_porto'[\s\S]*when candidate_row\.profile_priority = 4 then 'other_liga_clubs'/i,
  );
  assert.match(
    migration,
    /normalized_label in \(\s*'selecao nacional',\s*'futebol internacional'\s*\)[\s\S]*structural_label in \(\s*'selecao nacional',\s*'futebol internacional'\s*\)[\s\S]*label_prefix in \(\s*'selecao nacional',\s*'futebol internacional'\s*\)[\s\S]*then 'outside_liga_other'/i,
  );
  assert.doesNotMatch(migration, /'moreirense'/i);
});

test("os clubes da época e aliases resolvem os restantes participantes sem lista hardcoded", () => {
  assert.match(
    migration,
    /from matchday_context as context_row[\s\S]*join public\.season_teams as season_team_row[\s\S]*join public\.teams as team_row/i,
  );
  assert.match(migration, /season_team_row\.status = 'active'/i);
  assert.match(migration, /team_row\.public_name/i);
  assert.match(
    migration,
    /join public\.team_aliases as team_alias_row[\s\S]*team_alias_row\.team_id = participant_row\.team_id[\s\S]*team_alias_row\.status = 'active'/i,
  );
  assert.equal(
    migration.match(/team_alias_row\.status = 'active'/gi)?.length,
    4,
  );
  assert.match(
    migration,
    /when 'benfica' then 'benfica'[\s\S]*when 'sporting' then 'sporting'[\s\S]*when 'fc-porto' then 'fc_porto'[\s\S]*else 'other_liga_clubs'/i,
  );
});

test("clubes exteriores e a competição bloqueiam o fallback textual", () => {
  assert.match(
    migration,
    /known_team_alias_values as \([\s\S]*from public\.teams as team_row[\s\S]*team_row\.public_name[\s\S]*public\.team_aliases as team_alias_row/i,
  );
  assert.match(
    migration,
    /outside_team_aliases as \([\s\S]*left join participant_teams as participant_row[\s\S]*where participant_row\.team_id is null/i,
  );
  assert.match(
    migration,
    /outside_team_label_matches as \([\s\S]*count\(distinct alias_row\.team_id\)[\s\S]*alias_row\.normalized_alias = subject_row\.evidence/i,
  );
  assert.match(
    migration,
    /outside_team_match_count > 0\s*then 'outside_liga_other'/i,
  );
  assert.doesNotMatch(migration, /'real madrid'/i);

  assert.match(
    migration,
    /matchday_context as \([\s\S]*competition_row\.name as competition_name,[\s\S]*competition_row\.slug as competition_slug[\s\S]*join public\.competitions as competition_row/i,
  );
  assert.match(
    migration,
    /competition_alias_values as \([\s\S]*competition_name[\s\S]*replace\(context_row\.competition_slug, '-', ' '\)/i,
  );
  assert.match(
    migration,
    /competition_label_matches as \([\s\S]*alias_row\.normalized_alias = subject_row\.evidence[\s\S]*union[\s\S]*alias_row\.normalized_alias = candidate_row\.label_prefix/i,
  );
  assert.match(
    migration,
    /matches_competition_label\s*then 'outside_liga_other'/i,
  );
});

test("o fallback textual exige uma única menção independente aos três grandes", () => {
  assert.deepEqual(
    migration.match(/as mentions_(?:benfica|sporting|fc_porto)/g),
    [
      "as mentions_benfica",
      "as mentions_sporting",
      "as mentions_fc_porto",
    ],
  );
  assert.match(
    migration,
    /mentions_benfica::integer\s*\+ candidate_row\.mentions_sporting::integer\s*\+ candidate_row\.mentions_fc_porto::integer\s*\) = 1/i,
  );
  assert.match(
    migration,
    /\) = 1 then\s*case\s*when candidate_row\.mentions_benfica then 'benfica'\s*when candidate_row\.mentions_sporting then 'sporting'\s*when candidate_row\.mentions_fc_porto then 'fc_porto'\s*end\s*else 'outside_liga_other'/i,
  );
  assert.doesNotMatch(
    migration,
    /when candidate_row\.normalized_content ~[\s\S]*then '(?:benfica|sporting|fc_porto)'/i,
  );
});

test("os exemplos de labels mantêm a hierarquia editorial sem adivinhação textual", () => {
  assert.match(
    migration,
    /min\(alias_row\.profile_priority\)[\s\S]*group by subject_row\.source_type, subject_row\.source_id/i,
  );
  assert.match(
    migration,
    /string_to_array\([\s\S]*candidate_row\.structural_label[\s\S]*'-'[\s\S]*\)/i,
  );
  assert.match(
    migration,
    /when 'benfica' then 1[\s\S]*when 'sporting' then 2[\s\S]*when 'fc-porto' then 3[\s\S]*else 4/i,
  );
  assert.doesNotMatch(migration, /'arouca'|'moreirense'|'casa pia'/i);
  assert.match(
    migration,
    /structural_label in \(\s*'selecao nacional',\s*'futebol internacional'\s*\)[\s\S]*then 'outside_liga_other'/i,
  );
});

test("labels compostas preservam prefixo, sujeito e precedência editorial", () => {
  const participantDecision = migration.indexOf(
    "when candidate_row.profile_priority = 1",
  );
  const competitionDecision = migration.indexOf(
    "when candidate_row.matches_competition_label",
  );
  const outsideThemeDecision = migration.indexOf(
    "or candidate_row.structural_label in",
  );
  const textFallback = migration.indexOf(
    "candidate_row.mentions_benfica::integer",
  );

  assert.ok(
    participantDecision >= 0
      && competitionDecision > participantDecision
      && outsideThemeDecision > competitionDecision
      && textFallback > outsideThemeDecision,
  );
  assert.match(
    migration,
    /label_prefix[\s\S]*competition_label_matches[\s\S]*normalized_alias = candidate_row\.label_prefix/i,
  );
  assert.match(
    migration,
    /else candidate_row\.normalized_label\s*end as structural_label/i,
  );
  assert.match(
    migration,
    /select candidate_row\.structural_label\s*union[\s\S]*string_to_array/i,
  );
});

test("as capacidades e a ordenação por atualidade coincidem com o perfil tipado", () => {
  assert.deepEqual(
    profile.zones.map((zone) => zone.capacity),
    [6, 5, 5, 6, 5],
  );
  assert.match(
    migration,
    /when 'benfica' then 6[\s\S]*when 'sporting' then 5[\s\S]*when 'fc_porto' then 5[\s\S]*when 'other_liga_clubs' then 6[\s\S]*when 'outside_liga_other' then 5/i,
  );
  assert.match(
    migration,
    /partition by candidate_row\.classified_zone_key[\s\S]*published_at desc nulls last,[\s\S]*updated_at desc nulls last,[\s\S]*source_type asc,[\s\S]*source_id asc/i,
  );
  assert.match(
    migration,
    /actuality_order <= candidate_row\.zone_capacity[\s\S]*else null[\s\S]*actuality_order::integer[\s\S]*else null/i,
  );
});

test("o refresh é serializado, preserva histórico e é idempotente", () => {
  assert.match(
    migration,
    /create function public\.refresh_matchday_editorial_profile_distribution\(\s*p_matchday_id uuid\s*\)/i,
  );
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.match(
    migration,
    /from public\.matchday_editorial_profile_assignments as assignment_row[\s\S]*for update of assignment_row/i,
  );

  const noAssignment = migration.indexOf("if not found then\n    return 0;");
  const firstStateWrite = migration.indexOf(
    "insert into public.matchday_editorial_profile_state_items",
  );
  assert.ok(noAssignment >= 0 && firstStateWrite > noAssignment);

  assert.match(
    migration,
    /on conflict \(matchday_id, profile_key, source_type, source_id\) do nothing/i,
  );
  assert.match(
    migration,
    /and not exists \([\s\S]*matchday_editorial_profile_distribution_plan[\s\S]*set zone_key = null,[\s\S]*sort_order = null/i,
  );
  assert.doesNotMatch(
    migration,
    /delete from public\.matchday_editorial_profile_state_items/i,
  );
  assert.match(
    migration,
    /is distinct from \(desired_row\.zone_key, desired_row\.sort_order\)/i,
  );
});

test("os triggers só refrescam Jornadas atribuídas e nunca limpam no DELETE da assignment", () => {
  assert.match(
    migration,
    /after insert or update or delete on public\.matchday_editorial_bank_items/i,
  );
  assert.match(
    migration,
    /if tg_op = 'DELETE' then\s*v_first_matchday_id := old\.matchday_id/i,
  );
  assert.match(
    migration,
    /old\.matchday_id < new\.matchday_id[\s\S]*v_second_matchday_id/i,
  );
  assert.match(
    migration,
    /if exists \([\s\S]*from public\.matchday_editorial_profile_assignments as assignment_row[\s\S]*perform public\.refresh_matchday_editorial_profile_distribution/i,
  );
  assert.match(
    migration,
    /after insert or update on public\.matchday_editorial_profile_assignments/i,
  );
  assert.doesNotMatch(
    migration,
    /after[^;]*delete[^;]*on public\.matchday_editorial_profile_assignments/i,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.matchday_editorial_profile_assignments/i,
  );
});

test("RLS, ACLs e funções privilegiadas ficam fechados", () => {
  assert.match(
    migration,
    /alter table public\.matchday_editorial_profile_state_items enable row level security/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.matchday_editorial_profile_state_items\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select on table public\.matchday_editorial_profile_state_items\s+to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+[^;]*(?:insert|update|delete)[^;]*on table public\.matchday_editorial_profile_state_items[^;]*to service_role/i,
  );
  assert.match(
    migration,
    /create function public\.refresh_matchday_editorial_profile_distribution[\s\S]*?security definer\s+set search_path = ''/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.refresh_matchday_editorial_profile_distribution\(uuid\)\s+from public, anon, authenticated, service_role;\s*grant execute on function public\.refresh_matchday_editorial_profile_distribution\(uuid\)\s+to service_role/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.refresh_matchday_editorial_profile_distribution_from_bank\(\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.refresh_matchday_editorial_profile_distribution_from_assignment\(\)\s+from public, anon, authenticated, service_role/i,
  );
});

test("a migration não ativa Jornadas nem altera o circuito legacy", () => {
  assert.doesNotMatch(migration, /\binsert\s+into\s+public\.matchday_editorial_profile_assignments/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.matchday_editorial_profile_assignments/i);
  assert.doesNotMatch(migration, /alter table public\.matchdays/i);
  assert.doesNotMatch(
    migration,
    /alter table public\.(matchday_editorials|matchday_highlights|matchday_latest_news|matchday_horizontal_news|matchday_live_layout_items|matchday_reference_compositions|matchday_reference_composition_items)/i,
  );
});
