import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyNewsroomEditorialInboxItem,
  newsroomEditorialInboxView,
  type NewsroomEditorialReviewState,
  type NewsroomEditorialUsedState,
} from "./newsroom-editorial-inbox-internal";
import type { NewsroomArticleSummary } from "./newsroom-article-repository";

const article: NewsroomArticleSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceCode: "abola",
  title: "Notícia sintética",
  subtitle: null,
  summary: null,
  author: null,
  publishedAt: "2026-08-04T00:00:00.000Z",
  publishedAtPrecision: "instant",
  detectedAt: "2026-08-04T00:00:00.000Z",
  lastDetectedAt: "2026-08-04T00:00:00.000Z",
  imageUrl: null,
  processingStatus: "normalized",
  latestSnapshotId: "22222222-2222-4222-8222-222222222222",
  hasUsableSnapshot: true,
  sourceUrl: "https://www.abola.pt/noticias/teste",
  isManualEntry: false,
  usedInComposition: false,
};

function state(
  decision: NewsroomEditorialReviewState["decision"],
  reviewedSnapshotId = article.latestSnapshotId!,
): NewsroomEditorialReviewState {
  return {
    articleId: article.id,
    decision,
    reviewedSnapshotId,
    reviewedAt: "2026-08-04T00:10:00.000Z",
  };
}

function usedState(
  snapshotId = article.latestSnapshotId!,
): NewsroomEditorialUsedState {
  return {
    articleId: article.id,
    snapshotId,
    usedAt: "2026-08-14T15:00:00.000Z",
  };
}

test("uma notícia sem decisão entra em Por rever como nova", () => {
  assert.deepEqual(classifyNewsroomEditorialInboxItem(article, null), {
    view: "pending",
    label: "new",
    changedAfterReview: false,
  });
});

test("uma fonte usada no snapshot atual entra em Utilizadas", () => {
  assert.deepEqual(
    classifyNewsroomEditorialInboxItem(article, state("working"), usedState()),
    {
      view: "used",
      label: "used",
      changedAfterReview: false,
    },
  );
});

test("uma fonte utilizada volta ao fluxo normal quando recebe novo snapshot", () => {
  assert.deepEqual(
    classifyNewsroomEditorialInboxItem(
      article,
      state("seen", "33333333-3333-4333-8333-333333333333"),
      usedState("33333333-3333-4333-8333-333333333333"),
    ),
    {
      view: "pending",
      label: "updated",
      changedAfterReview: true,
    },
  );
});

test("uma notícia vista volta a Por rever quando surge novo snapshot", () => {
  assert.deepEqual(
    classifyNewsroomEditorialInboxItem(
      article,
      state("seen", "33333333-3333-4333-8333-333333333333"),
    ),
    {
      view: "pending",
      label: "updated",
      changedAfterReview: true,
    },
  );
});

test("uma notícia em trabalho permanece em trabalho mesmo quando muda", () => {
  assert.deepEqual(
    classifyNewsroomEditorialInboxItem(
      article,
      state("working", "33333333-3333-4333-8333-333333333333"),
    ),
    {
      view: "working",
      label: "working",
      changedAfterReview: true,
    },
  );
});

test("notícias vistas e dispensadas com snapshot atual ficam no arquivo", () => {
  assert.equal(classifyNewsroomEditorialInboxItem(article, state("seen")).view, "archive");
  assert.equal(classifyNewsroomEditorialInboxItem(article, state("dismissed")).view, "archive");
});

test("as quatro vistas são válidas e uma vista desconhecida volta a Por rever", () => {
  assert.equal(newsroomEditorialInboxView("working"), "working");
  assert.equal(newsroomEditorialInboxView("used"), "used");
  assert.equal(newsroomEditorialInboxView("archive"), "archive");
  assert.equal(newsroomEditorialInboxView("invalida"), "pending");
});
