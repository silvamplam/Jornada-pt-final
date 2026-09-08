import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isHistoricalPublishedReferenceCompositionAuthority } from "./editorial-reference-composition-publication";
import { resolvePublicMatchdayEditorialAuthority } from "./public-matchday-editorial";

const publicLoader = readFileSync("lib/public-matchday.ts", "utf8");
const publicPage = readFileSync(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "utf8",
);

function historicalPublishedAuthority({
  currentPublishedCompositionId = "composition-current",
  hasContinuityTransition = true,
  sourceCompositionId = "composition-original",
  sourceDeskIsManaged = false,
}: Partial<Parameters<typeof isHistoricalPublishedReferenceCompositionAuthority>[0]> = {}) {
  return isHistoricalPublishedReferenceCompositionAuthority({
    currentPublishedCompositionId,
    hasContinuityTransition,
    sourceCompositionId,
    sourceDeskIsManaged,
  });
}

test("Jornada viva nunca troca o snapshot físico pela composição", () => {
  const historicalRepublish = historicalPublishedAuthority({
    sourceDeskIsManaged: true,
  });

  assert.equal(historicalRepublish, false);
  assert.equal(
    resolvePublicMatchdayEditorialAuthority({
      editorialReadKind: "physical",
      hasPublishedReferenceComposition: true,
      historicalRepublishedReferenceComposition: historicalRepublish,
      sourceDeskIsManaged: true,
    }),
    "editorial_snapshot",
  );
});

test("histórica sem transition mantém o snapshot físico", () => {
  const historicalRepublish = historicalPublishedAuthority({
    hasContinuityTransition: false,
  });

  assert.equal(historicalRepublish, false);
  assert.equal(
    resolvePublicMatchdayEditorialAuthority({
      editorialReadKind: "physical",
      hasPublishedReferenceComposition: true,
      historicalRepublishedReferenceComposition: historicalRepublish,
      sourceDeskIsManaged: false,
    }),
    "editorial_snapshot",
  );
  assert.equal(
    historicalPublishedAuthority({ sourceDeskIsManaged: null }),
    false,
  );
});

test("transition cuja current ainda é a composição original mantém physical", () => {
  const historicalRepublish = historicalPublishedAuthority({
    currentPublishedCompositionId: "composition-original",
  });

  assert.equal(historicalRepublish, false);
  assert.equal(
    resolvePublicMatchdayEditorialAuthority({
      editorialReadKind: "physical",
      hasPublishedReferenceComposition: true,
      historicalRepublishedReferenceComposition: historicalRepublish,
      sourceDeskIsManaged: false,
    }),
    "editorial_snapshot",
  );
});

test("current publicada diferente da original torna a reference composition autoridade", () => {
  const historicalRepublish = historicalPublishedAuthority();

  assert.equal(historicalRepublish, true);
  for (const editorialReadKind of [
    "physical",
    "invalid_physical_snapshot",
  ] as const) {
    assert.equal(
      resolvePublicMatchdayEditorialAuthority({
        editorialReadKind,
        hasPublishedReferenceComposition: true,
        historicalRepublishedReferenceComposition: historicalRepublish,
        sourceDeskIsManaged: false,
      }),
      "published_reference_composition",
    );
  }
});

test("renderer resolve a autoridade antes de derivar snapshots e usa hierarchical", () => {
  assert.match(
    publicLoader,
    /matchday_editorial_continuity_transitions\?select=source_composition_id&source_matchday_id=eq\./,
  );
  assert.match(
    publicLoader,
    /matchday_reference_compositions\?select=[^`]+&status=eq\.published&is_current=is\.true/,
  );
  assert.match(
    publicLoader,
    /isHistoricalPublishedReferenceCompositionAuthority\(\{[\s\S]*?sourceDeskIsManaged: editorialDeskControl\.authorityIsManaged,[\s\S]*?sourceCompositionId: historicalTransition\?\.source_composition_id/,
  );

  const authority = publicPage.indexOf(
    "const publicEditorialAuthority = resolvePublicMatchdayEditorialAuthority",
  );
  const physical = publicPage.indexOf("const physicalSnapshot =", authority);
  const headline = publicPage.indexOf("const headlineTitle =", physical);
  assert.ok(authority >= 0 && physical > authority && headline > physical);
  assert.match(
    publicPage,
    /const physicalSnapshot =\s*publicEditorialAuthority === "editorial_snapshot"/,
  );
  assert.match(
    publicPage,
    /const thematicSnapshot =\s*publicEditorialAuthority === "editorial_snapshot"/,
  );
  assert.match(
    publicPage,
    /usePublishedReferenceComposition && context\.referenceComposition\?\.presentation_mode === "hierarchical"/,
  );
  assert.match(publicPage, /<PublicHierarchicalComposition/);
});

test("autoridade pública não depende da J06, de v20 nem de IDs hardcoded", () => {
  const authoritySources = `${publicLoader}\n${publicPage}`;

  assert.doesNotMatch(
    authoritySources,
    /110bd7e1-cb3d-4910-a828-415154304fd7|efee4411-b5ed-4b7b-a916-0d1d24e8d6d5/,
  );
  assert.doesNotMatch(
    authoritySources,
    /historical_physical_archive|certificates_v20|source_archive_hash/,
  );
  assert.doesNotMatch(
    publicLoader,
    /writeSupabase|\bPOST\b|\bPATCH\b|\bDELETE\b/,
  );
});
