import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EDITORIAL_PROFILES,
  editorialProfileWithZoneLayouts,
} from "@/lib/editorial-profiles";

import {
  matchdayEditorialProfileThematicZoneOrderFromBlockOrder,
  moveMatchdayEditorialProfileThematicBlock,
  normalizeMatchdayEditorialProfileThematicBlockOrder,
  normalizeMatchdayEditorialProfileThematicZoneLayouts,
  validateMatchdayEditorialProfilePageControls,
} from "@/lib/editorial-matchday-profile-workspace";

const profile =
  EDITORIAL_PROFILES.liga_portugal_v1;

test(
  "controlos flexíveis validam layouts e Últimas dentro da ordem",
  () => {
    const controls =
      validateMatchdayEditorialProfilePageControls({
        headlineTitleColor: null,
        latestZonePlacement: "four_news",
        thematicZoneOrder: [
          "benfica",
          "sporting",
          "fc_porto",
          "other_liga_clubs",
          "outside_liga_other",
        ],
        thematicZoneLayouts: {
          benfica: "five_news_balanced",
          sporting: "six_news",
          fc_porto: "five_news_secondary",
          other_liga_clubs: "six_news",
          outside_liga_other: "five_news_balanced",
        },
        thematicBlockOrder: [
          "benfica",
          "latest",
          "sporting",
          "fc_porto",
          "other_liga_clubs",
          "outside_liga_other",
        ],
      });

    assert.equal(
      controls.thematicZoneLayouts.sporting,
      "six_news",
    );

    assert.deepEqual(
      controls.thematicBlockOrder,
      [
        "benfica",
        "latest",
        "sporting",
        "fc_porto",
        "other_liga_clubs",
        "outside_liga_other",
        "video",
      ],
    );
  },
);

test(
  "contrato antigo continua a normalizar para defaults sem Legacy",
  () => {
    const controls =
      validateMatchdayEditorialProfilePageControls({
        headlineTitleColor: null,
        latestZonePlacement: "top",
        thematicZoneOrder: [
          "sporting",
          "benfica",
          "fc_porto",
          "other_liga_clubs",
          "outside_liga_other",
        ],
      });

    assert.equal(
      controls.thematicZoneLayouts.sporting,
      "five_news_balanced",
    );

    assert.deepEqual(
      controls.thematicBlockOrder,
      [
        "sporting",
        "benfica",
        "fc_porto",
        "other_liga_clubs",
        "outside_liga_other",
        "latest",
        "video",
      ],
    );
  },
);

test(
  "Últimas move como bloco sem alterar identidade das zonas",
  () => {
    const moved =
      moveMatchdayEditorialProfileThematicBlock(
        [
          "benfica",
          "sporting",
          "latest",
          "fc_porto",
          "other_liga_clubs",
          "outside_liga_other",
        ],
        "latest",
        "up",
      );

    assert.deepEqual(
      moved,
      [
        "benfica",
        "latest",
        "sporting",
        "fc_porto",
        "other_liga_clubs",
        "outside_liga_other",
        "video",
      ],
    );

    assert.deepEqual(
      matchdayEditorialProfileThematicZoneOrderFromBlockOrder(
        moved,
      ),
      [
        "benfica",
        "sporting",
        "fc_porto",
        "other_liga_clubs",
        "outside_liga_other",
      ],
    );
  },
);

test(
  "normalização fail-closed repõe layouts e ordem temática válidos",
  () => {
    assert.equal(
      normalizeMatchdayEditorialProfileThematicZoneLayouts({
        benfica: "invalid",
      }).benfica,
      "six_news",
    );

    assert.equal(
      normalizeMatchdayEditorialProfileThematicZoneLayouts({
        benfica: "four_news",
        sporting: "five_news_balanced",
        fc_porto: "five_news_balanced",
        other_liga_clubs: "six_news",
        outside_liga_other: "five_news_secondary",
      }).benfica,
      "six_news",
    );

    assert.deepEqual(
      normalizeMatchdayEditorialProfileThematicBlockOrder(
        ["latest", "latest"],
        [
          "sporting",
          "benfica",
          "fc_porto",
          "other_liga_clubs",
          "outside_liga_other",
        ],
      ),
      [
        "sporting",
        "benfica",
        "fc_porto",
        "other_liga_clubs",
        "outside_liga_other",
        "latest",
        "video",
      ],
    );
  },
);

test(
  "perfil efetivo permite seis no Sporting sem o transformar noutra zona",
  () => {
    const effective =
      editorialProfileWithZoneLayouts(
        profile,
        {
          benfica: "five_news_balanced",
          sporting: "six_news",
          fc_porto: "five_news_balanced",
          other_liga_clubs: "six_news",
          outside_liga_other: "five_news_secondary",
        },
      );

    const sporting =
      effective.zones.find(
        (zone) => zone.key === "sporting",
      );

    assert.equal(sporting?.key, "sporting");
    assert.equal(sporting?.capacity, 6);
    assert.equal(
      sporting?.visualFamily,
      "six_news",
    );
  },
);

test(
  "reader preserva o template temático e a route aplica exclusivamente o físico v20",
  () => {
    const root = process.cwd();

    const desk = readFileSync(
      path.join(
        root,
        "lib/editorial-matchday-profile-desk.ts",
      ),
      "utf8",
    );

    const route = readFileSync(
      path.join(
        root,
        "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
      ),
      "utf8",
    );

    assert.match(
      desk,
      /thematic_zone_layouts/,
    );

    assert.match(
      desk,
      /thematic_block_order/,
    );

    assert.match(
      desk,
      /editorialProfileWithZoneLayouts/,
    );

    assert.match(
      route,
      /rpc\/apply_matchday_live_layout_physical_v20/,
    );
    assert.doesNotMatch(
      route,
      /apply_matchday_live_layout_physical_workspace_v14/,
    );

    assert.doesNotMatch(
      route,
      /apply_matchday_editorial_profile_workspace_v(?:11|12)/,
    );

    assert.doesNotMatch(
      route,
      /thematic_zone_(?:layouts|titles)|thematic_block_order/,
    );

    assert.doesNotMatch(
      route,
      /apply_matchday_editorial_desk_state/,
    );
  },
);
