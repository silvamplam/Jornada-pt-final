import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEditorialSourcePackageMarkdown,
  editorialSourcePackageArticleImageSources,
  normalizeEditorialSourcePackageOutputs,
  type EditorialSourcePackageEntry,
} from "./editorial-source-package-internal";

const ARTICLE_A =
  "91000000-0000-4000-8000-000000000001";

const ARTICLE_B =
  "91000000-0000-4000-8000-000000000002";

function entries(): readonly EditorialSourcePackageEntry[] {
  return [
    {
      position: 1,
      articlePosition: 1,
      newsroomArticleId: ARTICLE_A,
      newsroomSnapshotId:
        "92000000-0000-4000-8000-000000000001",
      status: "prepared",
      sourceCode: "record",
      sourceName: "Record",
      sourceUrl: "https://example.invalid/a",
      author: null,
      publishedAt: "2026-08-18T10:00:00.000Z",
      publishedAtPrecision: "instant",
      anteTitle: null,
      title: "Fonte A",
      postTitle: null,
      body: [
        {
          type: "paragraph",
          text: "Corpo A.",
        },
      ],
      imageUrl:
        "https://assets.example.invalid/a.jpg",
      imagePreferred: true,
    },
    {
      position: 2,
      articlePosition: 1,
      newsroomArticleId: ARTICLE_B,
      newsroomSnapshotId:
        "92000000-0000-4000-8000-000000000002",
      status: "prepared",
      sourceCode: "abola",
      sourceName: "A Bola",
      sourceUrl: "https://example.invalid/b",
      author: null,
      publishedAt: "2026-08-18T10:01:00.000Z",
      publishedAtPrecision: "instant",
      anteTitle: null,
      title: "Fonte B",
      postTitle: null,
      body: [
        {
          type: "paragraph",
          text: "Corpo B.",
        },
      ],
      imageUrl:
        "https://assets.example.invalid/b.jpg",
    },
  ];
}

test(
  "um unico Dossie pode definir tres artigos finais e uma imagem por artigo",
  () => {
    const sourceEntries = entries();

    const outputs =
      normalizeEditorialSourcePackageOutputs(
        [
          {
            position: 1,
            sourceArticlePosition: 1,
            focus: "Cronica do jogo",
            imageNewsroomArticleId: ARTICLE_A,
          },
          {
            position: 2,
            sourceArticlePosition: 1,
            focus: "Reacoes",
            imageNewsroomArticleId: ARTICLE_B,
          },
          {
            position: 3,
            sourceArticlePosition: 1,
            focus: "Arbitragem",
            imageNewsroomArticleId: ARTICLE_A,
          },
        ],
        sourceEntries,
      );

    assert.ok(outputs);
    assert.equal(outputs.length, 3);

    assert.deepEqual(
      outputs.map(
        (output) => output.sourceArticlePosition,
      ),
      [1, 1, 1],
    );

    const images =
      editorialSourcePackageArticleImageSources(
        sourceEntries,
        outputs,
      );

    assert.deepEqual(
      images.map((image) => image.position),
      [1, 2, 3],
    );

    assert.deepEqual(
      images.map((image) => image.imageUrl),
      [
        "https://assets.example.invalid/a.jpg",
        "https://assets.example.invalid/b.jpg",
        "https://assets.example.invalid/a.jpg",
      ],
    );

    const markdown =
      buildEditorialSourcePackageMarkdown({
        createdAt:
          "2026-08-18T11:00:00.000Z",
        editorial: {
          genre: "news",
          genreLabel: "Notícia",
          suggestedTitle: "Casa Pia-Benfica",
          additionalInstructions: null,
        },
        entries: sourceEntries,
        outputs,
      });

    assert.match(
      markdown,
      /## ARTIGOS A PRODUZIR/,
    );

    assert.match(
      markdown,
      /\*\*TOTAL:\*\* 3/,
    );

    assert.match(
      markdown,
      /01 — Cronica do jogo — grupo de fontes 01/,
    );

    assert.match(
      markdown,
      /02 — Reacoes — grupo de fontes 01/,
    );

    assert.match(
      markdown,
      /03 — Arbitragem — grupo de fontes 01/,
    );

    assert.match(
      markdown,
      /\*\*ARTIGOS FINAIS:\*\* 3/,
    );

    assert.match(
      markdown,
      /# DOSSIÊ DE FONTES 01 DE 01/,
    );
  },
);
