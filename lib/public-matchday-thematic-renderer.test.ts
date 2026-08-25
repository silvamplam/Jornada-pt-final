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
    /!hasThematicAssignment[\s\S]*?!useHierarchicalReferenceComposition[\s\S]*?liveZoneOrder\.map/,
  );
});

test("assignment temático usa a ordem de sete blocos persistida", () => {
  assert.match(
    pageSource,
    /thematicSnapshot\.pageControls\.thematicBlockOrder\.map/,
  );

  assert.match(
    pageSource,
    /data-public-thematic-block="latest"/,
  );

  assert.match(
    pageSource,
    /block === "video"/,
  );

  assert.match(
    pageSource,
    /PublicThematicZoneLayout/,
  );
});

test("Faixa temática pública fica limitada às primeiras dez", () => {
  assert.match(
    pageSource,
    /thematicSnapshot[\s\S]*?importantNewsItems\.slice\(0, 10\)/,
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

test("as três famílias visuais têm adapters públicos explícitos", () => {
  assert.match(
    zoneSource,
    /zone\.visualFamily\s*===\s*"five_news_secondary"/,
  );

  assert.match(
    zoneSource,
    /zone\.visualFamily === "six_news"/,
  );

  assert.match(
    zoneSource,
    /FIVE_NEWS_BALANCED_SLOT_KEYS/,
  );

  assert.match(
    zoneSource,
    /PublicHierarchicalLiveLayouts/,
  );

  assert.match(
    zoneSource,
    /PublicBeyondMatchdayNews/,
  );
});
