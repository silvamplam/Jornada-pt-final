import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import {
  buildMatchdayEditorialTrackingSnapshot,
  selectMatchdayEditorialExplicitBankItems,
  selectMatchdayEditorialTrackingItems,
  type MatchdayLiveDeskAggregateRow,
} from "@/lib/editorial-matchday-profile-desk";

const migration = readFileSync(
  "supabase/migrations/20260902110327_matchday_live_desk_aggregate_tracking_reader.sql",
  "utf8",
);
const explicitBankMigration = readFileSync(
  "supabase/migrations/20260902130518_matchday_explicit_bank_displaced_semantics.sql",
  "utf8",
);
const reader = readFileSync("lib/editorial-matchday-profile-desk.ts", "utf8");
const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  "utf8",
);

function row(
  suffix: string,
  editorialState: MatchdayLiveDeskAggregateRow["editorial_state"],
  overrides: Partial<MatchdayLiveDeskAggregateRow> = {},
): MatchdayLiveDeskAggregateRow {
  const sourceId = `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const placed = editorialState === "FAIXA" || editorialState === "COLOCADA";
  return {
    bank_item_id: `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
    source_type: "editorial_article",
    source_id: sourceId,
    label: "SPORTING",
    title: `Notícia ${suffix}`,
    subtitle: null,
    image_url: null,
    link_url: `/noticias/article-${suffix}`,
    bank_status: "active",
    automatic_eligible: true,
    classification_key: "sporting",
    classification_source: "automatic",
    classified_at: "2026-09-02T09:00:00.000Z",
    article_id: sourceId,
    article_published_at: "2026-09-02T08:00:00.000Z",
    article_updated_at: "2026-09-02T08:30:00.000Z",
    has_automatic_state: true,
    automatic_zone_key: "sporting",
    automatic_sort_order: Number(suffix),
    placement_count: placed ? 1 : 0,
    transversal_conflict: false,
    memory_kind: editorialState === "DESALOJADA" ? "displaced" : null,
    history_unknown: false,
    memory_placement_conflict: false,
    is_explicit_bank: false,
    bank_placement_conflict: false,
    editorial_state: editorialState,
    placement_id: placed ? `20000000-0000-4000-8000-${suffix.padStart(12, "0")}` : null,
    placement_type: placed ? editorialState === "FAIXA" ? "faixa" : "zone" : null,
    zone_id: editorialState === "COLOCADA" ? "30000000-0000-4000-8000-000000000001" : null,
    placement_zone_key: editorialState === "COLOCADA" ? "sporting" : null,
    slot_position: placed ? Number(suffix) : null,
    inactive_historical_count: 0,
    ...overrides,
  };
}

test("NOVA, FAIXA e DESALOJADA coexistem na mesma classe e preservam classificação", () => {
  const result = buildMatchdayEditorialTrackingSnapshot(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [row("1", "NOVA"), row("2", "FAIXA"), row("3", "DESALOJADA")],
  );

  assert.deepEqual(
    result.tracking.items.map((item) => item.editorialState),
    ["NOVA", "FAIXA", "DESALOJADA"],
  );
  assert.equal(result.tracking.items.every((item) => item.classifiedZoneKey === "sporting"), true);
  assert.equal(result.tracking.items.every((item) => item.classificationSource === "automatic"), true);
  assert.equal(result.diagnostics.length, 0);
});

test("COLOCADA e legacy_unknown ficam fora e conflitos são fail-closed", () => {
  const legacy = row("5", null, {
    memory_kind: "legacy_unknown",
    history_unknown: true,
  });
  const transversal = row("6", null, {
    placement_count: 2,
    transversal_conflict: true,
  });
  const memoryPlacement = row("7", null, {
    placement_count: 1,
    memory_kind: "displaced",
    memory_placement_conflict: true,
  });
  const result = buildMatchdayEditorialTrackingSnapshot(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [row("4", "COLOCADA"), legacy, transversal, memoryPlacement],
  );

  assert.deepEqual(result.tracking.items, []);
  assert.equal(result.tracking.legacyUnknownCount, 1);
  assert.equal(result.tracking.conflictCount, 2);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    ["legacy_unknown_state", "memory_placement_state_conflict", "transversal_state_conflict"],
  );
});

test("Banco explícito fica fora do tracking e tem prioridade sobre memória antiga", () => {
  const overlap = row("11", null, {
    is_explicit_bank: true,
    memory_kind: "displaced",
  });
  const placementConflict = row("12", null, {
    bank_placement_conflict: true,
    is_explicit_bank: true,
    placement_count: 1,
    placement_type: "faixa",
  });
  const result = buildMatchdayEditorialTrackingSnapshot(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [overlap, placementConflict],
  );

  assert.deepEqual(result.tracking.items, []);
  assert.equal(result.tracking.conflictCount, 1);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    ["explicit_bank_memory_overlap", "explicit_bank_placement_conflict"],
  );
});

