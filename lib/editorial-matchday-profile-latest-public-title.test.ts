import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  validateMatchdayEditorialProfilePageControls,
} from "@/lib/editorial-matchday-profile-workspace";

const zoneOrder = [
  "benfica",
  "sporting",
  "fc_porto",
  "other_liga_clubs",
  "outside_liga_other",
];

const layouts = {
  benfica: "five_news_balanced",
  sporting: "six_news",
  fc_porto: "five_news_balanced",
  other_liga_clubs: "six_news",
  outside_liga_other: "five_news_secondary",
};

const blockOrder = [
  "benfica",
  "latest",
  "sporting",
  "fc_porto",
  "other_liga_clubs",
  "outside_liga_other",
];

const zoneTitles = {
  benfica: "",
  sporting: "",
  fc_porto: "",
  other_liga_clubs: "",
  outside_liga_other: "",
};

test("Últimas aceita título público independente", () => {
  const controls =
    validateMatchdayEditorialProfilePageControls({
      headlineTitleColor: null,
      latestZonePlacement: "four_news",
      latestZoneTitle: "A acontecer agora",
      thematicZoneOrder: zoneOrder,
      thematicZoneLayouts: layouts,
      thematicBlockOrder: blockOrder,
      thematicZoneTitles: zoneTitles,
    });

  assert.equal(
    controls.latestZoneTitle,
    "A acontecer agora",
  );
});

test("Últimas aceita título público vazio", () => {
  const controls =
    validateMatchdayEditorialProfilePageControls({
      headlineTitleColor: null,
      latestZonePlacement: "four_news",
      latestZoneTitle: "",
      thematicZoneOrder: zoneOrder,
      thematicZoneLayouts: layouts,
      thematicBlockOrder: blockOrder,
      thematicZoneTitles: zoneTitles,
    });

  assert.equal(
    controls.latestZoneTitle,
    "",
  );
});

test("contrato anterior normaliza título de Últimas para vazio", () => {
  const controls =
    validateMatchdayEditorialProfilePageControls({
      headlineTitleColor: null,
      latestZonePlacement: "four_news",
      thematicZoneOrder: zoneOrder,
      thematicZoneLayouts: layouts,
      thematicBlockOrder: blockOrder,
      thematicZoneTitles: zoneTitles,
    });

  assert.equal(
    controls.latestZoneTitle,
    "",
  );
});

test("título público de Últimas tem limite de 120 caracteres", () => {
  assert.throws(
    () =>
      validateMatchdayEditorialProfilePageControls({
        headlineTitleColor: null,
        latestZonePlacement: "four_news",
        latestZoneTitle: "x".repeat(121),
        thematicZoneOrder: zoneOrder,
        thematicZoneLayouts: layouts,
        thematicBlockOrder: blockOrder,
        thematicZoneTitles: zoneTitles,
      }),
    /invalid-latest-title/,
  );
});

test("Mesa expõe Título público em Últimas", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
    ),
    "utf8",
  );

  assert.match(
    source,
    /aria-label="Título público de Últimas"/,
  );

  assert.match(
    source,
    /latestZoneTitle/,
  );
});

test("Apply usa o workspace atómico atual e envia latest_zone_title", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
    ),
    "utf8",
  );

  assert.match(
    source,
    /apply_matchday_editorial_profile_workspace_v11/,
  );

  assert.match(
    source,
    /latest_zone_title/,
  );
});

test("reader público transporta latest_zone_title", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "lib/public-matchday-thematic.ts",
    ),
    "utf8",
  );

  assert.match(
    source,
    /latest_zone_title/,
  );

  assert.match(
    source,
    /latestZoneTitle/,
  );
});

test("renderer temático usa título aplicado sem fallback semântico", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
    ),
    "utf8",
  );

  assert.match(
    source,
    /thematicSnapshot\.pageControls\.latestZoneTitle\.trim\(\)/,
  );

  assert.match(
    source,
    /const latestZoneTitle = thematicSnapshot/,
  );
});
