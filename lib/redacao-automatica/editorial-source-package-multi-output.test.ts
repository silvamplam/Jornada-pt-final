import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEditorialSourcePackageMarkdown,
  editorialSourcePackageArticleImageSources,
  normalizeEditorialSourcePackageCreationOutputs,
  normalizeEditorialSourcePackageOutputs,
  updateEditorialSourcePackageMarkdown,
  type EditorialSourcePackageEntry,
} from "./editorial-source-package-internal";

const ARTICLE_A =
  "91000000-0000-4000-8000-000000000001";

const ARTICLE_B =
  "91000000-0000-4000-8000-000000000002";

const EXTERNAL_IMAGE_URL =
  "https://project.supabase.co/storage/v1/object/public/editorial-images/editorial/2026/08/externa-c.webp";

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

test(
  "um Dossie reutilizado transporta integralmente os tres artigos publicados a atualizar",
  () => {
    const sourceEntries = entries();

    const outputs =
      normalizeEditorialSourcePackageCreationOutputs(
        [
          {
            position: 1,
            sourceArticlePosition: 1,
            focus: "Artigo 01",
            imageNewsroomArticleId: ARTICLE_A,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000001",
            publishedSlug: "artigo-publicado-01",
          },
          {
            position: 2,
            sourceArticlePosition: 1,
            focus: "Artigo 02",
            imageNewsroomArticleId: ARTICLE_B,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000002",
            publishedSlug: "artigo-publicado-02",
          },
          {
            position: 3,
            sourceArticlePosition: 1,
            focus: "Artigo 03",
            imageNewsroomArticleId: ARTICLE_A,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000003",
            publishedSlug: "artigo-publicado-03",
          },
        ],
        sourceEntries,
      );

    assert.ok(outputs);

    const markdown =
      buildEditorialSourcePackageMarkdown({
        createdAt:
          "2026-08-27T10:30:00.000Z",
        editorial: {
          genre: "news",
          genreLabel: "Notícia",
          suggestedTitle: null,
          additionalInstructions:
            "Atualizar o Dossiê.",
        },
        entries: sourceEntries,
        outputs,
        publishedArticles: [
          {
            position: 1,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000001",
            publishedSlug:
              "artigo-publicado-01",
            anteTitle: "FC Porto",
            title:
              "Título publicado 01",
            postTitle:
              "Pós-título publicado 01",
            body:
              "Corpo publicado 01.",
          },
          {
            position: 2,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000002",
            publishedSlug:
              "artigo-publicado-02",
            anteTitle: "FC Porto",
            title:
              "Título publicado 02",
            postTitle:
              "Pós-título publicado 02",
            body:
              "Corpo publicado 02.",
          },
          {
            position: 3,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000003",
            publishedSlug:
              "artigo-publicado-03",
            anteTitle: "FC Porto",
            title:
              "Título publicado 03",
            postTitle:
              "Pós-título publicado 03",
            body:
              "Corpo publicado 03.",
          },
        ],
      });

    assert.match(
      markdown,
      /# ARTIGOS PUBLICADOS A ATUALIZAR/,
    );

    const publishedArticlesIndex =
      markdown.indexOf(
        "# ARTIGOS PUBLICADOS A ATUALIZAR",
      );
    const sourcesIndex =
      markdown.indexOf("# FONTES INTEGRAIS");

    assert.ok(
      publishedArticlesIndex >= 0
      && sourcesIndex > publishedArticlesIndex,
    );

    assert.match(
      markdown,
      /A posição é vinculativa/,
    );
    assert.match(
      markdown,
      /## SAÍDA 01 DE 03[\s\S]*Título publicado 01[\s\S]*Corpo publicado 01/,
    );
    assert.match(
      markdown,
      /## SAÍDA 02 DE 03[\s\S]*Título publicado 02[\s\S]*Corpo publicado 02/,
    );
    assert.match(
      markdown,
      /## SAÍDA 03 DE 03[\s\S]*Título publicado 03[\s\S]*Corpo publicado 03/,
    );

    const first =
      markdown.indexOf("## SAÍDA 01 DE 03");
    const second =
      markdown.indexOf("## SAÍDA 02 DE 03");
    const third =
      markdown.indexOf("## SAÍDA 03 DE 03");

    assert.ok(
      first >= 0
      && first < second
      && second < third,
    );

    const updated =
      updateEditorialSourcePackageMarkdown({
        markdown,
        editorial: {
          genre: "news",
          genreLabel: "Notícia",
          suggestedTitle: null,
          additionalInstructions:
            "Atualização revista.",
        },
        outputs,
      });

    assert.ok(updated);
    assert.match(
      updated,
      /# ARTIGOS PUBLICADOS A ATUALIZAR/,
    );
    assert.match(
      updated,
      /Corpo publicado 01/,
    );
    assert.match(
      updated,
      /Corpo publicado 02/,
    );
    assert.match(
      updated,
      /Corpo publicado 03/,
    );
  },
);