test("Todas agrega classes válidas e deduplica pela identidade contextual do Bank", () => {
  const snapshot = buildMatchdayEditorialTrackingSnapshot(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [
      row("8", "NOVA"),
      row("9", "FAIXA", { classification_key: "benfica" }),
      row("10", "DESALOJADA", { classification_key: "fc_porto" }),
    ],
  ).tracking.items;
  const duplicatedInput = [...snapshot, snapshot[0]];

  assert.deepEqual(
    selectMatchdayEditorialTrackingItems(duplicatedInput, "all").map((item) => item.bankItemId),
    snapshot.map((item) => item.bankItemId),
  );
  assert.deepEqual(
    selectMatchdayEditorialTrackingItems(duplicatedInput, "sporting").map((item) => item.editorialState),
    ["NOVA"],
  );
  assert.equal(
    selectMatchdayEditorialTrackingItems(duplicatedInput, "all").length,
    3,
  );
});

test("o wrapper público é read-only, reutiliza a projeção privada e só service_role executa", () => {
  assert.match(migration, /create function public\.read_matchday_live_desk_aggregate_tracking/u);
  assert.match(migration, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/u);
  assert.match(migration, /jornada_private\.project_matchday_live_layout_bank_item_states/u);
  assert.match(migration, /when projected_row\.transversal_conflict[\s\S]*or projected_row\.memory_placement_conflict[\s\S]*then null::text/u);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/u);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/u);
  assert.doesNotMatch(migration, /\b(?:insert into|update|delete from|truncate)\b/iu);
});

test("o reader forward-only expõe Banco separadamente e mantém conflitos fail-closed", () => {
  assert.match(explicitBankMigration, /is_explicit_bank boolean/u);
  assert.match(explicitBankMigration, /bank_placement_conflict boolean/u);
  assert.match(explicitBankMigration, /override_row\.placement_target = 'bank'/u);
  assert.match(
    explicitBankMigration,
    /when explicit_bank\.bank_item_id is not null[\s\S]*then null::text/u,
  );
  assert.match(
    explicitBankMigration,
    /grant execute on function[\s\S]*read_matchday_live_desk_aggregate_tracking\(uuid, text\)[\s\S]*to service_role/u,
  );
});

test("o reader troca oito leituras fragmentadas por um contrato compacto sem body", () => {
  assert.match(reader, /rpc\/read_matchday_live_desk_aggregate_tracking/u);
  for (const legacyRead of [
    "matchday_editorial_profile_state_items?",
    "matchday_editorial_bank_items?",
    "matchday_editorial_profile_classification_plan?",
    "matchday_editorial_profile_continuity_classification_plan?",
    "matchday_editorial_profile_zone_items?",
    "matchday_live_layout_placements?",
    "matchday_highlights?",
    "editorial_articles?",
  ]) {
    assert.equal(reader.includes(legacyRead), false, legacyRead);
  }
  assert.doesNotMatch(migration, /\bbody\b/iu);
  assert.match(reader, /selectionCandidates[\s\S]*editorialSelection/u);
  assert.doesNotMatch(client, /method: "GET"[\s\S]*organizar\/tematico/u);
  assert.doesNotMatch(route, /matchday_editorial_bank_items\?select=id,source_type,source_id/u);
});

