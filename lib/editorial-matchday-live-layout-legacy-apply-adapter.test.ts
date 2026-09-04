import assert from "node:assert/strict";
import test from "node:test";

import { EDITORIAL_PROFILES } from "./editorial-profiles";
import {
  buildLiveLayoutLegacyCompatibility,
  type LiveLayoutLegacyCompatibility,
} from "./editorial-matchday-live-layout-compatibility-adapter";
import {
  createPhysicalDeskState,
  movePhysicalDeskItemToSlot,
} from "./editorial-matchday-live-layout-desk-state";
import {
  buildPhysicalDeskLegacyApplyProjection,
  physicalDeskLegacyApplyBlockReason,
  type PhysicalDeskLegacyApplyBaseline,
} from "./editorial-matchday-live-layout-legacy-apply-adapter";
import { parseLiveLayoutZoneId } from "./editorial-matchday-live-layout-physical";
import type { LiveLayoutWorkspaceState } from "./editorial-matchday-live-layout-workspace";

const MATCHDAY_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-09-04T13:00:00.000Z";
const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function zoneId(index: number) {
  return parseLiveLayoutZoneId(
    `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

function bankId(index: number) {
  return `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function sourceId(index: number) {
  return `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function workspace(zoneCount = 5): LiveLayoutWorkspaceState {
  const zones = Array.from({ length: zoneCount }, (_, index) => ({
    id: zoneId(index + 1),
    publicTitle: index < profile.zones.length
      ? `Título físico independente ${index + 1}`
      : `Zona adicional ${index + 1}`,
    visualFamily: "six_news" as const,
    capacity: 6,
    sortOrder: index + 1,
    items: [],
  }));
  const bankItems = Array.from({ length: 7 }, (_, index) => ({
    id: bankId(index + 1),
    sourceType: "editorial_article",
    sourceId: sourceId(index + 1),
    status: "active",
    label: `Item ${index + 1}`,
    title: `Notícia ${index + 1}`,
    subtitle: null,
    imageUrl: null,
    linkUrl: null,
    automaticEligible: true,
    editoriallyWorkedAt: index === 0 ? NOW : null,
    classification: {
      key: "benfica" as const,
      source: "test",
      classifiedAt: NOW,
    },
    continuitySourceMatchdayId: null,
    continuitySourceCompositionId: null,
    isExplicitBank: index === 5,
  }));
  return {
    matchdayId: MATCHDAY_ID,
    stateToken: "physical-token-v13",
    zones,
    blocks: [
      { kind: "video", sortOrder: 1 },
      { kind: "zone", zoneId: zoneId(2), sortOrder: 2 },
      { kind: "latest", sortOrder: 3 },
      ...zones.filter((zone) => zone.id !== zoneId(2)).map((zone, index) => ({
        kind: "zone" as const,
        zoneId: zone.id,
        sortOrder: index + 4,
      })),
    ],
    placements: [
      { id: "50000000-0000-4000-8000-000000000001", bankItemId: bankId(1), placementType: "zone", zoneId: zoneId(1), slotPosition: 2, createdAt: NOW, updatedAt: NOW },
      { id: "50000000-0000-4000-8000-000000000002", bankItemId: bankId(2), placementType: "faixa", zoneId: null, slotPosition: 1, createdAt: NOW, updatedAt: NOW },
      { id: "50000000-0000-4000-8000-000000000003", bankItemId: bankId(3), placementType: "opening", zoneId: null, slotPosition: 1, createdAt: NOW, updatedAt: NOW },
      { id: "50000000-0000-4000-8000-000000000004", bankItemId: bankId(4), placementType: "selection", zoneId: null, slotPosition: 1, createdAt: NOW, updatedAt: NOW },
      { id: "50000000-0000-4000-8000-000000000005", bankItemId: bankId(5), placementType: "video_highlight", zoneId: null, slotPosition: 1, createdAt: NOW, updatedAt: NOW },
    ],
    bankItems,
    memory: [{ bankItemId: bankId(7), memoryKind: "displaced", recordedAt: NOW }],
    explicitBankItemIds: [bankId(6)],
    displacedBankItemIds: [bankId(7)],
    workedBankItemIds: [bankId(1)],
  };
}

function compatibility(stateWorkspace: LiveLayoutWorkspaceState) {
  return buildLiveLayoutLegacyCompatibility(
    MATCHDAY_ID,
    stateWorkspace.zones,
    profile.zones.map((zone, index) => ({
      matchday_id: MATCHDAY_ID,
      legacy_zone_key: zone.key,
      zone_id: zoneId(index + 1),
    })),
  );
}

function effectiveItem(index: number, sortOrder: number | null) {
  return {
    sourceType: "editorial_article",
    sourceId: sourceId(index),
    sortOrder,
    label: `Item ${index}`,
    title: `Notícia ${index}`,
    subtitle: null,
    imageUrl: null,
    publishedAt: NOW,
    updatedAt: NOW,
    isNew: false,
    circuitOrder: index,
    classifiedZoneKey: "benfica" as const,
    manualOverride: null,
  };
}

function baseline(applied = true): PhysicalDeskLegacyApplyBaseline {
  const activeItems = Array.from({ length: 7 }, (_, index) => effectiveItem(index + 1, index + 1));
  return {
    matchdayId: MATCHDAY_ID,
    profileKey: "liga_portugal_v1",
    reconcileRevision: 11,
    reconcileStateToken: "legacy-token",
    manualOverrides: [{
      sourceType: "editorial_article",
      sourceId: sourceId(6),
      placementTarget: "bank",
      zoneKey: null,
      sortOrder: null,
    }],
    automaticDistribution: {
      zones: [],
      overflow: [],
      activeItems,
      diagnostics: [],
      inactiveHistoricalCount: 0,
    },
    appliedZoneItems: applied ? [{
      sourceType: "editorial_article",
      sourceId: sourceId(1),
      zoneKey: "benfica",
      sortOrder: 2,
    }] : [],
    hasAppliedSnapshot: true,
    currentFaixa: [{ ...effectiveItem(2, 1), manualOverride: null, sortOrder: 1 }],
    selectionCandidates: Array.from({ length: 7 }, (_, index) => ({
      bankItemId: bankId(index + 1),
      sourceType: "editorial_article",
      sourceId: sourceId(index + 1),
      label: `Item ${index + 1}`,
      title: `Notícia ${index + 1}`,
      subtitle: null,
      imageUrl: null,
      linkUrl: null,
    })),
  };
}

function stateFor(stateWorkspace: LiveLayoutWorkspaceState) {
  return createPhysicalDeskState(stateWorkspace, {
    headlineTitleColor: null,
    latestZonePlacement: "top",
    latestZoneTitle: "Últimas",
    videoModuleActive: true,
  });
}

test("projection perfeita de cinco zonas permite round-trip exato de todas as superfícies", () => {
  const source = workspace();
  const state = stateFor(source);
  const projection = buildPhysicalDeskLegacyApplyProjection(
    state,
    baseline(),
    compatibility(source),
  );
  assert.equal(projection.expectedStateToken, "legacy-token");
  assert.equal(state.physicalStateToken, "physical-token-v13");
  assert.equal(projection.opening.headline, sourceId(3));
  assert.equal(projection.selectionBankItemIds[0], bankId(4));
  assert.equal(projection.videoModule.highlightAction, "preserve");
  assert.deepEqual(projection.displacedBankItemIds, [bankId(7)]);
  assert.ok(projection.vacantZoneSlots.some((slot) => (
    slot.zoneKey === "benfica" && slot.slotPosition === 1
  )));
  assert.ok(projection.overrides.some((override) => override.placementTarget === "bank"));
});

test("títulos, ordem e visual family nunca são usados para inferir mapping", () => {
  const source = workspace();
  const state = stateFor(source);
  const projection = buildPhysicalDeskLegacyApplyProjection(
    state,
    baseline(),
    compatibility(source),
  );
  assert.equal(
    projection.pageControls.thematicZoneTitles.benfica,
    "Título físico independente 1",
  );
  assert.equal(projection.pageControls.thematicBlockOrder[0], "video");
  assert.equal(projection.pageControls.thematicBlockOrder[1], "sporting");
});

test("sexta zona e notLegacyRepresentable bloqueiam globalmente o Apply", () => {
  const source = workspace(6);
  const state = stateFor(source);
  const currentCompatibility = compatibility(source);
  assert.equal(currentCompatibility.compatibility, "notLegacyRepresentable");
  assert.match(
    physicalDeskLegacyApplyBlockReason(state, currentCompatibility) ?? "",
    /not-legacy-representable/,
  );
  assert.throws(
    () => buildPhysicalDeskLegacyApplyProjection(state, baseline(), currentCompatibility),
    /not-legacy-representable/,
  );
  assert.equal(state.current.zones.length, 6);
});

test("mapping inválido falha sem fallback", () => {
  const source = workspace();
  const state = stateFor(source);
  const invalid: LiveLayoutLegacyCompatibility = {
    compatibility: "representable",
    projection: [],
    additionalPhysicalZoneIds: [],
  };
  assert.match(
    physicalDeskLegacyApplyBlockReason(state, invalid) ?? "",
    /projection-cardinality-mismatch/,
  );
});

test("qualquer divergência no round-trip bloqueia o Apply", () => {
  const source = workspace();
  const state = stateFor(source);
  assert.throws(
    () => buildPhysicalDeskLegacyApplyProjection(
      state,
      baseline(false),
      compatibility(source),
    ),
    /round-trip-zone-diverged/,
  );
});

test("vagas da Faixa são projetadas por ausência de placement", () => {
  const source = workspace();
  const moved = movePhysicalDeskItemToSlot(stateFor(source), bankId(2), {
    placementType: "zone",
    zoneId: zoneId(1),
    slotPosition: 1,
  });
  const projection = buildPhysicalDeskLegacyApplyProjection(
    moved,
    baseline(),
    compatibility(source),
  );

  assert.deepEqual(projection.vacantFaixaSlots, [1]);
});

test("projection de outra Jornada falha fechada", () => {
  const source = workspace();
  const valid = compatibility(source);
  const invalid: LiveLayoutLegacyCompatibility = {
    ...valid,
    projection: valid.projection.map((row) => ({
      ...row,
      matchdayId: "10000000-0000-4000-8000-000000000099",
    })),
  };

  assert.match(
    physicalDeskLegacyApplyBlockReason(stateFor(source), invalid) ?? "",
    /projection-matchday-mismatch/,
  );
});

test("projection duplicada falha fechada sem inferência", () => {
  const source = workspace();
  const valid = compatibility(source);
  const invalid: LiveLayoutLegacyCompatibility = {
    ...valid,
    projection: valid.projection.map((row, index) => (
      index === 1 ? { ...row, zoneId: valid.projection[0].zoneId } : row
    )),
  };

  assert.match(
    physicalDeskLegacyApplyBlockReason(stateFor(source), invalid) ?? "",
    /projection-zone-duplicate/,
  );
});