test(
  "um pacote reutilizado preserva o alvo publicado sem nascer utilizado",
  () => {
    const outputs = normalizeEditorialSourcePackageCreationOutputs(
      [{
        position: 1,
        sourceArticlePosition: 1,
        focus: "Atualização integral",
        imageNewsroomArticleId: ARTICLE_A,
        publishedArticleId:
          "93000000-0000-4000-8000-000000000001",
        publishedSlug: "endereco-publico-original",
      }],
      entries(),
    );

    assert.deepEqual(outputs, [{
      position: 1,
      sourceArticlePosition: 1,
      focus: "Atualização integral",
      imageNewsroomArticleId: ARTICLE_A,
      publishedArticleId:
        "93000000-0000-4000-8000-000000000001",
      publishedSlug: "endereco-publico-original",
    }]);
    assert.equal("usedAt" in outputs![0], false);
  },
);

test(
  "três peças podem reutilizar duas imagens de fonte ou escolher uma externa",
  () => {
    const outputs = normalizeEditorialSourcePackageOutputs(
      JSON.parse(JSON.stringify([
        {
          position: 1,
          sourceArticlePosition: 1,
          focus: "Peça A",
          imageNewsroomArticleId: ARTICLE_A,
        },
        {
          position: 2,
          sourceArticlePosition: 1,
          focus: "Peça B",
          imageNewsroomArticleId: ARTICLE_A,
        },
        {
          position: 3,
          sourceArticlePosition: 1,
          focus: "Peça C",
          imageNewsroomArticleId: null,
          externalImage: {
            url: EXTERNAL_IMAGE_URL,
            fileName: "externa-c.webp",
          },
        },
      ])),
      entries(),
    );

    assert.ok(outputs);
    assert.equal(outputs.length, 3);
    assert.deepEqual(
      outputs.slice(0, 2).map((output) => output.imageNewsroomArticleId),
      [ARTICLE_A, ARTICLE_A],
    );
    assert.deepEqual(outputs[2].externalImage, {
      url: EXTERNAL_IMAGE_URL,
      fileName: "externa-c.webp",
    });

    const images = editorialSourcePackageArticleImageSources(entries(), outputs);
    assert.deepEqual(images.map((image) => image.imageUrl), [
      "https://assets.example.invalid/a.jpg",
      "https://assets.example.invalid/a.jpg",
      EXTERNAL_IMAGE_URL,
    ]);
  },
);

test(
  "duas saídas podem guardar imagens externas diferentes e a escolha é exclusiva por saída",
  () => {
    const secondUrl = EXTERNAL_IMAGE_URL.replace("externa-c.webp", "externa-d.png");
    const outputs = normalizeEditorialSourcePackageOutputs([
      {
        position: 1,
        sourceArticlePosition: 1,
        focus: "Peça C",
        imageNewsroomArticleId: null,
        externalImage: { url: EXTERNAL_IMAGE_URL, fileName: "externa-c.webp" },
      },
      {
        position: 2,
        sourceArticlePosition: 1,
        focus: "Peça D",
        imageNewsroomArticleId: null,
        externalImage: { url: secondUrl, fileName: "externa-d.png" },
      },
    ], entries());

    assert.ok(outputs);
    assert.equal(outputs[0].externalImage?.url, EXTERNAL_IMAGE_URL);
    assert.equal(outputs[1].externalImage?.url, secondUrl);
    assert.equal(outputs[0].imageNewsroomArticleId, null);
    assert.equal(outputs[1].imageNewsroomArticleId, null);

    assert.equal(normalizeEditorialSourcePackageOutputs([{
      position: 1,
      sourceArticlePosition: 1,
      focus: "Escolha ambígua",
      imageNewsroomArticleId: ARTICLE_A,
      externalImage: { url: EXTERNAL_IMAGE_URL, fileName: "externa-c.webp" },
    }], entries()), null);
  },
);

test(
  "a criação rejeita alvos incompletos, duplicados e usedAt transportado",
  () => {
    const base = {
      position: 1,
      sourceArticlePosition: 1,
      focus: "Atualização integral",
      imageNewsroomArticleId: ARTICLE_A,
    };

    assert.equal(
      normalizeEditorialSourcePackageCreationOutputs(
        [{ ...base, publishedArticleId: ARTICLE_A }],
        entries(),
      ),
      null,
    );

    assert.equal(
      normalizeEditorialSourcePackageCreationOutputs(
        [
          {
            ...base,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000001",
            publishedSlug:
              "artigo-publicado-original",
          },
          {
            ...base,
            position: 2,
            imageNewsroomArticleId: ARTICLE_B,
            publishedArticleId:
              "93000000-0000-4000-8000-000000000001",
            publishedSlug:
              "artigo-publicado-original",
          },
        ],
        entries(),
      ),
      null,
    );

    assert.equal(
      normalizeEditorialSourcePackageCreationOutputs(
        [{
          ...base,
          publishedArticleId: ARTICLE_A,
          publishedSlug: "endereco-publico-original",
          usedAt: "2026-08-20T19:00:00.000Z",
        } as typeof base & {
          publishedArticleId: string;
          publishedSlug: string;
        }],
        entries(),
      ),
      null,
    );
  },
);