test("a UI mostra Todas primeiro, três colunas simultâneas e Banco separado", () => {
  assert.match(client, /TRACKING_STATES = \["NOVA", "FAIXA", "DESALOJADA"\]/u);
  assert.match(client, /TRACKING_STATES\.map\(\(state\)/u);
  assert.match(client, /data-tracking-state=\{state\}/u);
  assert.match(client, /useState<MatchdayEditorialTrackingClassFilter>\("all"\)/u);
  assert.match(client, /selectMatchdayEditorialTrackingItems\([\s\S]*desk\.tracking\.items,[\s\S]*"all"/u);
  assert.match(client, /Todas \{trackableItems\.length\}/u);
  assert.match(client, /Sem notícias novas nesta classe/u);
  assert.match(client, /Sem notícias na Faixa nesta classe/u);
  assert.match(client, /Sem notícias desalojadas nesta classe/u);
  assert.match(client, /\.thematic-tracking-rows \{[^}]*grid-template-columns: repeat\(3,minmax\(0,1fr\)\);[^}]*align-items: start/u);
  assert.match(client, /@media \(max-width: 900px\) \{ \.thematic-tracking-rows \{ grid-template-columns: 1fr; \} \}/u);
  assert.match(client, /\.thematic-tracking-row \.thematic-sources-list \{ grid-template-columns: 1fr;/u);
  assert.match(client, /\.thematic-tracking-row \.thematic-empty \{ min-height: 44px; \}/u);
  assert.match(client, /className="thematic-tracking-row-label"/u);
  assert.match(
    client,
    /className="thematic-tracking-row-label"[\s\S]*\{entries\.length > 0 \? \([\s\S]*Selecionar linha[\s\S]*className="thematic-sources-list"/u,
  );
  assert.doesNotMatch(client, /className="thematic-tracking-row-actions"/u);
  assert.doesNotMatch(client, /\.thematic-tracking-row > header/u);
  assert.doesNotMatch(client, /SourceViewKey|activeSourceView/u);

  const start = client.indexOf('aria-label="Tracking editorial por classe"');
  const end = client.indexOf("function renderActiveWorkspace", start);
  const trackingUi = client.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(trackingUi.indexOf("Todas") < trackingUi.indexOf("profile.zones.map"));
  assert.doesNotMatch(client, /data-tracking-state=[^\n]*BANCO/u);
  assert.match(trackingUi, /className="thematic-bank-access"/u);
  assert.match(trackingUi, /aria-label="Banco editorial"/u);
});

test("Banco tem Todas e filtros contextuais independentes com contadores próprios", () => {
  assert.match(client, /const \[bankClassFilter, setBankClassFilter\][\s\S]*useState<MatchdayEditorialTrackingClassFilter>\("all"\)/u);
  assert.match(client, /aria-label="Filtrar Banco por classe contextual"/u);
  assert.match(client, /selectMatchdayEditorialExplicitBankItems\([\s\S]*explicitBankEntries,[\s\S]*bankClassFilter/u);
  assert.match(client, /Todas \{explicitBankEntries\.length\}/u);
  assert.match(client, /entry\.classifiedZoneKey === zone\.key/u);
  assert.match(client, /filteredBankEntries\.map\(\(\{ item \}\) => identity\(item\)\)/u);
  assert.match(client, /visibleBankEntries = filteredBankEntries\.slice\(0, bankVisibleCount\)/u);
  assert.match(client, /aria-label="Pesquisar Tracking e Banco"/u);
  assert.doesNotMatch(client, /setTrackingClassFilter\(bankClassFilter\)/u);

  const bankStart = client.indexOf('aria-label="Banco editorial"');
  const bankEnd = client.indexOf('<div className="thematic-tracking-rows">', bankStart);
  const bankUi = client.slice(bankStart, bankEnd);
  assert.ok(bankStart >= 0 && bankEnd > bankStart);
  assert.doesNotMatch(bankUi, /<header>/u);
  assert.match(bankUi, /className="thematic-bank-class-filters"[\s\S]*Selecionar Banco/u);
  assert.doesNotMatch(bankUi, /disponíveis/u);
});

test("contadores do Tracking excluem Banco explícito no snapshot e no draft", () => {
  const explicitBank = row("13", null, {
    classification_key: "sporting",
    is_explicit_bank: true,
    memory_kind: "displaced",
  });
  const tracking = buildMatchdayEditorialTrackingSnapshot(
    EDITORIAL_PROFILES.liga_portugal_v1,
    [row("14", "NOVA"), explicitBank],
  ).tracking.items;
  const bank = selectMatchdayEditorialExplicitBankItems([
    { bankItemId: explicitBank.bank_item_id, classifiedZoneKey: "sporting" },
    { bankItemId: explicitBank.bank_item_id, classifiedZoneKey: "sporting" },
  ], "all");

  assert.equal(selectMatchdayEditorialTrackingItems(tracking, "all").length, 1);
  assert.equal(selectMatchdayEditorialTrackingItems(tracking, "sporting").length, 1);
  assert.equal(bank.length, 1);
  assert.equal(selectMatchdayEditorialExplicitBankItems(bank, "sporting").length, 1);
  assert.equal(selectMatchdayEditorialExplicitBankItems(bank, "benfica").length, 0);
  assert.match(client, /const trackableItems = useMemo\([\s\S]*!draftExplicitBankIdentities\.has\(itemIdentity\)/u);
  assert.match(client, /Todas \{trackableItems\.length\}/u);
  assert.match(client, /\{zone\.label\} \{trackableItems\.filter/u);
  assert.match(client, /Banco \{explicitBankEntries\.length\}/u);
  assert.match(client, /Todas \{explicitBankEntries\.length\}/u);
});
