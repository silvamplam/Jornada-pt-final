import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isHistoricalReferenceCompositionRepublishContext,
  shouldRejectNonStandardPhysicalReferenceComposition,
  type ReferenceCompositionPublicationAuthorityContext,
} from "./editorial-reference-composition-publication";

const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);
const publish = route.slice(
  route.indexOf("async function publishReferenceComposition"),
  route.indexOf("async function reopenReferenceComposition"),
);

function authority(
  values: Partial<ReferenceCompositionPublicationAuthorityContext> = {},
): ReferenceCompositionPublicationAuthorityContext {
  return {
    physicalAuthority: true,
    hasContinuityTransition: false,
    sourceDeskIsManaged: true,
    ...values,
  };
}

test("publicação física viva mantém standard obrigatório", () => {
  const live = authority();

  assert.equal(isHistoricalReferenceCompositionRepublishContext(live), false);
  assert.equal(
    shouldRejectNonStandardPhysicalReferenceComposition({
      ...live,
      presentationMode: "hierarchical",
    }),
    true,
  );
  assert.equal(
    shouldRejectNonStandardPhysicalReferenceComposition({
      ...live,
      presentationMode: "standard",
    }),
    false,
  );
});

test("republicação histórica retirada permite hierarchical chegar à RPC", () => {
  const historical = authority({
    hasContinuityTransition: true,
    sourceDeskIsManaged: false,
  });

  assert.equal(isHistoricalReferenceCompositionRepublishContext(historical), true);
  assert.equal(
    shouldRejectNonStandardPhysicalReferenceComposition({
      ...historical,
      presentationMode: "hierarchical",
    }),
    false,
  );
});

test("hierarchical isolado não cria autoridade histórica", () => {
  for (const candidate of [
    authority({ hasContinuityTransition: false, sourceDeskIsManaged: false }),
    authority({ hasContinuityTransition: true, sourceDeskIsManaged: true }),
    authority({ hasContinuityTransition: true, sourceDeskIsManaged: null }),
  ]) {
    assert.equal(isHistoricalReferenceCompositionRepublishContext(candidate), false);
    assert.equal(
      shouldRejectNonStandardPhysicalReferenceComposition({
        ...candidate,
        presentationMode: "hierarchical",
      }),
      true,
    );
  }
});

test("route lê autoridades canónicas mínimas e deixa a RPC validar o histórico", () => {
  assert.match(
    route,
    /matchday_editorial_continuity_transitions\?select=source_matchday_id&source_matchday_id=eq\./,
  );
  assert.match(
    route,
    /matchday_editorial_desk_control\?select=is_managed&matchday_id=eq\./,
  );
  assert.match(publish, /shouldRejectNonStandardPhysicalReferenceComposition/);
  assert.match(
    publish,
    /\(!physicalAuthority \|\| historicalRepublish\) && composition\.presentation_mode === "hierarchical"/,
  );
  assert.match(publish, /writeSupabaseAdmin\(\s*"rpc\/publish_matchday_reference_composition"/);
  assert.doesNotMatch(publish, /continuity_version|physical_handoffs|source_archive_hash/);

  const guard = publish.indexOf("shouldRejectNonStandardPhysicalReferenceComposition");
  const rpc = publish.indexOf('"rpc/publish_matchday_reference_composition"');
  assert.ok(guard >= 0 && rpc > guard);
});
