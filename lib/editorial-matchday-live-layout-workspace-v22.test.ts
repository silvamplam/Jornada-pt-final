import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveLayoutWorkspaceStateV22,
  type MatchdayLiveLayoutWorkspaceReaderRowV22,
} from "./editorial-matchday-live-layout-workspace-v22";

const MATCHDAY_ID =
  "10000000-0000-4000-8000-000000000001";

const ZONE_A =
  "20000000-0000-4000-8000-000000000001";

const ZONE_B =
  "20000000-0000-4000-8000-000000000002";

const NOW =
  "2026-09-06T22:30:00.000Z";

function readerRow(
  hostFamily:
    | "four_news"
    | "six_news" = "four_news",
  companionZoneId:
    string | null = ZONE_B,
): MatchdayLiveLayoutWorkspaceReaderRowV22 {
  return {
    state_token:
      "0123456789abcdef0123456789abcdef",

    zones: [
      {
        id: ZONE_A,
        matchday_id: MATCHDAY_ID,
        public_title: "Últimas",
        visual_family: "four_news",
      },
      {
        id: ZONE_B,
        matchday_id: MATCHDAY_ID,
        public_title: "",
        visual_family: hostFamily,
      },
    ],

    blocks: [
      {
        id:
          "30000000-0000-4000-8000-000000000001",
        matchday_id: MATCHDAY_ID,
        block_type: "zone",
        zone_id: ZONE_A,
        sort_order: 1,
      },
      {
        id:
          "30000000-0000-4000-8000-000000000002",
        matchday_id: MATCHDAY_ID,
        block_type: "zone",
        zone_id: ZONE_B,
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

    latest_companion:
      companionZoneId === null
        ? null
        : {
            matchday_id: MATCHDAY_ID,
            zone_id: companionZoneId,
            created_at: NOW,
            updated_at: NOW,
          },
  };
}

test(
  "companion resolve exclusivamente pelo zone_id",
  () => {
    const workspace =
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow(),
      );

    assert.equal(
      workspace.latestCompanion?.zoneId,
      ZONE_B,
    );

    assert.equal(
      workspace.zones[0].publicTitle,
      "Últimas",
    );

    assert.notEqual(
      workspace.latestCompanion?.zoneId,
      ZONE_A,
    );
  },
);

test(
  "ausência de companion é null explícito",
  () => {
    const workspace =
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow("four_news", null),
      );

    assert.equal(
      workspace.latestCompanion,
      null,
    );
  },
);

test(
  "host associado tem obrigatoriamente four_news",
  () => {
    assert.throws(
      () =>
        buildLiveLayoutWorkspaceStateV22(
          MATCHDAY_ID,
          readerRow("six_news"),
        ),
      /latest-companion-host-invalid/,
    );
  },
);

test(
  "título e ordem não inferem associação",
  () => {
    const workspace =
      buildLiveLayoutWorkspaceStateV22(
        MATCHDAY_ID,
        readerRow("four_news", null),
      );

    assert.equal(
      workspace.zones[0].publicTitle,
      "Últimas",
    );

    assert.equal(
      workspace.latestCompanion,
      null,
    );
  },
);