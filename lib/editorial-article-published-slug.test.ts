import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createEditorialArticleService,
  type EditorialArticleInput,
  type EditorialArticleServiceTransport,
  type EditorialArticleUpdatePayload,
} from "./editorial-article-service-internal";

const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";

const baseInput: EditorialArticleInput = {
  label: "Liga Portugal",
  title: "Título editado",
  subtitle: "Pós-título editado",
  body: "Corpo editado com conteúdo suficiente para publicação.",
  slug: "endereco-novo-que-nao-deve-ser-usado",
  image_url: "https://example.com/imagem.jpg",
  image_caption: null,
  author: "Jornalista",
  published_at: "2026-08-16T12:00:00.000Z",
  competition_id: null,
  season_id: null,
  matchday_id: null,
};

function makeTransport(options: {
  status: string;
  slug: string | null;
}) {
  let updatedPayload: EditorialArticleUpdatePayload | null = null;
  let slugChecked: string | null = null;

  const transport: EditorialArticleServiceTransport = {
    async findArticlesBySlug(slug) {
      slugChecked = slug;
      return [];
    },

    async readArticleStatus(articleId) {
      assert.equal(articleId, ARTICLE_ID);
      return {
        id: ARTICLE_ID,
        status: options.status,
        matchday_id: null,
        slug: options.slug,
      };
    },

    async readCompetition() {
      return null;
    },

    async readSeason() {
      return null;
    },

    async readMatchday() {
      return null;
    },

    async insertArticle() {
      throw new Error("insertArticle nao deve ser chamado neste teste");
    },

    async updateArticle(articleId, payload) {
      assert.equal(articleId, ARTICLE_ID);
      updatedPayload = payload;
    },

    async placePublishedArticleInitially() {
      throw new Error("placePublishedArticleInitially nao deve ser chamado neste teste");
    },

    randomUuid() {
      return ARTICLE_ID;
    },

    now() {
      return "2026-08-16T13:00:00.000Z";
    },
  };

  return {
    service: createEditorialArticleService(transport),
    getUpdatedPayload: () => updatedPayload,
    getSlugChecked: () => slugChecked,
  };
}

test("editar artigo publicado preserva o slug canónico já gravado", async () => {
  const harness = makeTransport({
    status: "published",
    slug: "endereco-publicado-original",
  });

  const result = await harness.service.updateArticle(
    ARTICLE_ID,
    baseInput,
    {
      action: "save",
      initialPlacement: "none",
    },
  );

  assert.equal(result.slug, "endereco-publicado-original");
  assert.equal(harness.getSlugChecked(), "endereco-publicado-original");
  assert.equal(
    harness.getUpdatedPayload()?.slug,
    "endereco-publicado-original",
  );
});

test("artigo ainda em rascunho pode alterar o slug antes da publicação", async () => {
  const harness = makeTransport({
    status: "draft",
    slug: "endereco-antigo-do-rascunho",
  });

  const result = await harness.service.updateArticle(
    ARTICLE_ID,
    baseInput,
    {
      action: "save",
      initialPlacement: "none",
    },
  );

  assert.equal(result.slug, "endereco-novo-que-nao-deve-ser-usado");
  assert.equal(
    harness.getUpdatedPayload()?.slug,
    "endereco-novo-que-nao-deve-ser-usado",
  );
});

test("formulário apresenta o endereço publicado como só de leitura", () => {
  const source = readFileSync(
    new URL("../app/admin/editorial/artigos/_articleForm.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /readOnly=\{currentStatus === "published"\}/,
  );
  assert.match(
    source,
    /if \(title && slug && !slug\.readOnly\)/,
  );
  assert.match(
    source,
    /Endereço fixo após publicação\./,
  );
});