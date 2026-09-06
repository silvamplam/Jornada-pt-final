import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchdayLiveLayoutPhysicalSnapshot,
  parseLiveLayoutZoneId,
  type MatchdayLiveLayoutPlacementProjectionRow,
} from "@/lib/editorial-matchday-live-layout-physical";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import { editorialVisualFamilyCapacity } from "@/lib/editorial-visual-families";

const MATCHDAY_ID = "00000000-0000-4000-8000-000000000100";
const OTHER_MATCHDAY_ID = "00000000-0000-4000-8000-000000000101";
const ZONE_IDS = Array.from({ length: 7 }, (_, index) => (
  `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`
));

function blockId(index: number) {
  return `00000000-0000-4000-a000-${String(index).padStart(12, "0")}`;
}

function zoneRow(index: number, matchdayId = MATCHDAY_ID) {
  const templateZone = EDITORIAL_PROFILES.liga_portugal_v1.zones[
    index % EDITORIAL_PROFILES.liga_portugal_v1.zones.length
  ];
  return {
    id: ZONE_IDS[index],
    matchday_id: matchdayId,
    public_title: index < 5 ? templateZone.label : `Zona física ${index + 1}`,
    visual_family: templateZone.visualFamily,
  };
}

function zoneBlock(index: number, sortOrder = index + 1, matchdayId = MATCHDAY_ID) {
  return {
    id: blockId(index + 1),
    matchday_id: matchdayId,
    block_type: "zone",
    zone_id: ZONE_IDS[index],
    sort_order: sortOrder,
  };
}

function placement(
  bankItemId: string,
  sourceId: string,
  zoneId: string,
  slotPosition: number,
  classificationKey = "benfica",
): MatchdayLiveLayoutPlacementProjectionRow {
  return {
    bank_item_id: bankItemId,
    source_type: "editorial_article",
    source_id: sourceId,
    classification_key: classificationKey,
    placement_count: 1,
    placement_type: "zone",
    zone_id: zoneId,
    slot_position: slotPosition,
  };
}

test("as cinco zonas atuais são representadas pelo snapshot físico", () => {
  const zones = Array.from({ length: 5 }, (_, index) => zoneRow(index));
  const blocks = [
    ...Array.from({ length: 5 }, (_, index) => zoneBlock(index)),
    {
      id: blockId(10),
      matchday_id: MATCHDAY_ID,
      block_type: "latest",
      zone_id: null,
      sort_order: 6,
    },
    {
      id: blockId(11),
      matchday_id: MATCHDAY_ID,
      block_type: "video",
      zone_id: null,
      sort_order: 7,
    },
  ];

  const snapshot = buildMatchdayLiveLayoutPhysicalSnapshot(
    MATCHDAY_ID,
    zones,
    blocks,
    [],
  );

  assert.equal(snapshot.zones.length, 5);
  assert.deepEqual(
    snapshot.zones.map((zone) => zone.publicTitle),
    EDITORIAL_PROFILES.liga_portugal_v1.zones.map((zone) => zone.label),
  );
  assert.deepEqual(snapshot.zones.map((zone) => zone.sortOrder), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    snapshot.zones.map((zone) => zone.capacity),
    EDITORIAL_PROFILES.liga_portugal_v1.zones.map((zone) => (
      editorialVisualFamilyCapacity(zone.visualFamily)
    )),
  );
});

test("uma sexta zona sem legacy_zone_key é aceite sem cardinalidade fixa", () => {
  const zones = Array.from({ length: 6 }, (_, index) => zoneRow(index));
  const blocks = Array.from({ length: 6 }, (_, index) => zoneBlock(index));

  const snapshot = buildMatchdayLiveLayoutPhysicalSnapshot(
    MATCHDAY_ID,
    zones,
    blocks,
    [],
  );

  assert.equal(snapshot.zones.length, 6);
  assert.equal(snapshot.zones[5].id, parseLiveLayoutZoneId(ZONE_IDS[5]));
  assert.equal(snapshot.zones[5].publicTitle, "Zona física 6");
});

test("four_news é uma zona física normal com capacidade 4", () => {
  const zone = {
    ...zoneRow(5),
    public_title: "Quatro",
    visual_family: "four_news",
  };

  const snapshot = buildMatchdayLiveLayoutPhysicalSnapshot(
    MATCHDAY_ID,
    [zone],
    [zoneBlock(5, 1)],
    [placement("bank-1", "article-1", ZONE_IDS[5], 3)],
  );

  assert.equal(snapshot.zones[0].visualFamily, "four_news");
  assert.equal(snapshot.zones[0].capacity, 4);
  assert.deepEqual(
    snapshot.zones[0].items.map((item) => item.slotPosition),
    [3],
  );

  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zone],
      [zoneBlock(5, 1)],
      [placement("bank-1", "article-1", ZONE_IDS[5], 5)],
    ),
    /placement-slot-out-of-capacity/,
  );
});

