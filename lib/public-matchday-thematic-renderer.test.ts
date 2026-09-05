import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource =
  readFileSync(
    path.join(
      process.cwd(),
      "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
    ),
    "utf8",
  );

const readerSource =
  readFileSync(
    path.join(
      process.cwd(),
      "lib/public-matchday-thematic.ts",
    ),
    "utf8",
  );

const zoneSource =
  readFileSync(
    path.join(
      process.cwd(),
      "components/public/PublicThematicZoneLayout.tsx",
    ),
    "utf8",
  );

const flexibleZoneSource =
  readFileSync(
    path.join(
      process.cwd(),
      "components/public/PublicFlexibleZoneLayout.tsx",
    ),
    "utf8",
  );

const flexibleZoneRenderersSource =
  readFileSync(
    path.join(
      process.cwd(),
      "components/public/PublicFlexibleZoneRenderers.tsx",
    ),
    "utf8",
  );

const visualFamilySource =
  readFileSync(
    path.join(
      process.cwd(),
      "lib/editorial-visual-families.ts",
    ),
    "utf8",
  );

const rendererRegistrySource =
  readFileSync(
    path.join(
      process.cwd(),
      "components/public/public-flexible-zone-renderer-registry.ts",
    ),
    "utf8",
  );

test("página pública consulta assignment antes de escolher autoridade editorial", () => {
  assert.match(
    pageSource,
    /readPublicMatchdayThematicSnapshot\(\s*context\.matchday\.id/,
  );

  assert.match(
    pageSource,
    /hasThematicAssignment/,
  );

  assert.match(
    pageSource,
    /thematicPublicUnavailable/,
  );
});

test("sem assignment o percurso Legacy continua explícito", () => {
  assert.match(
    pageSource,
    /!hasThematicAssignment[\s\S]*?!useHierarchicalReferenceComposition[\s\S]*?liveEditorialBodyBlocks\.map/,
  );
});

test("assignment temático usa a ordem de sete blocos persistida", () => {
  assert.match(
    pageSource,
    /composeThematicPublicEditorialBody\([\s\S]*?thematicBlockOrder/,
  );

  assert.match(
    pageSource,
    /thematicEditorialBodyBlocks\.map/,
  );

  assert.match(
    pageSource,
    /data-public-thematic-block="latest"/,
  );

  assert.match(
    pageSource,
    /block\.kind === "video"/,
  );

  assert.match(
    pageSource,
    /PublicThematicZoneLayout/,
  );
});

test("Faixa temática pública fica limitada às primeiras vinte", () => {
  assert.match(
    pageSource,
    /thematicSnapshot[\s\S]*?importantNewsItems\.slice\(0, 20\)/,
  );

  assert.match(
    pageSource,
    /items=\{visibleImportantNewsItems\}/,
  );
});

test("perfil desconhecido ou snapshot inválido não cai no renderer Legacy", () => {
  assert.match(
    pageSource,
    /data-public-thematic-state="unavailable"/,
  );

  assert.match(
    pageSource,
    /hasThematicAssignment[\s\S]*?thematicSnapshot === null/,
  );
});

test("reader público só lê snapshot aplicado e nunca reconcilia ou escreve", () => {
  assert.match(
    readerSource,
    /matchday_editorial_profile_zone_items/,
  );

  assert.match(
    readerSource,
    /matchday_editorial_profile_reconcile_control/,
  );

  assert.doesNotMatch(
    readerSource,
    /readMatchdayEditorialProfileDesk/,
  );

  assert.doesNotMatch(
    readerSource,
    /reconcileMatchdayEditorialProfile/,
  );

  assert.doesNotMatch(
    readerSource,
    /manual_overrides/,
  );

  assert.doesNotMatch(
    readerSource,
    /writeSupabase|POST|PATCH|DELETE/,
  );
});

test("as três famílias visuais usam o registry e o dispatch públicos centrais", () => {
  assert.match(
    zoneSource,
    /PublicFlexibleZoneLayout/,
  );

  assert.doesNotMatch(
    flexibleZoneRenderersSource,
    /zone\.visualFamily\s*===/,
  );

  assert.match(
    visualFamilySource,
    /"six_news"[\s\S]*?"hierarchical_analysis"/,
  );

  assert.match(
    visualFamilySource,
    /"five_news_balanced"[\s\S]*?"hierarchical_other_games"/,
  );

  assert.match(
    visualFamilySource,
    /"five_news_secondary"[\s\S]*?"secondary_news"/,
  );

  assert.match(
    flexibleZoneRenderersSource,
    /PUBLIC_FLEXIBLE_ZONE_RENDERERS/,
  );

  assert.match(
    flexibleZoneRenderersSource,
    /definition\.rendererKey/,
  );

  assert.match(
    flexibleZoneRenderersSource,
    /PublicHierarchicalLiveLayouts/,
  );

  assert.match(
    flexibleZoneRenderersSource,
    /PublicBeyondMatchdayNews/,
  );

  assert.match(
    rendererRegistrySource,
    /Unknown public flexible zone renderer/,
  );
});
