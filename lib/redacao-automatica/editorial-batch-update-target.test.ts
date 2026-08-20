import assert from "node:assert/strict";
import test from "node:test";

import {
  editorialBatchTargetPublicationMode,
  editorialBatchUpdateTargetIssue,
  type EditorialBatchUpdateTargetArticle,
} from "./editorial-batch-update-target";

const TARGET_ID = "91000000-0000-4000-8000-000000000001";
const OTHER_ID = "91000000-0000-4000-8000-000000000002";
const MATCHDAY_ID = "92000000-0000-4000-8000-000000000001";
const OTHER_MATCHDAY_ID = "92000000-0000-4000-8000-000000000002";
const TARGET = {
  publishedArticleId: TARGET_ID,
  publishedSlug: "endereco-publico-original",
};

function article(
  overrides: Partial<EditorialBatchUpdateTargetArticle> = {},
): EditorialBatchUpdateTargetArticle {
  return {
    id: TARGET_ID,
    slug: TARGET.publishedSlug,
    status: "published",
    matchdayId: MATCHDAY_ID,
    publishedAt: "2026-08-20T18:00:00.000Z",
    ...overrides,
  };
}

test("valida o alvo publicado por ID, slug e Jornada", () => {
  assert.equal(
    editorialBatchUpdateTargetIssue(article(), TARGET, MATCHDAY_ID),
    null,
  );
});

test("bloqueia alvo inexistente, draft, de outra Jornada ou incoerente", () => {
  assert.equal(
    editorialBatchUpdateTargetIssue(null, TARGET, MATCHDAY_ID),
    "not_found",
  );
  assert.equal(
    editorialBatchUpdateTargetIssue(
      article({ id: OTHER_ID }),
      TARGET,
      MATCHDAY_ID,
    ),
    "not_found",
  );
  assert.equal(
    editorialBatchUpdateTargetIssue(
      article({ status: "draft" }),
      TARGET,
      MATCHDAY_ID,
    ),
    "not_published",
  );
  assert.equal(
    editorialBatchUpdateTargetIssue(
      article({ matchdayId: OTHER_MATCHDAY_ID }),
      TARGET,
      MATCHDAY_ID,
    ),
    "matchday_mismatch",
  );
  assert.equal(
    editorialBatchUpdateTargetIssue(
      article({ slug: "outro-endereco" }),
      TARGET,
      MATCHDAY_ID,
    ),
    "slug_mismatch",
  );
  assert.equal(
    editorialBatchUpdateTargetIssue(
      article({ publishedAt: null }),
      TARGET,
      MATCHDAY_ID,
    ),
    "published_at_invalid",
  );
});

test("o alvo explícito exige confirmação correta e nunca decide create", () => {
  const modes = [
    editorialBatchTargetPublicationMode({
      targetArticleId: TARGET_ID,
      existingMatches: true,
      confirmedArticleId: null,
    }),
    editorialBatchTargetPublicationMode({
      targetArticleId: TARGET_ID,
      existingMatches: false,
      confirmedArticleId: null,
    }),
    editorialBatchTargetPublicationMode({
      targetArticleId: TARGET_ID,
      existingMatches: false,
      confirmedArticleId: TARGET_ID,
    }),
    editorialBatchTargetPublicationMode({
      targetArticleId: TARGET_ID,
      existingMatches: false,
      confirmedArticleId: OTHER_ID,
    }),
  ];

  assert.deepEqual(modes, [
    "resume",
    "update_required",
    "update",
    "confirmation_mismatch",
  ]);
  assert.equal(modes.includes("create" as never), false);
});
