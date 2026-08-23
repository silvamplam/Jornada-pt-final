import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const migration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/20260822211352_matchday_editorial_profile_shared_faixa_reconcile.sql",
  import.meta.url,
)), "utf8");
const sql = migration.replace(/\s+/g, " ").trim();
const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function functionBody(name: string): string {
  const start = migration.indexOf(`create function public.${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, `${name} must have a terminated body`);
  return migration.slice(start, end);
}

test("a migration é transacional e os objetos novos falham perante colisões", () => {
  assert.match(migration, /^begin;\s/i);
  assert.match(migration, /\scommit;\s*$/i);
  assert.match(sql, /create table public\.matchday_editorial_profile_zone_items \(/i);
  assert.match(sql, /create table public\.matchday_editorial_profile_reconcile_control \(/i);
  assert.match(sql, /create function public\.matchday_editorial_profile_classification_plan\(/i);
  assert.match(sql, /create function public\.matchday_editorial_profile_reconcile_token\(/i);
  assert.match(sql, /create function public\.apply_matchday_editorial_profile_reconcile\(/i);
  assert.doesNotMatch(sql, /create table if not exists public\.matchday_editorial_profile_(zone_items|reconcile_control)/i);
  assert.doesNotMatch(sql, /create or replace function public\.(matchday_editorial_profile_classification_plan|matchday_editorial_profile_reconcile_token|apply_matchday_editorial_profile_reconcile)/i);
});

test("a extensão manual distingue Banco, zona e Faixa sem quebrar rows existentes", () => {
  assert.match(sql, /add column placement_target text/i);
  assert.match(sql, /set placement_target = case when zone_key is null then 'bank' else 'zone' end/i);
  assert.match(sql, /placement_target in \('bank', 'zone', 'faixa'\)/i);
  assert.match(sql, /placement_target = 'faixa' and zone_key is null and sort_order is not null and sort_order > 0/i);
  assert.match(sql, /matchday_editorial_profile_manual_overrides_zone_capacity_check/i);
  assert.match(sql, /create unique index matchday_editorial_profile_manual_overrides_faixa_slot_key[\s\S]*where placement_target = 'faixa'/i);
  assert.match(sql, /revoke execute on function public\.apply_matchday_editorial_profile_manual_overrides\(uuid, text, jsonb\) from service_role/i);
});

test("a classificação natural devolve todos os candidatos sem apagar a classificação no overflow", () => {
  const body = functionBody("matchday_editorial_profile_classification_plan");
  assert.match(body, /returns table \(\s*source_type text,\s*source_id text,\s*classified_zone_key text,\s*actuality_order integer\s*\)/i);
  assert.match(body, /from public\.matchday_editorial_bank_items[\s\S]*join public\.editorial_articles/i);
  assert.match(body, /row_number\(\) over \([\s\S]*partition by candidate_row\.classified_zone_key[\s\S]*published_at desc nulls last[\s\S]*updated_at desc nulls last[\s\S]*source_type asc[\s\S]*source_id asc/i);
  assert.doesNotMatch(body, /then null\s+end as classified_zone_key/i);
  assert.match(sql, /create or replace function public\.matchday_editorial_profile_distribution_plan\([\s\S]*from public\.matchday_editorial_profile_classification_plan\(p_matchday_id\)/i);
  for (const zone of profile.zones) {
    assert.match(sql, new RegExp(`when '${zone.key}' then ${zone.capacity}`, "i"));
  }
});

test("o snapshot aplicado é independente, canónico, limitado pelas cinco capacidades e fechado por RLS", () => {
  assert.match(sql, /matchday_id uuid not null references public\.matchdays\(id\) on delete cascade/i);
  assert.match(sql, /unique \(matchday_id, profile_key, source_type, source_id\)/i);
  assert.match(sql, /unique \(matchday_id, profile_key, zone_key, sort_order\)/i);
  assert.match(sql, /profile_key = 'liga_portugal_v1'/i);
  assert.match(sql, /source_type = 'editorial_article'/i);
  assert.doesNotMatch(sql, /matchday_editorial_profile_zone_items[\s\S]*references public\.matchday_editorial_profile_(assignments|state_items)/i);
  assert.match(sql, /alter table public\.matchday_editorial_profile_zone_items enable row level security/i);
  assert.match(sql, /revoke all on table public\.matchday_editorial_profile_zone_items from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant select on table public\.matchday_editorial_profile_zone_items to service_role/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all) on table public\.matchday_editorial_profile_zone_items/i);
});

test("revision e token otimista abrangem assignment, baseline, artigos, overrides, snapshot e Faixa", () => {
  assert.match(sql, /primary key \(matchday_id, profile_key\)/i);
  assert.match(sql, /revision bigint not null default 0/i);
  const tokenBody = functionBody("matchday_editorial_profile_reconcile_token");
  for (const key of ["assignment", "classification", "automatic_state", "articles", "overrides", "zone_items", "control", "faixa"]) {
    assert.match(tokenBody, new RegExp(`'${key}'`, "i"));
  }
  assert.match(tokenBody, /jsonb_agg[\s\S]*order by/i);
  assert.match(sql, /revoke all on function public\.matchday_editorial_profile_reconcile_token\(uuid, text\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.matchday_editorial_profile_reconcile_token\(uuid, text\) to service_role/i);
});

test("o Apply valida payloads completos antes de substituir os três estados atomicamente", () => {
  const body = functionBody("apply_matchday_editorial_profile_reconcile");
  assert.match(body, /security definer\s*set search_path = ''/i);
  assert.match(body, /revision-conflict/i);
  assert.match(body, /state-token-conflict/i);
  assert.match(body, /unresolved-faixa/i);
  assert.match(body, /duplicate-faixa-identity/i);
  assert.match(body, /duplicate-override/i);
  assert.match(body, /duplicate-manual-slot/i);
  assert.match(body, /zone-capacity-exceeded/i);
  assert.match(body, /source-not-active/i);
  assert.match(body, /duplicate-zone-item/i);
  assert.match(body, /zone-faixa-duplicate/i);
  assert.match(body, /explicit-bank-conflict/i);
  const firstWrite = Math.min(
    body.indexOf("delete from public.matchday_editorial_profile_manual_overrides"),
    body.indexOf("delete from public.matchday_editorial_profile_zone_items"),
    body.indexOf("update public.matchday_horizontal_news"),
  );
  assert.ok(firstWrite > body.indexOf("matchday-editorial-profile-reconcile-manual-faixa-mismatch"));
  assert.match(body, /delete from public\.matchday_editorial_profile_manual_overrides[\s\S]*insert into public\.matchday_editorial_profile_manual_overrides/i);
  assert.match(body, /delete from public\.matchday_editorial_profile_zone_items[\s\S]*insert into public\.matchday_editorial_profile_zone_items/i);
  assert.doesNotMatch(body, /refresh_matchday_editorial_profile_distribution|apply_matchday_editorial_desk_state_v2/i);
  assert.doesNotMatch(body, /(insert into|update|delete from) public\.matchday_editorial_profile_state_items/i);
});

test("um segundo Apply idêntico é um no-op sem writes, timestamps ou nova revision", () => {
  const body = functionBody("apply_matchday_editorial_profile_reconcile");
  const noOp = body.indexOf("An identical full-set Apply is a successful no-op");
  const firstWrite = body.indexOf("delete from public.matchday_editorial_profile_manual_overrides");

  assert.ok(noOp >= 0 && firstWrite > noOp);
  const comparison = body.slice(noOp, firstWrite);
  assert.match(comparison, /matchday_editorial_profile_reconcile_control/i);
  assert.match(comparison, /matchday_editorial_profile_manual_overrides/i);
  assert.match(comparison, /matchday_editorial_profile_zone_items/i);
  assert.match(comparison, /matchday_horizontal_news/i);
  assert.match(comparison, /row_number\(\) over \(order by faixa_row\.sort_order, faixa_row\.id\)/i);
  assert.match(comparison, /return query[\s\S]*v_current_revision[\s\S]*v_current_token[\s\S]*return;/i);
  assert.doesNotMatch(comparison, /v_next_revision|updated_at\s*=|last_applied_at\s*=/i);
});

test("a ordem de locks evita o ciclo assignment para bank e serializa a Faixa", () => {
  const body = functionBody("apply_matchday_editorial_profile_reconcile").replace(/\s+/g, " ");
  const matchdayLock = body.indexOf("for update of matchday_row");
  const faixaLock = body.indexOf("lock table public.matchday_horizontal_news in share row exclusive mode");
  const articleLock = body.indexOf("lock table public.editorial_articles in share mode");
  const bankLock = body.indexOf("from public.matchday_editorial_bank_items as bank_row");
  const assignmentRead = body.indexOf("from public.matchday_editorial_profile_assignments as assignment_row", bankLock);
  assert.ok(matchdayLock >= 0 && faixaLock > matchdayLock && articleLock > faixaLock);
  assert.ok(bankLock > articleLock && assignmentRead > bankLock);
  assert.match(body.slice(bankLock, assignmentRead), /for share/i);
  assert.match(body.slice(assignmentRead, assignmentRead + 260), /for share/i);
});

test("a Faixa é persistida por inteiro, contínua e sem limite interno de dez", () => {
  const body = functionBody("apply_matchday_editorial_profile_reconcile");
  assert.match(body, /jsonb_array_elements\(p_faixa_source_ids\) with ordinality/i);
  assert.match(body, /update public\.matchday_horizontal_news[\s\S]*delete from public\.matchday_horizontal_news[\s\S]*insert into public\.matchday_horizontal_news/i);
  assert.match(body, /nullif\(pg_catalog\.btrim\(article_row\.label\), ''\)[\s\S]*nullif\(pg_catalog\.btrim\(article_row\.title\), ''\)[\s\S]*'\/noticias\/' \|\| pg_catalog\.btrim\(article_row\.slug\)[\s\S]*'published'/i);
  assert.doesNotMatch(body, /limit\s+10|slice\s*\(\s*0\s*,\s*10/i);
  assert.match(body, /placement_target' = 'faixa'[\s\S]*p_faixa_source_ids/i);
});

test("ACLs da RPC são service_role only e o circuito proibido não é alterado", () => {
  assert.match(sql, /revoke all on function public\.apply_matchday_editorial_profile_reconcile\( uuid, text, bigint, text, jsonb, jsonb, jsonb \) from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.apply_matchday_editorial_profile_reconcile\( uuid, text, bigint, text, jsonb, jsonb, jsonb \) to service_role/i);
  assert.doesNotMatch(sql, /matchday_live_layout_items|matchday_editorial_desk_control|matchday_latest_news|matchday_highlights|matchday_reference_compositions|jornada_artigo_v1/i);
  assert.doesNotMatch(sql, /insert into public\.matchday_editorial_profile_assignments/i);
  assert.doesNotMatch(sql, /alter table public\.matchdays\b/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});
