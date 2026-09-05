import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkMovePhysicalDeskItemsToZone,
  changePhysicalDeskZone,
  createPhysicalDeskZone,
  createPhysicalDeskState,
  deletePhysicalDeskZone,
  movePhysicalDeskBlock,
  movePhysicalDeskItemToBank,
  movePhysicalDeskItemToDisplaced,
  movePhysicalDeskItemToFaixaTop,
  movePhysicalDeskItemToSlot,
  physicalDeskFaixaSlots,
  physicalDeskHasChanges,
  physicalDeskPlacementForBankItem,
  physicalDeskPlacementsOfType,
  physicalDeskZoneSlots,
  resetPhysicalDeskState,
  undoPhysicalDeskState,
} from "./editorial-matchday-live-layout-desk-state";
import {
  parseLiveLayoutBlockId,
  parseLiveLayoutZoneId,
} from "./editorial-matchday-live-layout-physical";
import type { LiveLayoutWorkspaceState } from "./editorial-matchday-live-layout-workspace";

const MATCHDAY_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-09-04T13:00:00.000Z";

function zoneId(index: number) {
  return parseLiveLayoutZoneId(
    `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

function bankId(index: number) {
  return `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function workspace(zoneCount: number, itemCount = 3): LiveLayoutWorkspaceState {
  const zones = Array.from({ length: zoneCount }, (_, index) => ({
    id: zoneId(index + 1),
    publicTitle: `Zona física ${index + 1}`,
    visualFamily: "six_news" as const,
    capacity: 6,
    sortOrder: index + 2,
    items: [],
  }));
  const blocks = [
    {
      id: parseLiveLayoutBlockId("50000000-0000-4000-8000-000000000001"),
      kind: "latest" as const,
      sortOrder: zoneCount + 2,
    },
    ...zones.map((zone, index) => ({
      id: parseLiveLayoutBlockId(
        `50000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
      ),
      kind: "zone" as const,
      zoneId: zone.id,
      sortOrder: zoneCount - index + 1,
    })),
    {
      id: parseLiveLayoutBlockId(
        `50000000-0000-4000-8000-${String(zoneCount + 2).padStart(12, "0")}`,
      ),
      kind: "video" as const,
      sortOrder: 1,
    },
  ];
  const bankItems = Array.from({ length: itemCount }, (_, index) => ({
    id: bankId(index + 1),
    sourceType: "editorial_article",
    sourceId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    status: "active",
    label: `Item ${index + 1}`,
    title: `Notícia ${index + 1}`,
    subtitle: null,
    imageUrl: null,
    linkUrl: null,
    automaticEligible: true,
    editoriallyWorkedAt: null,
    classification: {
      key: "benfica" as const,
      source: "test",
      classifiedAt: NOW,
    },
    continuitySourceMatchdayId: null,
    continuitySourceCompositionId: null,
    isExplicitBank: false,
  }));
  return {
    matchdayId: MATCHDAY_ID,
    stateToken: "physical-token",
    zones,
    blocks,
    placements: [],
    bankItems,
    memory: [],
    explicitBankItemIds: [],
    displacedBankItemIds: [],
    workedBankItemIds: [],
    workspaceSettings: null,
    physicalCutover: null,
  };
}

function state(zoneCount: number, itemCount = 3) {
  return stateFromWorkspace(workspace(zoneCount, itemCount));
}

function stateFromWorkspace(source: LiveLayoutWorkspaceState) {
  return createPhysicalDeskState(source, {
    headlineTitleColor: null,
    latestZonePlacement: "top",
    latestZoneTitle: "Últimas",
    videoModuleActive: true,
  });
}

function stateWithBaselinePlacement() {
  const source = workspace(2);
  return stateFromWorkspace({
    ...source,
    placements: [{
      id: "60000000-0000-4000-8000-000000000001",
      bankItemId: bankId(1),
      placementType: "zone",
      zoneId: zoneId(1),
      slotPosition: 3,
      createdAt: NOW,
      updatedAt: NOW,
    }],
    bankItems: source.bankItems.map((item) => item.id === bankId(1)
      ? { ...item, editoriallyWorkedAt: NOW }
      : item),
    workedBankItemIds: [bankId(1)],
  });
}

function stateWithBaselineDisplaced() {
  const source = workspace(1);
  return stateFromWorkspace({
    ...source,
    memory: [{
      bankItemId: bankId(1),
      memoryKind: "displaced",
      recordedAt: NOW,
    }],
    bankItems: source.bankItems.map((item) => item.id === bankId(1)
      ? { ...item, editoriallyWorkedAt: NOW }
      : item),
    displacedBankItemIds: [bankId(1)],
    workedBankItemIds: [bankId(1)],
  });
}

test("create gera UUIDs, nasce vazio, entra no fim e fica dirty", () => {
  const initial = state(1);
  const previousMaximumOrder = Math.max(
    ...initial.current.blocks.map((block) => block.sortOrder),
  );
  const created = createPhysicalDeskZone(initial, {
    publicTitle: "  Nova zona física  ",
    visualFamily: "five_news_balanced",
  });
  const createdZone = created.current.zones.find((zone) => (
    !initial.current.zones.some((candidate) => candidate.id === zone.id)
  ));
  assert.ok(createdZone);
  const createdBlock = created.current.blocks.find((block) => (
    block.kind === "zone" && block.zoneId === createdZone.id
  ));
  assert.ok(createdBlock);
  assert.match(createdZone.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
  assert.match(createdBlock.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
  assert.notEqual(createdZone.id, createdBlock.id);
  assert.equal(createdZone.publicTitle, "Nova zona física");
  assert.equal(createdZone.visualFamily, "five_news_balanced");
  assert.equal(createdZone.capacity, 5);
  assert.equal(createdBlock.sortOrder, previousMaximumOrder + 1);
  assert.equal(
    created.current.placements.some((placement) => placement.zoneId === createdZone.id),
    false,
  );
  assert.equal(physicalDeskHasChanges(created), true);
  assert.deepEqual(created.current.bankItems, initial.current.bankItems);
});

test("Undo e Reset removem uma zona acabada de criar", () => {
  const initial = state(1);
  const created = createPhysicalDeskZone(initial, {
    publicTitle: "Nova zona",
    visualFamily: "six_news",
  });
  const undone = undoPhysicalDeskState(created);
  const reset = resetPhysicalDeskState(created);

  assert.deepEqual(undone.current, initial.current);
  assert.equal(physicalDeskHasChanges(undone), false);
  assert.deepEqual(reset.current, initial.baseline);
  assert.equal(physicalDeskHasChanges(reset), false);
});

test("delete de zona vazia remove zona e block sem referências internas", () => {
  const initial = state(2);
  const deleted = deletePhysicalDeskZone(initial, zoneId(2));

  assert.equal(deleted.current.zones.some((zone) => zone.id === zoneId(2)), false);
  assert.equal(deleted.current.blocks.some((block) => (
    block.kind === "zone" && block.zoneId === zoneId(2)
  )), false);
  assert.equal(deleted.current.placements.some((placement) => (
    placement.zoneId === zoneId(2)
  )), false);
  assert.deepEqual(deleted.current.displacedBankItemIds, []);
  assert.equal(physicalDeskHasChanges(deleted), true);
});

test("delete ocupado transforma o item em DESALOJADA, nunca Banco nem NOVA", () => {
  const initial = stateWithBaselinePlacement();
  const deleted = deletePhysicalDeskZone(initial, zoneId(1));

  assert.equal(physicalDeskPlacementForBankItem(deleted, bankId(1)), null);
  assert.deepEqual(deleted.current.displacedBankItemIds, [bankId(1)]);
  assert.deepEqual(deleted.current.displacedArrivalBankItemIds, [bankId(1)]);
  assert.equal(deleted.current.explicitBankItemIds.includes(bankId(1)), false);
  assert.equal(deleted.current.workedBankItemIds.includes(bankId(1)), true);
  assert.deepEqual(deleted.current.memory, [{
    bankItemId: bankId(1),
    memoryKind: "displaced",
    recordedAt: null,
  }]);
  assert.deepEqual(deleted.current.bankItems, initial.current.bankItems);
});

test("mover antes do delete preserva o destino final sobrevivente", () => {
  let current = state(2);
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 1,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "zone", zoneId: zoneId(2), slotPosition: 4,
  });
  current = deletePhysicalDeskZone(current, zoneId(1));

  assert.deepEqual(physicalDeskPlacementForBankItem(current, bankId(1)), {
    bankItemId: bankId(1),
    placementType: "zone",
    zoneId: zoneId(2),
    slotPosition: 4,
  });
  assert.equal(current.current.displacedBankItemIds.includes(bankId(1)), false);
  assert.equal(current.current.displacedArrivalBankItemIds.includes(bankId(1)), false);
});

test("Bank para zona e delete termina em DESALOJADA", () => {
  let current = movePhysicalDeskItemToBank(state(1), bankId(1));
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 2,
  });
  current = deletePhysicalDeskZone(current, zoneId(1));

  assert.deepEqual(current.current.displacedBankItemIds, [bankId(1)]);
  assert.deepEqual(current.current.displacedArrivalBankItemIds, [bankId(1)]);
  assert.equal(current.current.explicitBankItemIds.includes(bankId(1)), false);
  assert.equal(current.current.workedBankItemIds.includes(bankId(1)), true);
});

test("baseline DESALOJADA regressa sem arrival falsa e recupera a memória", () => {
  const initial = stateWithBaselineDisplaced();
  const placed = movePhysicalDeskItemToSlot(initial, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 5,
  });
  const deleted = deletePhysicalDeskZone(placed, zoneId(1));

  assert.deepEqual(deleted.current.displacedBankItemIds, [bankId(1)]);
  assert.deepEqual(deleted.current.displacedArrivalBankItemIds, []);
  assert.deepEqual(deleted.current.memory, [{
    bankItemId: bankId(1),
    memoryKind: "displaced",
    recordedAt: NOW,
  }]);
});

test("Undo delete recupera o draft anterior e Reset recupera o baseline", () => {
  const initial = stateWithBaselineDisplaced();
  const placed = movePhysicalDeskItemToSlot(initial, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 5,
  });
  const deleted = deletePhysicalDeskZone(placed, zoneId(1));
  const undone = undoPhysicalDeskState(deleted);
  const reset = resetPhysicalDeskState(deleted);

  assert.deepEqual(undone.current, placed.current);
  assert.equal(
    physicalDeskPlacementForBankItem(undone, bankId(1))?.slotPosition,
    5,
  );
  assert.deepEqual(reset.current, initial.baseline);
  assert.equal(physicalDeskHasChanges(reset), false);
});

test("aceita cardinalidade física 0, 1, 5, 6 e superior a 6", () => {
  for (const count of [0, 1, 5, 6, 8]) {
    const current = state(count);
    assert.equal(current.current.zones.length, count);
    assert.equal(
      current.current.blocks.filter((block) => block.kind === "zone").length,
      count,
    );
  }
});

test("preserva a ordem arbitrária dos blocks físicos", () => {
  const current = state(3);
  assert.deepEqual(
    current.current.blocks.map((block) => block.kind),
    ["video", "zone", "zone", "zone", "latest"],
  );
  const moved = movePhysicalDeskBlock(current, current.current.blocks[1], "down");
  assert.notDeepEqual(moved.current.blocks, current.current.blocks);
});

test("movimento usa LiveLayoutZoneId e vagas são ausência de placement", () => {
  const initial = state(2);
  const moved = movePhysicalDeskItemToSlot(initial, bankId(1), {
    placementType: "zone",
    zoneId: zoneId(2),
    slotPosition: 3,
  });
  assert.equal(physicalDeskPlacementForBankItem(moved, bankId(1))?.zoneId, zoneId(2));
  assert.equal(physicalDeskZoneSlots(moved, zoneId(2))[1].placement, null);
  assert.equal(physicalDeskZoneSlots(moved, zoneId(2))[2].placement?.bankItemId, bankId(1));
  assert.equal(physicalDeskZoneSlots(moved, zoneId(2))[5].placement, null);
  assert.equal("vacantZoneSlots" in moved.current, false);
});

test("swap físico não compacta nem redistribui", () => {
  let current = state(1);
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 1,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(2), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 4,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 4,
  });
  assert.equal(physicalDeskZoneSlots(current, zoneId(1))[0].placement?.bankItemId, bankId(2));
  assert.equal(physicalDeskZoneSlots(current, zoneId(1))[3].placement?.bankItemId, bankId(1));
  assert.equal(physicalDeskZoneSlots(current, zoneId(1))[1].placement, null);
  assert.equal(physicalDeskZoneSlots(current, zoneId(1))[2].placement, null);
});

test("bulk move mantém buracos e desaloja apenas ocupantes dos destinos", () => {
  let current = state(2);
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 1,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(2), {
    placementType: "zone", zoneId: zoneId(2), slotPosition: 3,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(3), {
    placementType: "zone", zoneId: zoneId(2), slotPosition: 4,
  });
  current = bulkMovePhysicalDeskItemsToZone(
    current,
    [bankId(1), bankId(2)],
    zoneId(2),
    3,
  );
  assert.equal(physicalDeskZoneSlots(current, zoneId(1))[0].placement, null);
  assert.equal(physicalDeskZoneSlots(current, zoneId(2))[2].placement?.bankItemId, bankId(1));
  assert.equal(physicalDeskZoneSlots(current, zoneId(2))[3].placement?.bankItemId, bankId(2));
  assert.deepEqual(current.current.displacedBankItemIds, [bankId(3)]);
});

test("Bank e Desalojadas são estados exclusivos", () => {
  let current = state(1);
  current = movePhysicalDeskItemToBank(current, bankId(1));
  assert.deepEqual(current.current.explicitBankItemIds, [bankId(1)]);
  current = movePhysicalDeskItemToDisplaced(current, bankId(1));
  assert.deepEqual(current.current.explicitBankItemIds, []);
  assert.deepEqual(current.current.displacedBankItemIds, [bankId(1)]);
  assert.deepEqual(current.current.memory, [{
    bankItemId: bankId(1),
    memoryKind: "displaced",
    recordedAt: null,
  }]);
});

test("layout shrink ocupado e título vazio falham fechados", () => {
  let current = state(1);
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 6,
  });
  assert.throws(
    () => changePhysicalDeskZone(current, zoneId(1), { visualFamily: "five_news_balanced" }),
    /zone-layout-shrink-occupied/,
  );
  assert.throws(
    () => changePhysicalDeskZone(current, zoneId(1), { publicTitle: "   " }),
    /zone-public-title-empty/,
  );
});

test("movimentos não alteram a classificação observada", () => {
  const initial = state(1);
  const before = initial.current.bankItems[0].classification;
  const moved = movePhysicalDeskItemToSlot(initial, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 2,
  });
  assert.deepEqual(moved.current.bankItems[0].classification, before);
});

test("undo e reset restauram checkpoints físicos", () => {
  const initial = state(1);
  const first = movePhysicalDeskItemToSlot(initial, bankId(1), {
    placementType: "zone", zoneId: zoneId(1), slotPosition: 2,
  });
  const second = movePhysicalDeskItemToBank(first, bankId(1));
  assert.equal(physicalDeskPlacementForBankItem(undoPhysicalDeskState(second), bankId(1))?.slotPosition, 2);
  const reset = resetPhysicalDeskState(first);
  assert.equal(physicalDeskPlacementForBankItem(reset, bankId(1)), null);
  assert.equal(physicalDeskHasChanges(reset), false);
});

test("Faixa conserva vagas intermédias e finais sem lista paralela", () => {
  let current = state(1);
  current = movePhysicalDeskItemToFaixaTop(current, bankId(1));
  current = movePhysicalDeskItemToFaixaTop(current, bankId(2));
  current = movePhysicalDeskItemToFaixaTop(current, bankId(3));
  current = movePhysicalDeskItemToBank(current, bankId(2));

  assert.equal(physicalDeskFaixaSlots(current)[1].placement, null);
  assert.equal(physicalDeskFaixaSlots(current)[2].placement?.bankItemId, bankId(1));

  current = movePhysicalDeskItemToBank(current, bankId(1));
  assert.equal(physicalDeskFaixaSlots(current)[2].placement, null);
  assert.equal("vacantFaixaSlots" in current.current, false);
});

test("settings físicos preservam vaga final da Faixa no reload model", () => {
  const source = workspace(1);
  const physicalWorkspace: LiveLayoutWorkspaceState = {
    ...source,
    placements: [{
      id: "60000000-0000-4000-8000-000000000001",
      bankItemId: bankId(1),
      placementType: "faixa",
      zoneId: null,
      slotPosition: 1,
      createdAt: NOW,
      updatedAt: NOW,
    }],
    workspaceSettings: {
      matchdayId: MATCHDAY_ID,
      faixaSlotCount: 4,
      headlineTitleColor: "#112233",
      latestZoneMode: "editorial_line",
      latestZonePlacement: "hidden",
      latestZoneTitle: "Estado físico",
      latestZoneTitleColor: "#AABBCC",
      videoModuleActive: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
    physicalCutover: {
      matchdayId: MATCHDAY_ID,
      profileKey: "liga_portugal_v1",
      cutoverAt: NOW,
    },
  };
  const current = createPhysicalDeskState(physicalWorkspace, {
    headlineTitleColor: null,
    latestZonePlacement: "top",
    latestZoneTitle: "Legacy ignorado",
    videoModuleActive: true,
  });

  assert.equal(current.current.faixaSlotCount, 4);
  assert.equal(physicalWorkspace.workspaceSettings?.latestZoneMode, "editorial_line");
  assert.equal(physicalWorkspace.workspaceSettings?.latestZoneTitleColor, "#AABBCC");
  assert.equal(physicalDeskFaixaSlots(current)[3].placement, null);
  assert.deepEqual(current.current.presentation, {
    headlineTitleColor: "#112233",
    latestZonePlacement: "hidden",
    latestZoneTitle: "Estado físico",
    videoModuleActive: false,
  });
  assert.equal("latestZoneMode" in current.current.presentation, false);
  assert.equal("latestZoneTitleColor" in current.current.presentation, false);
  assert.equal(current.physicalCutover?.profileKey, "liga_portugal_v1");
});

test("Abertura, Faixa, Seleção e Destaque partilham a autoridade de placements", () => {
  let current = state(1, 5);
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "opening", zoneId: null, slotPosition: 1,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(2), {
    placementType: "opening", zoneId: null, slotPosition: 2,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(1), {
    placementType: "opening", zoneId: null, slotPosition: 2,
  });
  current = movePhysicalDeskItemToFaixaTop(current, bankId(3));
  current = movePhysicalDeskItemToSlot(current, bankId(4), {
    placementType: "selection", zoneId: null, slotPosition: 4,
  });
  current = movePhysicalDeskItemToSlot(current, bankId(5), {
    placementType: "video_highlight", zoneId: null, slotPosition: 1,
  });

  assert.deepEqual(
    physicalDeskPlacementsOfType(current, "opening").map((item) => [
      item.bankItemId,
      item.slotPosition,
    ]),
    [[bankId(2), 1], [bankId(1), 2]],
  );
  assert.equal(physicalDeskPlacementsOfType(current, "faixa")[0].bankItemId, bankId(3));
  assert.equal(physicalDeskPlacementsOfType(current, "selection")[0].slotPosition, 4);
  assert.equal(physicalDeskPlacementsOfType(current, "video_highlight")[0].bankItemId, bankId(5));
});
