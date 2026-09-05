import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const pageSource = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
);
const legacyReaderSource = source("lib/public-matchday-thematic.ts");
const physicalReaderSource = source("lib/public-matchday-physical.ts");
const editorialDispatchSource = source("lib/public-matchday-editorial.ts");
const zoneSource = source("components/public/PublicThematicZoneLayout.tsx");
const flexibleZoneRenderersSource = source(
  "components/public/PublicFlexibleZoneRenderers.tsx",
);
const visualFamilySource = source("lib/editorial-visual-families.ts");
const rendererRegistrySource = source(
  "components/public/public-flexible-zone-renderer-registry.ts",
);

test("página pública usa um único dispatch marker-first", () => {
  assert.match(
    pageSource,
    /readPublicMatchdayEditorialSnapshot\(\s*context\.matchday\.id/,
  );
  assert.doesNotMatch(pageSource, /readPublicMatchdayThematicSnapshot/);
  assert.match(
    editorialDispatchSource,
    /physical\.kind === "physical" \|\| physical\.kind === "invalid_physical_snapshot"/,
  );

  const physicalDecision = editorialDispatchSource.indexOf("invalid_physical_snapshot");
  const legacyRead = editorialDispatchSource.indexOf(
    "readPublicMatchdayThematicSnapshot",
    physicalDecision,
  );
  assert.ok(physicalDecision >= 0 && legacyRead > physicalDecision);
});

test("apenas a Jornada genuinamente legacy conserva o renderer live antigo", () => {
  assert.match(
    pageSource,
    /isGenuineLegacy[\s\S]*?!useHierarchicalReferenceComposition[\s\S]*?liveEditorialBodyBlocks\.map/,
  );
});

test("físico usa blocks ordenados e zonas UUID no renderer flexível", () => {
  assert.match(pageSource, /physicalSnapshot\.blocks\.map/);
  assert.match(pageSource, /physicalZoneById\.get\(block\.zoneId\)/);
  assert.match(pageSource, /key: zone\.zoneId/);
  assert.match(pageSource, /visualFamily: zone\.layoutId/);
  assert.match(pageSource, /PublicFlexibleZoneLayout/);
});

test("Faixa física vem dos slots físicos e mantém o legacy isolado", () => {
  assert.match(pageSource, /physicalSnapshot\.faixa\.slots\.flatMap/);
  assert.match(pageSource, /items=\{visibleImportantNewsItems\}/);
  assert.match(pageSource, /thematicSnapshot[\s\S]*?importantNewsItems\.slice\(0, 20\)/);
});

test("snapshot editorial inválido apresenta erro explícito", () => {
  assert.match(pageSource, /data-public-editorial-state=\{editorialRead\.kind\}/);
  assert.match(pageSource, /editorialRead\.kind === "invalid_physical_snapshot"/);
});

test("reader legacy continua aplicado, read-only e isolado", () => {
  assert.match(legacyReaderSource, /matchday_editorial_profile_zone_items/);
  assert.match(legacyReaderSource, /matchday_editorial_profile_reconcile_control/);
  assert.doesNotMatch(legacyReaderSource, /readMatchdayEditorialProfileDesk/);
  assert.doesNotMatch(legacyReaderSource, /reconcileMatchdayEditorialProfile/);
  assert.doesNotMatch(legacyReaderSource, /manual_overrides/);
  assert.doesNotMatch(legacyReaderSource, /writeSupabase|\bPOST\b|\bPATCH\b|\bDELETE\b/);
});

test("reader físico usa v13 e não consulta fontes temáticas", () => {
  assert.match(physicalReaderSource, /rpc\/read_matchday_live_layout_workspace_v13/);
  assert.doesNotMatch(
    physicalReaderSource,
    /matchday_editorial_profile_zone_items|reconcile_control|EditorialProfileZoneKey/,
  );
  assert.doesNotMatch(
    physicalReaderSource,
    /writeSupabase|\bPOST\b|\bPATCH\b|\bDELETE\b/,
  );
});

test("as três famílias visuais usam o registry e o dispatch públicos centrais", () => {
  assert.match(zoneSource, /PublicFlexibleZoneLayout/);
  assert.doesNotMatch(flexibleZoneRenderersSource, /zone\.visualFamily\s*===/);
  assert.match(visualFamilySource, /"six_news"[\s\S]*?"hierarchical_analysis"/);
  assert.match(visualFamilySource, /"five_news_balanced"[\s\S]*?"hierarchical_other_games"/);
  assert.match(visualFamilySource, /"five_news_secondary"[\s\S]*?"secondary_news"/);
  assert.match(flexibleZoneRenderersSource, /PUBLIC_FLEXIBLE_ZONE_RENDERERS/);
  assert.match(flexibleZoneRenderersSource, /definition\.rendererKey/);
  assert.match(flexibleZoneRenderersSource, /PublicHierarchicalLiveLayouts/);
  assert.match(flexibleZoneRenderersSource, /PublicBeyondMatchdayNews/);
  assert.match(rendererRegistrySource, /Unknown public flexible zone renderer/);
});
