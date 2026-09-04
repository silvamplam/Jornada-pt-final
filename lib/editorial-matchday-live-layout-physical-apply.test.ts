import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkMovePhysicalDeskItemsToFaixa,
  changePhysicalDeskPresentation,
  createPhysicalDeskState,
  movePhysicalDeskItemToDisplaced,
  movePhysicalDeskItemToSlot,
} from "./editorial-matchday-live-layout-desk-state";
import {
  buildPhysicalDeskApplyPayload,
  parsePhysicalDeskApplyPayload,
  physicalDeskApplyRpcArguments,
} from "./editorial-matchday-live-layout-physical-apply";
import {
  parseLiveLayoutBlockId,
  parseLiveLayoutZoneId,
} from "./editorial-matchday-live-layout-physical";
import type { LiveLayoutWorkspaceState } from "./editorial-matchday-live-layout-workspace";

const MATCHDAY_ID = "10000000-0000-4000-8000-000000000001";
const TOKEN = "0123456789abcdef0123456789abcdef";
const NOW = "2026-09-04T15:00:00.000Z";

function id(prefix: number, index: number): string {
  return `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function workspace(zoneCount: number, itemCount = 12): LiveLayoutWorkspaceState {
  const zones = Array.from({ length: zoneCount }, (_, index) => ({
    id: parseLiveLayoutZoneId(id(20, index + 1)),
    publicTitle: `Zona física ${index + 1}`,
    visualFamily: "six_news" as const,
    capacity: 6,
    sortOrder: index + 1,
    items: [],
  }));
  const blocks = [
    ...zones.map((zone, index) => ({
      id: parseLiveLayoutBlockId(id(30, index + 1)),
      kind: "zone" as const,
      zoneId: zone.id,
      sortOrder: index + 1,
    })),
    {
      id: parseLiveLayoutBlockId(id(30, zoneCount + 1)),
      kind: "latest" as const,
      sortOrder: zoneCount + 1,
    },
    {
      id: parseLiveLayoutBlockId(id(30, zoneCount + 2)),
      kind: "video" as const,
      sortOrder: zoneCount + 2,
    },
  ];
  const bankItems = Array.from({ length: itemCount }, (_, index) => ({
    id: id(40, index + 1),
    sourceType: "editorial_article",
    sourceId: id(50, index + 1),
    status: "active",
    label: null,
    title: `Artigo ${index + 1}`,
    subtitle: null,
    imageUrl: null,
    linkUrl: null,
    automaticEligible: true,
    editoriallyWorkedAt: index === 8 ? NOW : null,
    classification: {
      key: index % 2 === 0 ? "benfica" as const : "sporting" as const,
      source: "test",
      classifiedAt: NOW,
    },
    continuitySourceMatchdayId: null,
    continuitySourceCompositionId: null,
    isExplicitBank: index === 9,
  }));
  const placements = zoneCount === 0 ? [] : [
    { id: id(60, 1), bankItemId: id(40, 1), placementType: "faixa" as const, zoneId: null, slotPosition: 1, createdAt: NOW, updatedAt: NOW },
    { id: id(60, 2), bankItemId: id(40, 2), placementType: "zone" as const, zoneId: zones[0].id, slotPosition: 2, createdAt: NOW, updatedAt: NOW },
    { id: id(60, 3), bankItemId: id(40, 3), placementType: "opening" as const, zoneId: null, slotPosition: 1, createdAt: NOW, updatedAt: NOW },
    { id: id(60, 4), bankItemId: id(40, 4), placementType: "selection" as const, zoneId: null, slotPosition: 4, createdAt: NOW, updatedAt: NOW },
    { id: id(60, 5), bankItemId: id(40, 5), placementType: "video_highlight" as const, zoneId: null, slotPosition: 1, createdAt: NOW, updatedAt: NOW },
  ];
  return {
    matchdayId: MATCHDAY_ID,
    stateToken: TOKEN,
    zones,
    blocks,
    placements,
    bankItems,
    memory: [{ bankItemId: id(40, 11), memoryKind: "displaced", recordedAt: NOW }],
    explicitBankItemIds: [id(40, 10)],
    displacedBankItemIds: [id(40, 11)],
    workedBankItemIds: [id(40, 9)],
    workspaceSettings: {
      matchdayId: MATCHDAY_ID,
      faixaSlotCount: 4,
      headlineTitleColor: "#AABBCC",
      latestZonePlacement: "four_news",
      latestZoneTitle: "Últimas",
      videoModuleActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    physicalCutover: {
      matchdayId: MATCHDAY_ID,
      profileKey: "liga_portugal_v1",
      cutoverAt: NOW,
    },
  };
}

test("serializer usa token físico e conserva IDs reais de zonas e blocks", () => {
  for (const zoneCount of [5, 6, 7, 9]) {
    const state = createPhysicalDeskState(workspace(zoneCount));
    const payload = buildPhysicalDeskApplyPayload("liga_portugal_v1", state);
    assert.equal(payload.expectedPhysicalStateToken, TOKEN);
    assert.deepEqual(payload.zones.map((zone) => zone.id), state.current.zones.map((zone) => zone.id));
    assert.deepEqual(payload.blocks.map((block) => block.id), state.current.blocks.map((block) => block.id));
    assert.equal(payload.zones.length, zoneCount);
    assert.doesNotMatch(JSON.stringify(payload), /zoneKey|classification/i);
  }
});

test("serializer transporta todos os placements sem compactar Faixa esparsa", () => {
  let state = createPhysicalDeskState(workspace(7));
  state = movePhysicalDeskItemToSlot(state, id(40, 6), {
    placementType: "faixa",
    zoneId: null,
    slotPosition: 3,
  });
  const payload = buildPhysicalDeskApplyPayload("liga_portugal_v1", state);
  assert.equal(payload.placements.length, state.current.placements.length);
  assert.deepEqual(
    new Set(payload.placements.map((placement) => placement.placementType)),
    new Set(["zone", "faixa", "opening", "selection", "video_highlight"]),
  );
  assert.equal(payload.faixaSlotCount, 4);
  assert.deepEqual(
    payload.placements.filter((placement) => placement.placementType === "faixa").map((placement) => placement.slotPosition),
    [1, 3],
  );
  assert.deepEqual(payload.explicitBankItemIds, [id(40, 10)]);
  assert.deepEqual(payload.displacedBankItemIds, [id(40, 11)]);
  assert.deepEqual(payload.workedBankItemIds, [id(40, 6), id(40, 9)]);
  assert.deepEqual(payload.presentation, {
    headline_title_color: "#AABBCC",
    latest_zone_placement: "four_news",
    latest_zone_title: "Últimas",
    video_module_active: true,
  });
});

test("arrivals são deltas baseline-relative e preservam a ordem editorial", () => {
  let state = createPhysicalDeskState(workspace(5));
  state = bulkMovePhysicalDeskItemsToFaixa(
    state,
    [id(40, 1), id(40, 6)],
    1,
  );
  state = movePhysicalDeskItemToDisplaced(state, id(40, 7));
  state = movePhysicalDeskItemToDisplaced(state, id(40, 8));
  const payload = buildPhysicalDeskApplyPayload("liga_portugal_v1", state);
  assert.deepEqual(payload.faixaArrivalBankItemIds, [id(40, 6)]);
  assert.deepEqual(
    payload.displacedArrivalBankItemIds,
    [id(40, 8), id(40, 7)],
  );
});

test("artigo que sai e regressa exatamente ao baseline não é arrival", () => {
  let state = createPhysicalDeskState(workspace(5));
  const baselineZone = state.current.zones[0].id;
  state = movePhysicalDeskItemToSlot(state, id(40, 2), {
    placementType: "faixa",
    zoneId: null,
    slotPosition: 3,
  });
  state = movePhysicalDeskItemToSlot(state, id(40, 2), {
    placementType: "zone",
    zoneId: baselineZone,
    slotPosition: 2,
  });
  const payload = buildPhysicalDeskApplyPayload("liga_portugal_v1", state);
  assert.deepEqual(payload.faixaArrivalBankItemIds, []);
});

test("serializer rejeita arrival novo sem relógio local em vez de inventar ordem", () => {
  const state = createPhysicalDeskState(workspace(5));
  const invalid = {
    ...state,
    current: {
      ...state.current,
      placements: [...state.current.placements, {
        bankItemId: id(40, 6),
        placementType: "faixa" as const,
        zoneId: null,
        slotPosition: 3,
      }],
      faixaArrivalBankItemIds: [],
    },
  };
  assert.throws(
    () => buildPhysicalDeskApplyPayload("liga_portugal_v1", invalid),
    /faixa-arrivals-incomplete/,
  );
});

test("Vídeo local inativo com highlight falha sem apagar o placement", () => {
  const state = changePhysicalDeskPresentation(
    createPhysicalDeskState(workspace(5)),
    { videoModuleActive: false },
  );
  assert.throws(
    () => buildPhysicalDeskApplyPayload("liga_portugal_v1", state),
    /video-highlight-inactive/,
  );
  assert.equal(
    state.current.placements.some((placement) => placement.placementType === "video_highlight"),
    true,
  );
});

test("parser físico recusa campos legacy e RPC faz apenas tradução de casing", () => {
  const payload = buildPhysicalDeskApplyPayload(
    "liga_portugal_v1",
    createPhysicalDeskState(workspace(6)),
  );
  assert.throws(
    () => parsePhysicalDeskApplyPayload({ ...payload, expectedRevision: 4 }),
    /payload-shape-invalid/,
  );
  assert.throws(
    () => parsePhysicalDeskApplyPayload({
      ...payload,
      expectedPhysicalStateToken: ` ${TOKEN} `,
    }),
    /state-token-invalid/,
  );
  const rpc = physicalDeskApplyRpcArguments(MATCHDAY_ID, payload);
  assert.equal(rpc.p_expected_physical_state_token, TOKEN);
  assert.deepEqual(rpc.p_zones[0], {
    id: id(20, 1),
    public_title: "Zona física 1",
    visual_family: "six_news",
  });
  assert.deepEqual(rpc.p_blocks[0], {
    id: id(30, 1),
    block_type: "zone",
    zone_id: id(20, 1),
    sort_order: 1,
  });
  assert.equal("p_expected_revision" in rpc, false);
  assert.equal("p_expected_state_token" in rpc, false);
  assert.equal("p_vacant_zone_slots" in rpc, false);
});
