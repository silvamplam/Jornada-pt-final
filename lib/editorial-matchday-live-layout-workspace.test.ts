import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveLayoutWorkspaceState,
  type MatchdayLiveLayoutWorkspaceReaderRow,
} from "@/lib/editorial-matchday-live-layout-workspace";

const MATCHDAY_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-09-04T12:00:00.000Z";

function uuid(prefix: number, index: number): string {
  return `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function zone(index: number, title = `Zona ${index + 1}`) {
  return {
    id: uuid(20, index + 1),
    matchday_id: MATCHDAY_ID,
    public_title: title,
    visual_family: index % 3 === 0
      ? "six_news"
      : index % 3 === 1
        ? "five_news_balanced"
        : "five_news_secondary",
  };
}

function block(zoneIndex: number, sortOrder = zoneIndex + 1) {
  return {
    id: uuid(30, zoneIndex + 1),
    matchday_id: MATCHDAY_ID,
    block_type: "zone",
    zone_id: uuid(20, zoneIndex + 1),
    sort_order: sortOrder,
  };
}

function bankItem(
  index: number,
  options: Readonly<{
    explicitBank?: boolean;
    worked?: boolean;
    classificationKey?: string | null;
  }> = {},
) {
  const classificationKey = options.classificationKey === undefined
    ? "benfica"
    : options.classificationKey;
  return {
    id: uuid(40, index + 1),
    matchday_id: MATCHDAY_ID,
    source_type: "editorial_article",
    source_id: uuid(50, index + 1),
    status: "active",
    label: "Noticia",
    title: `Artigo ${index + 1}`,
    subtitle: null,
    image_url: null,
    link_url: `/artigo-${index + 1}`,
    automatic_eligible: true,
    editorially_worked_at: options.worked ? NOW : null,
    classification_key: classificationKey,
    classification_source: classificationKey === null ? null : "manual",
    classified_at: classificationKey === null ? null : NOW,
    continuity_source_matchday_id: null,
    continuity_source_composition_id: null,
    is_explicit_bank: options.explicitBank ?? false,
  };
}

function placement(
  index: number,
  placementType: "opening" | "faixa" | "selection" | "video_highlight" | "zone",
  slotPosition: number,
  zoneIndex: number | null = null,
) {
  return {
    id: uuid(60, index + 1),
    matchday_id: MATCHDAY_ID,
    bank_item_id: uuid(40, index + 1),
    placement_type: placementType,
    zone_id: zoneIndex === null ? null : uuid(20, zoneIndex + 1),
    slot_position: slotPosition,
    created_at: NOW,
    updated_at: NOW,
  };
}

function readerRow(
  zoneCount: number,
  overrides: Partial<MatchdayLiveLayoutWorkspaceReaderRow> = {},
): MatchdayLiveLayoutWorkspaceReaderRow {
  return {
    state_token: "physical-token-v13",
    zones: Array.from({ length: zoneCount }, (_, index) => zone(index)),
    blocks: Array.from({ length: zoneCount }, (_, index) => block(index)),
    placements: [],
    bank_items: [],
    state_memory: [],
    explicit_bank_item_ids: [],
    displaced_bank_item_ids: [],
    worked_bank_item_ids: [],
    legacy_zone_projection: [],
    ...overrides,
  };
}

test("workspace fisico aceita zero, uma, cinco, seis e mais de seis zonas", () => {
  for (const zoneCount of [0, 1, 5, 6, 8]) {
    const state = buildLiveLayoutWorkspaceState(
      MATCHDAY_ID,
      readerRow(zoneCount),
    );
    assert.equal(state.zones.length, zoneCount);
    assert.equal(state.blocks.length, zoneCount);
  }
});

test("ordem vertical vem exclusivamente dos blocks e pode ser arbitraria", () => {
  const state = buildLiveLayoutWorkspaceState(MATCHDAY_ID, readerRow(3, {
    blocks: [block(0, 30), block(1, 10), block(2, 20)],
  }));

  assert.deepEqual(
    state.blocks.map((current) => current.kind === "zone" ? current.zoneId : current.kind),
    [uuid(20, 2), uuid(20, 3), uuid(20, 1)],
  );
  assert.deepEqual(state.zones.map((current) => current.sortOrder), [10, 20, 30]);
});

test("vagas intermédias e finais permanecem ausencias sem compactacao", () => {
  const items = [bankItem(0), bankItem(1)];
  const state = buildLiveLayoutWorkspaceState(MATCHDAY_ID, readerRow(1, {
    bank_items: items,
    placements: [placement(0, "zone", 2, 0), placement(1, "zone", 5, 0)],
  }));

  assert.equal(state.zones[0].capacity, 6);
  assert.deepEqual(state.zones[0].items.map((item) => item.slotPosition), [2, 5]);
  assert.deepEqual(state.placements.map((item) => item.slotPosition), [2, 5]);
});

test("workspace observa todos os placements, Bank, Desalojadas, worked e memory", () => {
  const banks = [
    bankItem(0),
    bankItem(1),
    bankItem(2),
    bankItem(3),
    bankItem(4, { worked: true, classificationKey: "sporting" }),
    bankItem(5, { explicitBank: true }),
    bankItem(6),
    bankItem(7),
  ];
  const memory = [
    {
      matchday_id: MATCHDAY_ID,
      bank_item_id: uuid(40, 7),
      memory_kind: "displaced",
      recorded_at: NOW,
    },
    {
      matchday_id: MATCHDAY_ID,
      bank_item_id: uuid(40, 8),
      memory_kind: "legacy_unknown",
      recorded_at: NOW,
    },
  ];
  const state = buildLiveLayoutWorkspaceState(MATCHDAY_ID, readerRow(1, {
    bank_items: banks,
    placements: [
      placement(0, "opening", 1),
      placement(1, "faixa", 1),
      placement(2, "selection", 4),
      placement(3, "video_highlight", 1),
      placement(4, "zone", 3, 0),
    ],
    state_memory: memory,
    explicit_bank_item_ids: [uuid(40, 6)],
    displaced_bank_item_ids: [uuid(40, 7)],
    worked_bank_item_ids: [uuid(40, 5)],
  }));

  assert.deepEqual(
    state.placements.map((current) => current.placementType).sort(),
    ["faixa", "opening", "selection", "video_highlight", "zone"],
  );
  assert.deepEqual(state.explicitBankItemIds, [uuid(40, 6)]);
  assert.deepEqual(state.displacedBankItemIds, [uuid(40, 7)]);
  assert.deepEqual(state.workedBankItemIds, [uuid(40, 5)]);
  assert.deepEqual(state.memory.map((current) => current.memoryKind), [
    "displaced",
    "legacy_unknown",
  ]);
  assert.equal(state.bankItems[4].classification?.key, "sporting");
  assert.equal(state.zones[0].items[0].zoneId, uuid(20, 1));
  assert.notEqual(state.zones[0].items[0].zoneId, "sporting");
});

test("zona fisica adicional nunca e descartada", () => {
  const state = buildLiveLayoutWorkspaceState(MATCHDAY_ID, readerRow(7));
  assert.deepEqual(
    state.zones.map((current) => current.id),
    Array.from({ length: 7 }, (_, index) => uuid(20, index + 1)),
  );
});

test("titulo fisico vazio e erro explicito sem fallback", () => {
  assert.throws(
    () => buildLiveLayoutWorkspaceState(MATCHDAY_ID, readerRow(1, {
      zones: [zone(0, "   ")],
    })),
    /matchday-live-layout-physical-zone-public-title-invalid/,
  );
});

test("classification e apenas observada e estados redundantes falham fechado", () => {
  const invalidClassification = readerRow(0, {
    bank_items: [bankItem(0, { classificationKey: "not-a-classification" })],
  });
  assert.throws(
    () => buildLiveLayoutWorkspaceState(MATCHDAY_ID, invalidClassification),
    /matchday-live-layout-workspace-bank-item-classification-key-invalid/,
  );

  const inconsistentWorked = readerRow(0, {
    bank_items: [bankItem(0, { worked: true })],
    worked_bank_item_ids: [],
  });
  assert.throws(
    () => buildLiveLayoutWorkspaceState(MATCHDAY_ID, inconsistentWorked),
    /matchday-live-layout-workspace-worked-state-inconsistent/,
  );
});
