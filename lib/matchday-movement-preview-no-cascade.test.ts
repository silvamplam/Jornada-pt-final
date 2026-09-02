import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyMatchdayEditorialMovementPreview,
} from "@/lib/editorial-matchday-movement-preview";
import {
  placeMatchdayEditorialItemsInZoneWithoutCascade,
  thematicEditorialIdentity,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  moveMatchdayEditorialProfileItemToOpening,
  reconcileMatchdayEditorialProfileWorkspace,
} from "@/lib/editorial-matchday-profile-workspace";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
} from "@/lib/editorial-matchday-profile-desk";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function identity(sourceId: string) {
  return thematicEditorialIdentity("editorial_article", sourceId);
}

function item(
  sourceId: string,
  order: number,
): MatchdayEditorialProfileDeskAutomaticItem {
  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder: order,
    label: "FC Porto",
    title: sourceId,
    subtitle: null,
    imageUrl: null,
    publishedAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
    classifiedZoneKey: "fc_porto",
    circuitOrder: order,
    isNew: sourceId === "incoming",
  };
}

function directZoneOverride(
  sourceId: string,
  sortOrder: number,
): MatchdayEditorialProfileManualOverride {
  return {
    sourceType: "editorial_article",
    sourceId,
    placementTarget: "zone",
    zoneKey: "fc_porto",
    sortOrder,
  };
}

test("NOVA para destino vazio remove a origem sem criar desalojada", () => {
  const result = applyMatchdayEditorialMovementPreview(
    { displacedIdentities: [], vacantZoneSlots: [], vacantFaixaSlots: [] },
    [{
      incomingIdentity: identity("incoming"),
      source: { kind: "tracking" },
      target: { kind: "opening", slotPosition: 5 },
      displacedIdentity: null,
    }],
  );

  assert.deepEqual(result.displacedIdentities, []);
  assert.deepEqual(result.vacantZoneSlots, []);
});

test("NOVA, FAIXA e BANCO para destino ocupado produzem o mesmo outgoing desalojado", () => {
  for (const source of [
    { kind: "tracking" as const },
    { kind: "faixa" as const, slotPosition: 3 },
    { kind: "bank" as const },
  ]) {
    const result = applyMatchdayEditorialMovementPreview(
      { displacedIdentities: [], vacantZoneSlots: [], vacantFaixaSlots: [] },
      [{
        incomingIdentity: identity("incoming"),
        source,
        target: { kind: "opening", slotPosition: 5 },
        displacedIdentity: identity("outgoing"),
      }],
    );

    assert.deepEqual(result.displacedIdentities, [identity("outgoing")]);
  }
});

test("saída da Faixa reserva a origem sem shift e a nova ocupação limpa só o destino", () => {
  const movedOut = applyMatchdayEditorialMovementPreview(
    { displacedIdentities: [], vacantZoneSlots: [], vacantFaixaSlots: [] },
    [{
      incomingIdentity: identity("x"),
      source: { kind: "faixa", slotPosition: 2 },
      target: { kind: "opening", slotPosition: 1 },
      displacedIdentity: identity("y"),
    }],
  );
  assert.deepEqual(movedOut.vacantFaixaSlots, [2]);

  const occupiedAgain = applyMatchdayEditorialMovementPreview(
    movedOut,
    [{
      incomingIdentity: identity("z"),
      source: { kind: "tracking" },
      target: { kind: "faixa", slotPosition: 2 },
      displacedIdentity: null,
    }],
  );
  assert.deepEqual(occupiedAgain.vacantFaixaSlots, []);
  assert.deepEqual(occupiedAgain.displacedIdentities, [identity("y")]);
});

test("placement A para B não faz swap: A fica vago e Y fica desalojada", () => {
  const result = applyMatchdayEditorialMovementPreview(
    { displacedIdentities: [], vacantZoneSlots: [], vacantFaixaSlots: [] },
    [{
      incomingIdentity: identity("x"),
      source: { kind: "zone", zoneKey: "fc_porto", slotPosition: 1 },
      target: { kind: "zone", zoneKey: "fc_porto", slotPosition: 2 },
      displacedIdentity: identity("y"),
    }],
  );

  assert.deepEqual(result.vacantZoneSlots, [{
    zoneKey: "fc_porto",
    slotPosition: 1,
  }]);
  assert.deepEqual(result.displacedIdentities, [identity("y")]);
});

test("DESALOJADA X para B troca apenas a identidade desalojada", () => {
  const result = applyMatchdayEditorialMovementPreview(
    {
      displacedIdentities: [identity("x")],
      vacantZoneSlots: [],
      vacantFaixaSlots: [],
    },
    [{
      incomingIdentity: identity("x"),
      source: { kind: "tracking" },
      target: { kind: "opening", slotPosition: 5 },
      displacedIdentity: identity("y"),
    }],
  );

  assert.deepEqual(result.displacedIdentities, [identity("y")]);
});

