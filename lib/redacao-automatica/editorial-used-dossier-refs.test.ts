import assert from "node:assert/strict";
import test from "node:test";

import {
  editorialSourcePackageUsedDossierRefs,
} from "./editorial-source-package-internal";

test("preserva a identidade persistente do Dossiê utilizado", () => {
  const packageId =
    "91000000-0000-4000-8000-000000000001";
  const newsroomArticleId =
    "91000000-0000-4000-8000-000000000002";
  const newsroomSnapshotId =
    "91000000-0000-4000-8000-000000000003";
  const publishedArticleId =
    "93000000-0000-4000-8000-000000000001";

  assert.deepEqual(
    editorialSourcePackageUsedDossierRefs({
      packageId,
      year: "2026",
      month: "08",
      entries: [{
        position: 2,
        articlePosition: 1,
        newsroomArticleId,
        newsroomSnapshotId,
        usedAt: "2026-08-18T08:20:00.000Z",
        publishedArticleId,
        publishedSlug: "dedic-newcastle",
      }],
    }),
    [{
      newsroomArticleId,
      newsroomSnapshotId,
      usedAt: "2026-08-18T08:20:00.000Z",
      dossierKey: `article:${publishedArticleId}`,
      packageId,
      year: "2026",
      month: "08",
      articlePosition: 1,
      sourcePosition: 2,
      publishedArticleId,
      publishedSlug: "dedic-newcastle",
    }],
  );
});
