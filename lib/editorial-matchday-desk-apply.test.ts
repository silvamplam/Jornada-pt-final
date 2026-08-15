import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const migration = source("supabase/migrations/20260815230610_matchday_editorial_desk_real_apply.sql");
const route = source("app/api/admin/editorial/jornada/[matchdayId]/organizar/route.ts");
const client = source("app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialDeskClient.tsx");
const reader = source("lib/editorial-matchday-desk.ts");
const publicLoader = source("lib/public-matchday.ts");
const publicPage = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");

test("a migration cria controlo e um RPC transacional de estado final", () => {
  assert.match(migration, /create table if not exists public\.matchday_editorial_desk_control/);
  assert.match(migration, /is_managed boolean not null default false/);
  assert.match(migration, /faixa_visible boolean not null default true/);
  assert.match(migration, /revision bigint not null default 0/);
  assert.match(migration, /create or replace function public\.apply_matchday_editorial_desk_state/);
  assert.match(migration, /p_expected_revision bigint/);
  assert.match(migration, /p_expected_state_token text/);
  assert.match(migration, /editorial-desk-state-token-conflict/);
  assert.match(migration, /is_managed = true/);
  assert.match(migration, /revision = excluded\.revision/);
});

test("o Apply substitui o conjunto vivo dentro da transação e suporta trocas e ciclos", () => {
  assert.match(migration, /delete from public\.matchday_highlights where matchday_id = p_matchday_id/);
  assert.match(migration, /delete from public\.matchday_horizontal_news where matchday_id = p_matchday_id/);
  assert.match(migration, /delete from public\.matchday_latest_news where matchday_id = p_matchday_id/);
  assert.match(migration, /delete from public\.matchday_live_layout_items where matchday_id = p_matchday_id/);
  assert.match(migration, /insert into public\.matchday_highlights/);
  assert.match(migration, /insert into public\.matchday_horizontal_news/);
  assert.match(migration, /insert into public\.matchday_latest_news/);
  assert.match(migration, /insert into public\.matchday_live_layout_items/);
  assert.doesNotMatch(migration, /target-full|destino ocupado/i);
});

test("o RPC bloqueia perda silenciosa e não toca nas composições protegidas", () => {
  assert.match(migration, /editorial-desk-draft-content/);
  assert.match(migration, /editorial-desk-unresolved-content/);
  assert.match(migration, /'\/noticias\/' \|\| btrim\(article_row\.slug\)/);
  assert.doesNotMatch(migration, /matchday_reference_compositions/);
  assert.doesNotMatch(migration, /matchday_hierarchical_composition_slots/);
});

test("as projeções respeitam Últimas, Contexto, Complemento e o schema real dos layouts", () => {
  assert.match(migration, /at time zone 'Europe\/Lisbon'/);
  assert.match(migration, /article_id, sort_order[\s\S]*?null,[\s\S]*?row_number\(\) over/);
  assert.match(migration, /left\(nullif\(btrim\(v_side_block\.subtitle\), ''\), 500\)/);
  assert.doesNotMatch(migration, /complementary_mode\s*=/);
  assert.match(
    migration,
    /insert into public\.matchday_live_layout_items \(\s*matchday_id, slot_type, article_id, label, title, subtitle, image_url,\s*link_url, created_at, updated_at/,
  );
  assert.doesNotMatch(migration, /\bkicker\b|\bsummary\b[^\n]*matchday_live_layout_items|\bpublished_at\b[^\n]*matchday_live_layout_items/);
});

test("a API recebe o mapa inteiro, recusa snapshots antigos e a UI só confirma sucesso real", () => {
  assert.match(route, /expectedArticleIds\.length !== receivedArticleIds\.length/);
  assert.match(route, /snapshot\.revision !== body\.revision \|\| snapshot\.stateToken !== body\.stateToken/);
  assert.match(route, /status: 409/);
  assert.match(route, /snapshot\.blockedPlacements\.length > 0/);
  assert.match(client, /buildMatchdayDeskApplyArticles\(desired\)/);
  assert.match(client, /setBaseDesired\(desired\)/);
  assert.match(client, /Aplicar alterações/);
  assert.doesNotMatch(client, /Aplicar alterações · ensaio|Modo de ensaio/);
});

test("uma Jornada gerida usa zonas vivas e a visibilidade global da Faixa", () => {
  assert.match(reader, /matchday_editorial_desk_control\?select=is_managed,faixa_visible,revision/);
  assert.match(publicLoader, /readMatchdayEditorialDeskControl/);
  assert.match(publicLoader, /usePublishedReferenceForLivePage[\s\S]*?!editorialDeskControl\.isManaged/);
  assert.match(publicPage, /context\.hasPublishedReferenceComposition && !isManagedByEditorialDesk/);
  assert.match(publicPage, /isManagedByDesk: isManagedByEditorialDesk/);
  assert.match(publicPage, /faixaVisible: context\.editorialDeskControl\.faixaVisible/);
});
