import assert from "node:assert/strict";
import test from "node:test";

import {
  editorialBatchPublishedAtByOutputId,
  resolveEditorialBatchPublishedAt,
} from "./editorial-batch-published-at";

const EDITORIAL_NOW = "2026-09-20T14:35:42.000Z";

test("NEW conserva uma hora instantânea da fonte", () => {
  assert.equal(resolveEditorialBatchPublishedAt({
    mode: "new",
    sourcePublishedAt: "2026-09-19T21:17:08+01:00",
    fallbackPublishedAt: EDITORIAL_NOW,
  }), "2026-09-19T20:17:08.000Z");
});

test("NEW com fonte date usa a hora editorial e nunca cria uma falsa meia-noite", () => {
  const value = resolveEditorialBatchPublishedAt({
    mode: "new",
    sourcePublishedAt: null,
    fallbackPublishedAt: EDITORIAL_NOW,
  });
  assert.equal(value, EDITORIAL_NOW);
  assert.notEqual(value, "2026-09-19T00:00:00.000Z");
});

test("NEW sem publishedAt usa a hora editorial real", () => {
  assert.equal(resolveEditorialBatchPublishedAt({
    mode: "new",
    fallbackPublishedAt: EDITORIAL_NOW,
  }), EDITORIAL_NOW);
});

test("um lote mistura instantes exatos e fallback editorial sem bloquear NEW", () => {
  const values = [
    resolveEditorialBatchPublishedAt({
      mode: "new",
      sourcePublishedAt: "2026-09-19T18:00:00Z",
      fallbackPublishedAt: EDITORIAL_NOW,
    }),
    resolveEditorialBatchPublishedAt({ mode: "new", fallbackPublishedAt: EDITORIAL_NOW }),
    resolveEditorialBatchPublishedAt({ mode: "new", sourcePublishedAt: null, fallbackPublishedAt: EDITORIAL_NOW }),
  ];
  assert.deepEqual(values, ["2026-09-19T18:00:00.000Z", EDITORIAL_NOW, EDITORIAL_NOW]);
  assert.ok(values.every(Boolean));
});

test("UPDATE conserva integralmente o published_at do target", () => {
  assert.equal(resolveEditorialBatchPublishedAt({
    mode: "update",
    targetPublishedAt: "2024-05-01T09:30:00.123Z",
    sourcePublishedAt: "2026-09-19T18:00:00Z",
    fallbackPublishedAt: EDITORIAL_NOW,
  }), "2024-05-01T09:30:00.123Z");
});

test("retry conserva o timestamp persistido no receipt", () => {
  assert.equal(resolveEditorialBatchPublishedAt({
    mode: "new",
    receiptPublishedAt: "2026-09-20T13:00:00Z",
    plannedPublishedAt: EDITORIAL_NOW,
    fallbackPublishedAt: "2026-09-20T16:00:00Z",
  }), "2026-09-20T13:00:00.000Z");
});

test("artigo NEW parcialmente persistido conserva o seu timestamp", () => {
  assert.equal(resolveEditorialBatchPublishedAt({
    mode: "new",
    persistedPublishedAt: "2026-09-20T13:05:00Z",
    fallbackPublishedAt: "2026-09-20T16:00:00Z",
  }), "2026-09-20T13:05:00.000Z");
});

test("o plano transporta timestamps por outputId sem depender da posição", () => {
  assert.deepEqual(editorialBatchPublishedAtByOutputId([
    { outputId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", publishedAt: EDITORIAL_NOW },
    { outputId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", publishedAt: "2026-09-19T18:00:00Z" },
  ]), {
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": EDITORIAL_NOW,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": "2026-09-19T18:00:00.000Z",
  });
});

test("o antigo NEW_01 sem hora deixa de produzir publishedAt nulo", () => {
  assert.ok(resolveEditorialBatchPublishedAt({
    mode: "new",
    sourcePublishedAt: null,
    plannedPublishedAt: EDITORIAL_NOW,
    fallbackPublishedAt: "2026-09-20T16:00:00Z",
  }));
});
