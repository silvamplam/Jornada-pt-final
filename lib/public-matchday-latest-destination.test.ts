import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicPage = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);
const physicalReader = readFileSync(
  "lib/public-matchday-physical.ts",
  "utf8",
);
const projection = readFileSync(
  "lib/editorial-matchday-latest-four-projection.ts",
  "utf8",
);

test("reader público resolve o mesmo destino sem inferência visual", () => {
  assert.match(physicalReader, /resolveMatchdayLatestPlacement\(/);
  assert.match(physicalReader, /destination: MatchdayLatestPlacementResolution/);
  assert.doesNotMatch(
    physicalReader,
    /companion[\s\S]{0,100}(?:publicTitle|visualFamily|classification)/,
  );
});

test("renderer coloca ZONE no bloco do UUID e não no bloco Latest", () => {
  const physicalStart = publicPage.indexOf(
    "!usePublishedReferenceComposition && physicalSnapshot",
  );
  const thematicStart = publicPage.indexOf(
    ": !usePublishedReferenceComposition && thematicSnapshot",
    physicalStart,
  );
  assert.ok(physicalStart >= 0 && thematicStart > physicalStart);
  const physical = publicPage.slice(physicalStart, thematicStart);

  assert.match(
    physical,
    /block\.kind === "latest"[\s\S]*showPhysicalLegacyLatestBlock[\s\S]*PublicLatestOnlyLayout/,
  );
  assert.match(
    physical,
    /physicalLatestDestination\.zoneId === block\.zoneId[\s\S]*PublicLatestCompanionLayout/,
  );
  assert.doesNotMatch(
    physical.slice(
      physical.indexOf('block.kind === "latest"'),
      physical.indexOf('physicalLatestDestination?.kind === "zone"'),
    ),
    /PublicLatestCompanionLayout/,
  );
});

test("four_news + null preserva apenas o renderer legado sem inferir zona", () => {
  assert.match(
    publicPage,
    /showPhysicalLegacyLatestBlock =[\s\S]*kind === "legacy_incomplete"[\s\S]*storagePlacement === "four_news"/,
  );
  assert.doesNotMatch(
    publicPage,
    /find\([^\n]*(?:publicTitle|layoutId|classification)/,
  );
});

test("projeção legada de quatro notícias não decide companion", () => {
  assert.doesNotMatch(projection, /latestCompanion|companionZoneId|latest_zone_placement/);
  assert.match(projection, /LATEST_FOUR_NEWS_SLOT_TYPES/);
});
