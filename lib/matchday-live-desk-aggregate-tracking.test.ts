import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import {
  buildMatchdayEditorialTrackingSnapshot,
  type MatchdayLiveDeskAggregateRow,
} from "@/lib/editorial-matchday-profile-desk";

const migration = readFileSync(
  "supabase/migrations/20260902110327_matchday_live_desk_aggregate_tracking_reader.sql",
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

test("o wrapper público é read-only, reutiliza a projeção privada e só service_role executa", () => {
  assert.match(migration, /create function public\.read_matchday_live_desk_aggregate_tracking/u);
  assert.match(migration, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/u);
  assert.match(migration, /jornada_private\.project_matchday_live_layout_bank_item_states/u);
  assert.match(migration, /when projected_row\.transversal_conflict[\s\S]*or projected_row\.memory_placement_conflict[\s\S]*then null::text/u);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/u);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/u);
  assert.doesNotMatch(migration, /\b(?:insert into|update|delete from|truncate)\b/iu);
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

test("a UI mostra três linhas simultâneas e não promove Banco a estado", () => {
  assert.match(client, /TRACKING_STATES = \["NOVA", "FAIXA", "DESALOJADA"\]/u);
  assert.match(client, /TRACKING_STATES\.map\(\(state\)/u);
  assert.match(client, /data-tracking-state=\{state\}/u);
  assert.match(client, /Sem notícias novas nesta classe/u);
  assert.match(client, /Sem notícias na Faixa nesta classe/u);
  assert.match(client, /Sem notícias desalojadas nesta classe/u);
  assert.doesNotMatch(client, /SourceViewKey|activeSourceView/u);

  const start = client.indexOf('aria-label="Tracking editorial por classe"');
  const end = client.indexOf("function renderActiveWorkspace", start);
  const trackingUi = client.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(trackingUi, />\s*Banco(?:\s|\{)/u);
});
