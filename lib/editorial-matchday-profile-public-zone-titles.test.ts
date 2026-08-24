import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  validateMatchdayEditorialProfilePageControls,
} from "@/lib/editorial-matchday-profile-workspace";

const emptyTitles = {
  benfica: "",
  sporting: "",
  fc_porto: "",
  other_liga_clubs: "",
  outside_liga_other: "",
};

const layouts = {
  benfica: "five_news_balanced",
  sporting: "six_news",
  fc_porto: "five_news_balanced",
  other_liga_clubs: "six_news",
  outside_liga_other: "five_news_secondary",
};

const zoneOrder = [
  "benfica",
  "sporting",
  "fc_porto",
  "other_liga_clubs",
  "outside_liga_other",
];

const blockOrder = [
  "benfica",
  "sporting",
  "fc_porto",
  "latest",
  "other_liga_clubs",
  "outside_liga_other",
];

test("títulos públicos são independentes das chaves semânticas", () => {
  const controls =
    validateMatchdayEditorialProfilePageControls({
      headlineTitleColor: null,
      latestZonePlacement: "four_news",
      thematicZoneOrder: zoneOrder,
      thematicZoneLayouts: layouts,
      thematicBlockOrder: blockOrder,
      thematicZoneTitles: {
        ...emptyTitles,
        benfica: "Noite de decisões",
        sporting: "Leitura do campeão",
      },
    });

  assert.equal(
    controls.thematicZoneTitles.benfica,
    "Noite de decisões",
  );

  assert.equal(
    controls.thematicZoneTitles.sporting,
    "Leitura do campeão",
  );

  assert.deepEqual(
    controls.thematicZoneOrder,
    zoneOrder,
  );
});

test("contrato anterior normaliza títulos públicos para vazio", () => {
  const controls =
    validateMatchdayEditorialProfilePageControls({
      headlineTitleColor: null,
      latestZonePlacement: "four_news",
      thematicZoneOrder: zoneOrder,
      thematicZoneLayouts: layouts,
      thematicBlockOrder: blockOrder,
    });

  assert.deepEqual(
    controls.thematicZoneTitles,
    emptyTitles,
  );
});

test("título público acima de 120 caracteres é recusado", () => {
  assert.throws(
    () =>
      validateMatchdayEditorialProfilePageControls({
        headlineTitleColor: null,
        latestZonePlacement: "four_news",
        thematicZoneOrder: zoneOrder,
        thematicZoneLayouts: layouts,
        thematicBlockOrder: blockOrder,
        thematicZoneTitles: {
          ...emptyTitles,
          benfica: "x".repeat(121),
        },
      }),
    /invalid-zone-titles/,
  );
});

test("renderer não usa obrigatoriamente o nome semântico como cabeçalho público", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "components/public/PublicThematicZoneLayout.tsx",
    ),
    "utf8",
  );

  assert.match(
    source,
    /const publicTitle\s*=\s*zone\.publicTitle\.trim\(\)/,
  );

  assert.match(
    source,
    /\{publicTitle \? \(/,
  );

  assert.doesNotMatch(
    source,
    /<h2 className="public-thematic-zone-heading">\s*\{zone\.label\}/,
  );
});

test("Apply usa o workspace atómico atual e persiste thematic_zone_titles", () => {
  const route = readFileSync(
    path.join(
      process.cwd(),
      "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
    ),
    "utf8",
  );

  assert.match(
    route,
    /apply_matchday_editorial_profile_workspace_v5/,
  );

  assert.match(
    route,
    /thematic_zone_titles/,
  );
});
