import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260922171755_matchday_historical_article_selection.sql",
  "utf8",
);
const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

test("a decisão histórica é um único estado privado ligado ao artigo canónico", () => {
  assert.match(migration, /create table jornada_private\.matchday_historical_article_decisions/);
  assert.match(migration, /primary key \(matchday_id, article_id\)/);
  assert.match(migration, /article_id uuid not null[\s\S]*references public\.editorial_articles\(id\)/);
  assert.match(migration, /matchday_id uuid not null[\s\S]*references public\.matchdays\(id\)/);
  assert.match(migration, /decision text not null/);
  assert.match(migration, /check \(decision in \('selected', 'bank', 'undecided'\)\)/);
  assert.match(migration, /updated_at timestamptz not null default statement_timestamp\(\)/);
  assert.doesNotMatch(migration, /title_snapshot|classification_key|bank_item_id|zone_id|placement_id/);
  assert.doesNotMatch(migration, /create table jornada_private\.matchday_historical_article_selections/);
});

test("undecided é persistido e ausência de linha conserva apenas a semântica sem decisão", () => {
  assert.match(migration, /Row absence means no historical decision yet; undecided is an explicit persisted override/);
  assert.match(migration, /insert into jornada_private\.matchday_historical_article_decisions/);
  assert.match(migration, /on conflict \(matchday_id, article_id\) do update[\s\S]*decision = excluded\.decision/);
  assert.doesNotMatch(migration, /delete from jornada_private\.matchday_historical_article_decisions/);
  assert.match(client, /applyBatchEditorialDecision\("undecided"\)/);
});

test("RLS e privilégios impedem acesso direto e expõem apenas RPC service_role", () => {
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all on table jornada_private\.matchday_historical_article_decisions[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(
    migration,
    /grant execute on function[\s\S]*read_matchday_historical_article_decisions_v1\(uuid\)[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function[\s\S]*set_matchday_historical_article_decision_v1\(uuid, uuid\[\], text\)[\s\S]*to service_role/,
  );
});

test("a mutação batch é atómica e valida artigo atual ou herança revalidada", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /from public\.matchdays[\s\S]*for update/);
  assert.match(migration, /article\.matchday_id = p_matchday_id/);
  assert.match(migration, /continuity_source_matchday_id is not null/);
  assert.match(migration, /continuity_revalidated_at is not null/);
  assert.match(migration, /lower\(btrim\(bank_item\.source_id\)\) = lower\(article\.id::text\)/);
  assert.match(migration, /v_eligible_article_count <> v_requested_count[\s\S]*article-not-eligible/);
  assert.doesNotMatch(migration, /historical_eligible|automatic_eligible/);
});

test("uma Jornada encerrada pode decidir sem tocar na Mesa Viva", () => {
  const mutation = route.slice(
    route.indexOf("async function applyHistoricalArticleDecisionMutation"),
    route.indexOf("export async function POST"),
  );
  assert.match(mutation, /set_matchday_historical_article_decision_v1/);
  assert.doesNotMatch(mutation, /apply_matchday_live_layout_physical_v29/);
  assert.doesNotMatch(mutation, /physicalWorkspace|explicitBankItemIds|is_managed|desk_control/);
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from)\s+(?:public\.)?matchday_live_layout_/i,
  );
  assert.doesNotMatch(route, /set_historical_workspace_bank/);
  assert.doesNotMatch(route, /O Bank físico só pode ser alterado/);
});

test("o server aplica decisão explícita antes do fallback imutável do Bank da Viva", () => {
  assert.match(page, /read_matchday_historical_article_decisions_v1/);
  assert.match(page, /historicalDecisionByArticleId/);
  assert.match(
    page,
    /historicalCompositionEffectiveDecision\([\s\S]*historicalDecisionByArticleId\.get\(bankItem\.source_id\)[\s\S]*hierarchicalExplicitLiveBankItemIds\.has\(bankItem\.id\)/,
  );
  assert.match(client, /historicalDecision: HistoricalCompositionDecision/);
  assert.doesNotMatch(client, /historicallySelected: boolean|fromLiveBank: boolean/);
});

test("as quatro ações escrevem apenas a decisão histórica canónica", () => {
  assert.match(client, /action_type", "set_historical_article_decision"/);
  assert.match(client, /article_ids_json/);
  assert.match(client, /body\.set\("decision", decision\)/);
  assert.match(client, /applyBatchEditorialDecision\("bank"\)/);
  assert.match(client, /applyBatchEditorialDecision\("selected"\)/);
  assert.match(client, /applyBatchEditorialDecision\("undecided"\)/);
  assert.doesNotMatch(client, /bank_item_ids_json|set_historical_workspace_bank/);
});

test("seleções mistas não expõem operação parcial", () => {
  assert.match(client, /selectedHistoricalDecision/);
  assert.match(client, /selectedArticles\.every\([\s\S]*article\.historicalDecision === selectedArticles\[0\]\?\.historicalDecision/);
  assert.match(client, /selectedHistoricalDecision !== null/);
  assert.doesNotMatch(route, /mistura estados de Bank/);
});

test("ações bem sucedidas limpam a seleção e recarregam a verdade server", () => {
  const mutation = client.slice(
    client.indexOf("  async function applyBatchEditorialDecision"),
    client.indexOf("\n  async function applyChanges", client.indexOf("  async function applyBatchEditorialDecision")),
  );
  assert.match(mutation, /setSelectedBankItemIds\(\[\]\)/);
  assert.match(mutation, /router\.refresh\(\)/);
  assert.match(page, /read_matchday_historical_article_decisions_v1/);
});

test("decisão histórica e Bank não entram no payload de Guardar montagem", () => {
  const applyChanges = client.slice(
    client.indexOf("  async function applyChanges()"),
    client.indexOf("\n  function renderCard", client.indexOf("  async function applyChanges()")),
  );
  assert.match(applyChanges, /operations_json/);
  assert.match(applyChanges, /settings_json/);
  assert.match(applyChanges, /dynamic_zones_json/);
  assert.doesNotMatch(applyChanges, /historicalDecision|set_historical_article_decision/);
});

test("o layout revisto permanece inalterado", () => {
  assert.match(client, /\.hc-desk-operational-sticky \{[\s\S]*?position: sticky/);
  assert.match(client, /\.hc-desk-slots-6 \{[\s\S]*?grid-template-columns: repeat\(3,/);
  assert.match(client, /\.hc-desk-card-body \{[\s\S]*?grid-template-columns: 56px/);
  assert.match(client, /\.hc-desk-card-body img,[\s\S]*?width: 56px;[\s\S]*?height: 42px;/);
  assert.match(client, /\.hc-desk-card strong \{[\s\S]*?font-size: 13px;/);
  assert.match(client, /\.hc-desk-copy strong \{[\s\S]*?font-size: 13px;/);
  assert.match(client, /\.hc-zone-tabs \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?overflow-x: auto;/);
});
