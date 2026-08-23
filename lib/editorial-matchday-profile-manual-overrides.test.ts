import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const migration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/20260822195123_matchday_editorial_profile_manual_overrides.sql",
  import.meta.url,
)), "utf8");
const sql = migration.replace(/\s+/g, " ").trim();
const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("a tabela manual é fail-closed, canónica e independente do estado automático", () => {
  assert.match(migration, /^begin;\s/i);
  assert.match(migration, /\scommit;\s*$/i);
  assert.match(sql, /create table public\.matchday_editorial_profile_manual_overrides \(/i);
  assert.doesNotMatch(sql, /create table if not exists public\.matchday_editorial_profile_manual_overrides/i);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(sql, /matchday_id uuid not null references public\.matchdays\(id\) on delete cascade/i);
  assert.match(sql, /unique \(matchday_id, profile_key, source_type, source_id\)/i);
  assert.match(sql, /profile_key = 'liga_portugal_v1'/i);
  assert.match(sql, /source_type = 'editorial_article'/i);
  assert.match(sql, /check \(btrim\(source_id\) <> ''\)/i);
  assert.doesNotMatch(sql, /references public\.matchday_editorial_profile_assignments/i);
  assert.doesNotMatch(sql, /bank_item_id|references public\.matchday_editorial_bank_items/i);
});

test("a constraint representa banco explícito, zona protegida e slot fixo", () => {
  assert.match(sql, /\(zone_key is null and sort_order is null\) or \(zone_key is not null and \(sort_order is null or sort_order > 0\)\)/i);
  assert.match(sql, /create unique index matchday_editorial_profile_manual_overrides_slot_key[\s\S]*where zone_key is not null and sort_order is not null/i);
  assert.match(migration, /NULL with a zone protects zone membership but leaves position free/i);
  assert.match(migration, /positive value fixes the exact slot/i);

  for (const zone of profile.zones) {
    assert.match(sql, new RegExp(`'${escaped(zone.key)}'`, "i"));
    assert.match(sql, new RegExp(`when '${escaped(zone.key)}' then ${zone.capacity}`, "i"));
  }
});

test("RLS fecha escrita direta e service_role recebe apenas SELECT na tabela", () => {
  assert.match(sql, /alter table public\.matchday_editorial_profile_manual_overrides enable row level security/i);
  assert.match(sql, /revoke all on table public\.matchday_editorial_profile_manual_overrides from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant select on table public\.matchday_editorial_profile_manual_overrides to service_role/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[\s\S]*matchday_editorial_profile_manual_overrides[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test("a RPC é fail-closed, SECURITY DEFINER e executável apenas por service_role", () => {
  assert.match(sql, /create function public\.apply_matchday_editorial_profile_manual_overrides\( p_matchday_id uuid, p_profile_key text, p_overrides jsonb \)/i);
  assert.doesNotMatch(sql, /create or replace function public\.apply_matchday_editorial_profile_manual_overrides/i);
  assert.match(sql, /language plpgsql security definer set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.apply_matchday_editorial_profile_manual_overrides\(uuid, text, jsonb\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.apply_matchday_editorial_profile_manual_overrides\(uuid, text, jsonb\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (public|anon|authenticated)/i);
});

test("a RPC bloqueia o contexto e valida assignment, competição e banco ativo", () => {
  const matchdayLock = sql.indexOf("for update of matchday_row");
  const assignmentRead = sql.indexOf("select assignment_row.profile_key");
  const assignmentReadEnd = sql.indexOf("if not found", assignmentRead);
  const bankLock = sql.indexOf("for share", assignmentReadEnd);

  assert.match(sql, /from public\.matchdays as matchday_row join public\.seasons as season_row[\s\S]*join public\.competitions as competition_row/i);
  assert.match(sql, /where matchday_row\.id = p_matchday_id for update of matchday_row/i);
  assert.match(sql, /from public\.matchday_editorial_profile_assignments as assignment_row where assignment_row\.matchday_id = p_matchday_id/i);
  assert.doesNotMatch(sql.slice(assignmentRead, assignmentReadEnd), /for update|for share/i);
  assert.ok(matchdayLock >= 0 && assignmentRead > matchdayLock && bankLock > assignmentReadEnd);
  assert.match(sql, /v_assignment_profile_key <> p_profile_key/i);
  assert.match(sql, /v_competition_slug <> 'liga-portugal'/i);
  assert.equal(profile.competitionSlug, "liga-portugal");
  assert.match(sql, /from public\.matchday_editorial_bank_items as bank_item[\s\S]*bank_item\.matchday_id = p_matchday_id[\s\S]*bank_item\.source_type[\s\S]*'editorial_article'[\s\S]*bank_item\.status[\s\S]*'active'/i);
  assert.match(sql, /lower\(btrim\(bank_item\.status\)\) = 'active' for share/i);
  assert.match(sql, /manual-overrides-source-not-active/i);
});

test("o payload completo rejeita duplicados, slots inválidos e excesso de notícias protegidas", () => {
  assert.match(sql, /jsonb_typeof\(p_overrides\) <> 'array'/i);
  assert.match(sql, /manual-overrides-duplicate-source/i);
  assert.match(sql, /where jsonb_typeof\(payload_item\.value -> 'zone_key'\) = 'string' and jsonb_typeof\(payload_item\.value -> 'sort_order'\) = 'number'[\s\S]*manual-overrides-duplicate-slot/i);
  assert.match(sql, /where jsonb_typeof\(payload_item\.value -> 'zone_key'\) = 'string' group by payload_item\.value ->> 'zone_key' having count\(\*\) > case/i);
  assert.match(sql, /manual-overrides-zone-capacity-exceeded/i);
  assert.match(sql, /v_sort_order > v_zone_capacity/i);
});

test("o Apply valida tudo antes de substituir atomicamente o conjunto e não toca na baseline", () => {
  const functionStart = migration.indexOf("create function public.apply_matchday_editorial_profile_manual_overrides");
  const functionEnd = migration.indexOf("\n$$;", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const body = migration.slice(functionStart, functionEnd);
  const validationEnd = body.indexOf("matchday-editorial-profile-manual-overrides-zone-capacity-exceeded");
  const deleteIndex = body.indexOf("delete from public.matchday_editorial_profile_manual_overrides");
  const insertIndex = body.indexOf("insert into public.matchday_editorial_profile_manual_overrides");

  assert.ok(validationEnd >= 0 && deleteIndex > validationEnd && insertIndex > deleteIndex);
  assert.equal((body.match(/delete from public\.matchday_editorial_profile_manual_overrides/g) ?? []).length, 1);
  assert.equal((body.match(/insert into public\.matchday_editorial_profile_manual_overrides/g) ?? []).length, 1);
  assert.doesNotMatch(body, /refresh_matchday_editorial_profile_distribution/i);
  assert.doesNotMatch(body, /(insert into|update|delete from) public\.matchday_editorial_profile_state_items/i);
  assert.doesNotMatch(body, /(insert into|update|delete from) public\.(editorial_articles|matchday_editorial_bank_items)/i);
});

test("a migration não ativa Jornadas nem altera o circuito legacy", () => {
  const beforeFunction = migration.slice(0, migration.indexOf(
    "create function public.apply_matchday_editorial_profile_manual_overrides",
  ));
  assert.doesNotMatch(beforeFunction, /insert into public\.matchday_editorial_profile_assignments/i);
  assert.doesNotMatch(sql, /alter table public\.matchdays\b/i);
  assert.doesNotMatch(sql, /matchday_editorial_desk_control|matchday_live_layout_items|matchday_horizontal_news|matchday_latest_news|matchday_editorials|matchday_highlights|matchday_reference_compositions/i);
});

test("a API temática recompõe no servidor e chama uma única RPC atómica", () => {
  const route = source("app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /ADMIN_SESSION_COOKIE[\s\S]*verifyAdminSession/);
  assert.match(route, /validateMatchdayEditorialProfileManualOverrides/);
  assert.match(route, /readMatchdayEditorialProfileDesk[\s\S]*reconcileMatchdayEditorialProfileWorkspace/);
  assert.match(route, /writeSupabaseAdminReturning<ApplyResultRow>[\s\S]*rpc\/apply_matchday_editorial_profile_workspace/);
  assert.match(route, /p_overrides: overrides\.map/);
  assert.match(route, /p_zone_items: reconcile\.zonesAfter/);
  assert.match(route, /p_faixa_source_ids: reconcile\.faixaAfter/);
  assert.doesNotMatch(route, /refresh_matchday_editorial_profile_distribution|matchday_editorial_profile_state_items/);
  assert.equal((route.match(/writeSupabaseAdminReturning/g) ?? []).length, 2);
});