test("movimento interno na Abertura deixa a origem vazia", () => {
  const result = moveMatchdayEditorialProfileItemToOpening(
    {
      headline: "x",
      highlight_1: "y",
      highlight_2: null,
      highlight_3: null,
      context: null,
    },
    "x",
    "highlight_1",
  );

  assert.equal(result.opening.headline, null);
  assert.equal(result.opening.highlight_1, "x");
  assert.equal(result.displacedSourceId, "y");
});

test("reconcile preserva o buraco A, ocupa B com X e não devolve Y à zona natural", () => {
  const baseline = Array.from({ length: 5 }, (_, index) => (
    item(index === 0 ? "x" : index === 1 ? "y" : `base-${index + 1}`, index + 1)
  ));
  const active = baseline;
  const currentZoneItems = baseline.map((entry, index) => ({
    ...entry,
    sortOrder: index + 1,
    manualOverride: null,
  }));
  const overrides = placeMatchdayEditorialItemsInZoneWithoutCascade(
    profile,
    active,
    [],
    [identity("x")],
    "fc_porto",
    2,
    currentZoneItems,
  );
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    active,
    overrides,
    {
      headline: null,
      highlight_1: null,
      highlight_2: null,
      highlight_3: null,
      context: null,
    },
    baseline.map((entry, index) => ({
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      zoneKey: "fc_porto",
      sortOrder: index + 1,
    })),
    true,
    [],
    {
      displacedIdentities: [identity("y")],
      vacantZoneSlots: [{ zoneKey: "fc_porto", slotPosition: 1 }],
    },
  );
  const fcPorto = reconciled.zonesAfter.find((zone) => zone.key === "fc_porto");

  assert.deepEqual(
    fcPorto?.items.map((entry) => [entry.sortOrder, entry.sourceId]),
    [[2, "x"], [3, "base-3"], [4, "base-4"], [5, "base-5"]],
  );
  assert.equal(
    reconciled.zonesAfter.some((zone) =>
      zone.items.some((entry) => entry.sourceId === "y")),
    false,
  );
  assert.equal(reconciled.faixaAfter.some((entry) => entry.sourceId === "y"), false);
  assert.deepEqual(
    active.map((entry) => [entry.sourceId, entry.classifiedZoneKey]),
    baseline.map((entry) => [entry.sourceId, entry.classifiedZoneKey]),
  );
});

test("Faixa preserva a posição vaga da origem sem shift", () => {
  const faixa = ["x", "y", "z"].map((sourceId, index) => ({
    ...item(sourceId, index + 1),
    sortOrder: index + 1,
    manualOverride: null,
  }));
  const result = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    faixa,
    [],
    {
      headline: "x",
      highlight_1: null,
      highlight_2: null,
      highlight_3: null,
      context: null,
    },
    [],
    true,
    faixa,
    { vacantFaixaSlots: [1] },
  );

  assert.deepEqual(
    result.faixaAfter.map((entry) => [entry.sortOrder, entry.sourceId]),
    [[2, "y"], [3, "z"]],
  );
});

test("cliente e Apply usam o mesmo preview sem regra textual legacy", () => {
  const client = readFileSync(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
    "utf8",
  );
  const route = readFileSync(
    "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
    "utf8",
  );
  const migration = readFileSync(
    "supabase/migrations/20260902141655_matchday_preview_movement_without_cascade.sql",
    "utf8",
  );
  const operations = readFileSync(
    "lib/editorial-matchday-profile-desk-operations.ts",
    "utf8",
  );

  assert.doesNotMatch(client, /trocam diretamente|zona natural|eventual excesso passou/i);
  assert.match(client, /draftDisplacedIdentities/);
  assert.match(client, /draftPlacedOutsideTrackingIdentities/);
  assert.match(client, /!draftPlacedOutsideTrackingIdentities\.has\(itemIdentity\)/);
  assert.match(client, /draftVacantZoneSlots/);
  assert.match(client, /draftVacantFaixaSlots/);
  assert.match(client, /displacedBankItemIds/);
  assert.match(route, /compatibilityReconcile/);
  assert.match(route, /p_authoritative_zone_items/);
  assert.match(route, /p_authoritative_faixa_items/);
  assert.match(route, /rpc\/apply_matchday_editorial_profile_workspace_v11/);
  assert.match(migration, /apply_matchday_live_layout_placement_plan\([\s\S]*true/);
  assert.match(migration, /placement_type in \('selection', 'video_highlight'\)/);
  assert.doesNotMatch(operations, /export function swapMatchdayEditorialItems/u);
});
