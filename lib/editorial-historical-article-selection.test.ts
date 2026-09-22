import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260922161613_matchday_historical_article_selection.sql",
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

test("a decisão Histórica é uma relação privada mínima com identidade canónica", () => {
  assert.match(migration, /create table jornada_private\.matchday_historical_article_selections/);
  assert.match(migration, /primary key \(matchday_id, article_id\)/);
  assert.match(migration, /article_id uuid not null[\s\S]*references public\.editorial_articles\(id\)/);
  assert.match(migration, /matchday_id uuid not null[\s\S]*references public\.matchdays\(id\)/);
  assert.match(migration, /selected_at timestamptz not null default statement_timestamp\(\)/);
  assert.match(migration, /matchday_historical_article_selections_article_idx[\s\S]*\(article_id\)/);
  assert.doesNotMatch(migration, /title_snapshot|classification_key|bank_item_id|zone_id|placement_id/);
});

test("RLS e privilégios impedem acesso direto e expõem apenas RPC service_role", () => {
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all on table jornada_private\.matchday_historical_article_selections[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(
    migration,
    /grant execute on function[\s\S]*read_matchday_historical_article_selections_v1\(uuid\)[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function[\s\S]*set_matchday_historical_article_selection_v1\(uuid, uuid\[\], boolean\)[\s\S]*to service_role/,
  );
});

test("a mutação batch é atómica, homogénea e valida artigo da Jornada ou herança revalidada", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /from public\.matchdays[\s\S]*for update/);
  assert.match(migration, /article\.matchday_id = p_matchday_id/);
  assert.match(migration, /continuity_source_matchday_id is not null/);
  assert.match(migration, /continuity_revalidated_at is not null/);
  assert.match(migration, /lower\(btrim\(bank_item\.source_id\)\) = lower\(article\.id::text\)/);
  assert.match(migration, /already-selected/);
  assert.match(migration, /not-selected/);
  assert.match(migration, /insert into jornada_private\.matchday_historical_article_selections/);
  assert.match(migration, /delete from jornada_private\.matchday_historical_article_selections/);
  assert.doesNotMatch(migration, /historical_eligible|automatic_eligible/);
});

test("a página server lê a decisão e envia apenas o booleano mínimo ao cliente", () => {
  assert.match(page, /read_matchday_historical_article_selections_v1/);
  assert.match(page, /historicallySelectedArticleIds/);
  assert.match(page, /historicallySelected:\s*historicallySelectedArticleIds\.has\(bankItem\.source_id\)/);
  assert.match(client, /historicallySelected: boolean/);
});

test("as ações em lote reutilizam o Bank físico e mantêm Histórica fora do payload da montagem", () => {
  assert.match(route, /bulkMovePhysicalDeskItemsToBank\(initial, bankItemIds\)/);
  assert.match(route, /releasePhysicalDeskItem\(state, bankItemId\)/);
  assert.match(route, /apply_matchday_live_layout_physical_v29/);
  assert.doesNotMatch(
    route.slice(
      route.indexOf("async function applyHistoricalWorkspaceBankMutation"),
      route.indexOf("async function applyHistoricalArticleSelectionMutation"),
    ),
    /matchday_editorial_profile_manual_overrides/,
  );
  const applyChanges = client.slice(
    client.indexOf("  async function applyChanges()"),
    client.indexOf("\n  function renderCard", client.indexOf("  async function applyChanges()")),
  );
  assert.doesNotMatch(applyChanges, /historicallySelected|historicalSelectionFilter|set_historical_article_selection/);
});

test("seleções mistas não expõem uma operação parcial", () => {
  assert.match(client, /selectedAreAllInBank/);
  assert.match(client, /selectedAreAllOutsideBank/);
  assert.match(client, /selectedAreAllHistorical/);
  assert.match(client, /selectedAreAllOutsideHistorical/);
  assert.match(route, /const homogeneous = moveToBank/);
  assert.match(route, /mistura estados de Bank/);
  assert.match(migration, /v_existing_selection_count/);
});

test("ações bem sucedidas limpam a seleção e recarregam a verdade server", () => {
  const mutation = client.slice(
    client.indexOf("  async function applyBatchEditorialDecision"),
    client.indexOf("\n  async function applyChanges", client.indexOf("  async function applyBatchEditorialDecision")),
  );
  assert.match(mutation, /setSelectedBankItemIds\(\[\]\)/);
  assert.match(mutation, /router\.refresh\(\)/);
  assert.match(page, /read_matchday_historical_article_selections_v1/);
  assert.match(page, /physicalWorkspace\.explicitBankItemIds/);
});

test("colocação de três peças continua a usar a ordem da seleção e a falhar antes de alterações parciais", () => {
  assert.match(client, /if \(freePositions\.length < selectedBankItemIds\.length\)/);
  assert.match(client, /selectedBankItemIds\.forEach\(\(bankItemId, index\) =>/);
  assert.match(client, /nextItems\[freePositions\[index\]\.position\]/);
  assert.match(client, /if \(freeKeys\.length < selectedArticles\.length\)/);
  assert.match(client, /\[freeKeys\[index\]\]: card/);
});

test("filtro, contagens e marcador Histórica usam a mesma propriedade persistida", () => {
  assert.match(client, /historicalCompositionSelectionCounts/);
  assert.match(client, /historicalSelectionFilter/);
  assert.match(client, /Selecionados \(\{historicalSelectionCounts\.selected\}\)/);
  assert.match(client, /Não selecionados \(\{historicalSelectionCounts\.unselected\}\)/);
  assert.match(client, /article\.historicallySelected/);
  assert.match(client, />HISTÓRICA</);
});

test("o layout mantém apenas o bloco operacional sticky e zonas de seis em 3 por 2", () => {
  assert.match(client, /\.hc-desk-operational-sticky \{[\s\S]*?position: sticky/);
  assert.match(client, /\.hc-desk-slots-6 \{[\s\S]*?grid-template-columns: repeat\(3,/);
  assert.match(client, /\.hc-desk-card-body \{[\s\S]*?grid-template-columns: 56px/);
  assert.match(client, /\.hc-desk-card-body img,[\s\S]*?width: 56px;[\s\S]*?height: 42px;/);
  assert.match(client, /\.hc-desk-card strong \{[\s\S]*?font-size: 13px;/);
  assert.match(client, /\.hc-desk-copy strong \{[\s\S]*?font-size: 13px;/);
  assert.match(client, /\.hc-zone-tabs \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?overflow-x: auto;/);
});