test("título público físico pode ser vazio e é normalizado", () => {
  const snapshot = buildMatchdayLiveLayoutPhysicalSnapshot(
    MATCHDAY_ID,
    [{
      ...zoneRow(0),
      public_title: "   ",
    }],
    [zoneBlock(0)],
    [],
  );

  assert.equal(snapshot.zones[0].publicTitle, "");

  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [{
        ...zoneRow(0),
        public_title: "x".repeat(121),
      }],
      [zoneBlock(0)],
      [],
    ),
    /zone-public-title-invalid/,
  );
});

test("classification_key não é convertida na identidade física da zona", () => {
  const snapshot = buildMatchdayLiveLayoutPhysicalSnapshot(
    MATCHDAY_ID,
    [zoneRow(5)],
    [zoneBlock(5, 1)],
    [placement("bank-1", "article-1", ZONE_IDS[5], 1, "benfica")],
  );

  assert.equal(snapshot.zones[0].id, parseLiveLayoutZoneId(ZONE_IDS[5]));
  assert.equal(snapshot.zones[0].items[0].zoneId, parseLiveLayoutZoneId(ZONE_IDS[5]));
  assert.notEqual(snapshot.zones[0].items[0].zoneId, "benfica");
});

test("slots vazios e intervalos entre posições são válidos", () => {
  const snapshot = buildMatchdayLiveLayoutPhysicalSnapshot(
    MATCHDAY_ID,
    [zoneRow(0)],
    [zoneBlock(0)],
    [placement("bank-1", "article-1", ZONE_IDS[0], 3)],
  );

  assert.deepEqual(snapshot.zones[0].items.map((item) => item.slotPosition), [3]);
  assert.equal(snapshot.zones[0].capacity, 6);
});

test("placement acima da capacidade da família visual é rejeitado", () => {
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0)],
      [placement("bank-1", "article-1", ZONE_IDS[0], 7)],
    ),
    /matchday-live-layout-physical-placement-slot-out-of-capacity/,
  );
});

test("zone_id desconhecido ou inválido é rejeitado", () => {
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0)],
      [placement("bank-1", "article-1", ZONE_IDS[6], 1)],
    ),
    /matchday-live-layout-physical-placement-zone-unknown/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0)],
      [placement("bank-1", "article-1", "benfica", 1)],
    ),
    /matchday-live-layout-physical-zone-id-invalid/,
  );
  assert.throws(() => parseLiveLayoutZoneId("benfica"));
});

test("dois placements no mesmo slot físico são rejeitados", () => {
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0)],
      [
        placement("bank-1", "article-1", ZONE_IDS[0], 1),
        placement("bank-2", "article-2", ZONE_IDS[0], 1),
      ],
    ),
    /matchday-live-layout-physical-placement-slot-duplicate/,
  );
});

test("uma notícia em mais de um placement autoritativo é rejeitada", () => {
  const duplicatedPlacement: MatchdayLiveLayoutPlacementProjectionRow = {
    ...placement("bank-1", "article-1", ZONE_IDS[0], 1),
    placement_count: 2,
  };

  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0)],
      [duplicatedPlacement],
    ),
    /matchday-live-layout-physical-placement-item-duplicate/,
  );
});

test("zonas e blocos inválidos falham fechado", () => {
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0), zoneRow(0)],
      [zoneBlock(0)],
      [],
    ),
    /matchday-live-layout-physical-zone-duplicate/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [],
      [],
    ),
    /matchday-live-layout-physical-zone-block-missing/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0), { ...zoneBlock(0, 2), id: blockId(12) }],
      [],
    ),
    /matchday-live-layout-physical-zone-block-duplicate/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [{ ...zoneBlock(6), sort_order: 1 }],
      [],
    ),
    /matchday-live-layout-physical-block-zone-unknown/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0, OTHER_MATCHDAY_ID)],
      [zoneBlock(0)],
      [],
    ),
    /matchday-live-layout-physical-zone-matchday-mismatch/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0, 1, OTHER_MATCHDAY_ID)],
      [],
    ),
    /matchday-live-layout-physical-block-matchday-mismatch/,
  );
});

test("unicidade de latest, video e sort_order é validada", () => {
  const latest = {
    id: blockId(20),
    matchday_id: MATCHDAY_ID,
    block_type: "latest",
    zone_id: null,
    sort_order: 2,
  };
  const video = {
    id: blockId(30),
    matchday_id: MATCHDAY_ID,
    block_type: "video",
    zone_id: null,
    sort_order: 2,
  };

  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0), latest, { ...latest, id: blockId(21), sort_order: 3 }],
      [],
    ),
    /matchday-live-layout-physical-latest-block-duplicate/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0), video, { ...video, id: blockId(31), sort_order: 3 }],
      [],
    ),
    /matchday-live-layout-physical-video-block-duplicate/,
  );
  assert.throws(
    () => buildMatchdayLiveLayoutPhysicalSnapshot(
      MATCHDAY_ID,
      [zoneRow(0)],
      [zoneBlock(0), latest, { ...video, sort_order: 2 }],
      [],
    ),
    /matchday-live-layout-physical-block-sort-order-duplicate/,
  );
});
