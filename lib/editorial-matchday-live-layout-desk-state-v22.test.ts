import assert from "node:assert/strict";
import test from "node:test";

import {
  changePhysicalDeskLatestCompanion,
  changePhysicalDeskZone,
  createPhysicalDeskState,
  deletePhysicalDeskZone,
  physicalDeskHasChanges,
} from "./editorial-matchday-live-layout-desk-state";
import {
  buildLiveLayoutWorkspaceStateV22,
  type MatchdayLiveLayoutWorkspaceReaderRowV22,
} from "./editorial-matchday-live-layout-workspace-v22";

const MATCHDAY_ID =
  "10000000-0000-4000-8000-000000000001";

const ZONE_ID =
  "20000000-0000-4000-8000-000000000001";

const NOW =
  "2026-09-06T22:30:00.000Z";

function readerRow(
  options: Readonly<{
    visualFamily?: "four_news" | "six_news";
    companion?: boolean;
  }> = {},
): MatchdayLiveLayoutWorkspaceReaderRowV22 {
  const visualFamily =
    options.visualFamily ?? "four_news";
  const companion =
    options.companion ?? true;

  return {
    state_token:
      "0123456789abcdef0123456789abcdef",

    zones: [{
      id: ZONE_ID,
      matchday_id: MATCHDAY_ID,
      public_title: "",
      visual_family: visualFamily,
    }],

    blocks: [
      {
        id:
          "30000000-0000-4000-8000-000000000001",
        matchday_id: MATCHDAY_ID,
        block_type: "zone",
        zone_id: ZONE_ID,
        sort_order: 1,
      },
      {
        id:
          "30000000-0000-4000-8000-000000000002",
        matchday_id: MATCHDAY_ID,
        block_type: "latest",
        zone_id: null,
        sort_order: 2,
      },
    ],

    placements: [],
    bank_items: [],
    state_memory: [],
    explicit_bank_item_ids: [],
    displaced_bank_item_ids: [],
    worked_bank_item_ids: [],
    legacy_zone_projection: [],
    workspace_settings: null,
    physical_cutover: null,

    latest_companion: companion
      ? {
          matchday_id: MATCHDAY_ID,
          zone_id: ZONE_ID,
          created_at: NOW,
          updated_at: NOW,
        }
      : null,
  };
}

const presentation = {
  headlineTitleColor: null,
  latestZonePlacement: "top" as const,
  latestZoneTitle: "Últimas",
  videoModuleActive: false,
};

test(
  "PhysicalDeskState transporta companion por zone_id",
  () => {
    const workspace =
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow(),
      );

    const desk = createPhysicalDeskState(
      workspace,
      presentation,
    );

    assert.equal(
      desk.current.latestCompanionZoneId,
      ZONE_ID,
    );

    assert.equal(
      desk.baseline.latestCompanionZoneId,
      ZONE_ID,
    );
  },
);

test(
  "host associado pode mudar layout sem perder a relação",
  () => {
    const desk = createPhysicalDeskState(
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow(),
      ),
      presentation,
    );

    const relayout = changePhysicalDeskZone(
      desk,
      desk.current.zones[0].id,
      { visualFamily: "six_news" },
    );

    assert.equal(
      relayout.current.zones[0].visualFamily,
      "six_news",
    );

    assert.equal(
      relayout.current.latestCompanionZoneId,
      ZONE_ID,
    );
  },
);

test(
  "apagar host associado limpa a relação automaticamente",
  () => {
    const desk = createPhysicalDeskState(
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow(),
      ),
      presentation,
    );

    const deleted = deletePhysicalDeskZone(
      desk,
      desk.current.zones[0].id,
    );

    assert.equal(
      deleted.current.latestCompanionZoneId,
      null,
    );

    assert.equal(
      deleted.current.zones.length,
      0,
    );
  },
);
test(
  "associar explicitamente altera apenas o companion",
  () => {
    const initial = createPhysicalDeskState(
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow({ companion: false }),
      ),
      presentation,
    );

    const associated =
      changePhysicalDeskLatestCompanion(
        initial,
        initial.current.zones[0].id,
      );

    assert.equal(
      initial.current.latestCompanionZoneId,
      null,
    );

    assert.equal(
      associated.current.latestCompanionZoneId,
      ZONE_ID,
    );

    assert.equal(
      physicalDeskHasChanges(associated),
      true,
    );

    assert.deepEqual(
      associated.current.placements,
      initial.current.placements,
    );
  },
);

test(
  "desassociar liberta a zona para relayout e delete",
  () => {
    const initial = createPhysicalDeskState(
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow(),
      ),
      presentation,
    );

    const detached =
      changePhysicalDeskLatestCompanion(
        initial,
        null,
      );

    assert.equal(
      detached.current.latestCompanionZoneId,
      null,
    );

    const relayout = changePhysicalDeskZone(
      detached,
      detached.current.zones[0].id,
      { visualFamily: "six_news" },
    );

    assert.equal(
      relayout.current.zones[0].visualFamily,
      "six_news",
    );

    const deleted = deletePhysicalDeskZone(
      detached,
      detached.current.zones[0].id,
    );

    assert.equal(
      deleted.current.zones.length,
      0,
    );
  },
);

test(
  "associar aceita qualquer layout físico existente",
  () => {
    const initial = createPhysicalDeskState(
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow({
          visualFamily: "six_news",
          companion: false,
        }),
      ),
      presentation,
    );

    const associated =
      changePhysicalDeskLatestCompanion(
        initial,
        initial.current.zones[0].id,
      );

    assert.equal(
      associated.current.latestCompanionZoneId,
      ZONE_ID,
    );

    assert.equal(
      associated.current.zones[0].visualFamily,
      "six_news",
    );
  },
);
