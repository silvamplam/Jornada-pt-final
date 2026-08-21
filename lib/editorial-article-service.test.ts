import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createEditorialArticleService,
  EditorialArticleServiceError,
  type EditorialArticleInput,
  type EditorialArticleInsertPayload,
  type EditorialArticlePublishedLiveSnapshotSyncInput,
  type EditorialArticleServiceTransport,
  type EditorialArticleUpdatePayload,
} from "@/lib/editorial-article-service-internal";

const ARTICLE_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ARTICLE_ID = "22222222-2222-2222-2222-222222222222";
const COMPETITION_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_COMPETITION_ID = "44444444-4444-4444-4444-444444444444";
const SEASON_ID = "55555555-5555-5555-5555-555555555555";
const OTHER_SEASON_ID = "66666666-6666-6666-6666-666666666666";
const MATCHDAY_ID = "77777777-7777-7777-7777-777777777777";
const DEFAULT_NOW = "2026-08-13T12:00:00.000Z";

function completeInput(
  overrides: Partial<EditorialArticleInput> = {},
): EditorialArticleInput {
  return {
    label: "LIGA PORTUGAL",
    title: "Título canónico",
    subtitle: "Pós-título completo",
    body: "Corpo completo do artigo.",
    slug: "titulo-canonico",
    image_url: "https://example.test/image.jpg",
    image_caption: "Legenda",
    author: "Jornalista",
    published_at: "2026-08-13T10:30:00.000Z",
    competition_id: null,
    season_id: null,
    matchday_id: null,
    editorial_destination: null,
    ...overrides,
  };
}

function fixture() {
  const state = {
    slugRows: [] as Array<{ id: string }>,
    currentArticle: null as {
      id: string;
      status: string | null;
      matchday_id: string | null;
      slug?: string | null;
    } | null,
    competitions: new Map<string, { id: string }>(),
    seasons: new Map<string, { id: string; competition_id: string | null }>(),
    matchdays: new Map<string, { id: string; season_id: string | null }>(),
    inserted: [] as EditorialArticleInsertPayload[],
    updated: [] as Array<{
      articleId: string;
      payload: EditorialArticleUpdatePayload;
    }>,
    snapshotSyncs: [] as EditorialArticlePublishedLiveSnapshotSyncInput[],
    updateEvents: [] as string[],
    placements: [] as Array<{
      matchdayId: string;
      articleId: string;
      placement: "none" | "headline" | "editorial_line_item" | "highlight" | "complement" | "important_item";
    }>,
    nowValues: [] as string[],
    placementFailure: null as unknown,
  };

  const transport: EditorialArticleServiceTransport = {
    async findArticlesBySlug() {
      return state.slugRows;
    },
    async readArticleStatus() {
      const article = state.currentArticle;
      return article ? { ...article, slug: article.slug ?? null } : null;
    },
    async readCompetition(competitionId) {
      return state.competitions.get(competitionId) ?? null;
    },
    async readSeason(seasonId) {
      return state.seasons.get(seasonId) ?? null;
    },
    async readMatchday(matchdayId) {
      return state.matchdays.get(matchdayId) ?? null;
    },
    async insertArticle(payload) {
      state.inserted.push(payload);
      return [{ id: ARTICLE_ID, slug: payload.slug ?? null }];
    },
    async updateArticle(articleId, payload) {
      state.updated.push({ articleId, payload });
      state.updateEvents.push("article-updated");
    },
    async syncPublishedArticleLiveSnapshots(input) {
      state.snapshotSyncs.push(structuredClone(input));
      state.updateEvents.push("live-snapshots-synced");
    },
    async placePublishedArticleInitially(matchdayId, articleId, placement) {
      state.placements.push({ matchdayId, articleId, placement });
      if (state.placementFailure !== null) {
        throw state.placementFailure;
      }
    },
    randomUuid() {
      return ARTICLE_ID;
    },
    now() {
      return state.nowValues.shift() ?? DEFAULT_NOW;
    },
  };

  return {
    state,
    service: createEditorialArticleService(transport),
  };
}

function addMatchdayContext(state: ReturnType<typeof fixture>["state"]) {
  state.competitions.set(COMPETITION_ID, { id: COMPETITION_ID });
  state.seasons.set(SEASON_ID, {
    id: SEASON_ID,
    competition_id: COMPETITION_ID,
  });
  state.matchdays.set(MATCHDAY_ID, {
    id: MATCHDAY_ID,
    season_id: SEASON_ID,
  });
}

async function expectServiceError(
  action: () => Promise<unknown>,
  code: string,
) {
  await assert.rejects(action, (error: unknown) => (
    error instanceof EditorialArticleServiceError && error.code === code
  ));
}

test("criação draft preserva campos vazios e não exige o contrato de publicação", async () => {
  const { service, state } = fixture();

  const result = await service.createArticle(completeInput({
    label: " ",
    title: "  Rascunho editorial  ",
    subtitle: null,
    body: " ",
    slug: null,
    image_url: null,
    image_caption: null,
    author: null,
    published_at: null,
  }), { action: "save", initialPlacement: "none" });

  assert.equal(result.status, "draft");
  assert.equal(result.slug, "rascunho-editorial");
  assert.equal(state.inserted[0].title, "Rascunho editorial");
  assert.equal(state.inserted[0].body, "");
  assert.equal(Object.hasOwn(state.inserted[0], "published_at"), false);
  assert.equal(state.inserted[0].created_at, DEFAULT_NOW);
  assert.equal(state.inserted[0].updated_at, DEFAULT_NOW);
});

test("criação published grava o contrato canónico completo", async () => {
  const { service, state } = fixture();

  const result = await service.createArticle(
    completeInput(),
    { action: "publish", initialPlacement: "none" },
  );

  assert.equal(result.status, "published");
  assert.deepEqual(
    {
      label: state.inserted[0].label,
      title: state.inserted[0].title,
      subtitle: state.inserted[0].subtitle,
      body: state.inserted[0].body,
      image_url: state.inserted[0].image_url,
      image_caption: state.inserted[0].image_caption,
      author: state.inserted[0].author,
      status: state.inserted[0].status,
    },
    {
      label: "LIGA PORTUGAL",
      title: "Título canónico",
      subtitle: "Pós-título completo",
      body: "Corpo completo do artigo.",
      image_url: "https://example.test/image.jpg",
      image_caption: "Legenda",
      author: "Jornalista",
      status: "published",
    },
  );
});

test("publicação rejeita cada campo canónico obrigatório em falta", async () => {
  const cases: Array<[Partial<EditorialArticleInput>, string]> = [
    [{ label: null }, "missing-ante-title"],
    [{ subtitle: null }, "missing-post-title"],
    [{ body: " " }, "missing-body"],
    [{ image_url: null }, "missing-image"],
    [{ author: null }, "missing-author"],
  ];

  for (const [override, code] of cases) {
    const { service } = fixture();
    await expectServiceError(
      () => service.createArticle(
        completeInput(override),
        { action: "publish", initialPlacement: "none" },
      ),
      code,
    );
  }
});

test("slug omitido continua a ser derivado do título com a normalização atual", async () => {
  const { service, state } = fixture();

  await service.createArticle(
    completeInput({ title: "  Vitória & Ópera — 2026!  ", slug: null }),
    { action: "save", initialPlacement: "none" },
  );

  assert.equal(state.inserted[0].slug, "vitoria-opera-2026");
});

test("colisão global de slug devolve duplicate-slug sem criar sufixos", async () => {
  const { service, state } = fixture();
  state.slugRows.push({ id: OTHER_ARTICLE_ID });

  await expectServiceError(
    () => service.createArticle(
      completeInput({ slug: "slug-repetido" }),
      { action: "save", initialPlacement: "none" },
    ),
    "duplicate-slug",
  );
  assert.equal(state.inserted.length, 0);
});

test("published_at explícito é aceite e normalizado para ISO", async () => {
  const { service, state } = fixture();

  await service.createArticle(
    completeInput({ published_at: "2026-08-13T11:30:00+01:00" }),
    { action: "publish", initialPlacement: "none" },
  );

  assert.equal(state.inserted[0].published_at, "2026-08-13T10:30:00.000Z");
});

test("publicação sem published_at usa o instante atual", async () => {
  const { service, state } = fixture();
  const publishedAt = "2026-08-13T15:45:00.000Z";
  const persistedAt = "2026-08-13T15:45:00.010Z";
  state.nowValues.push(publishedAt, persistedAt);

  await service.createArticle(
    completeInput({ published_at: null }),
    { action: "publish", initialPlacement: "none" },
  );

  assert.equal(state.inserted[0].published_at, publishedAt);
  assert.equal(state.inserted[0].created_at, persistedAt);
  assert.equal(state.inserted[0].updated_at, persistedAt);
});

test("matchday_id deriva season_id e competition_id server-side", async () => {
  const { service, state } = fixture();
  addMatchdayContext(state);

  await service.createArticle(
    completeInput({ matchday_id: MATCHDAY_ID }),
    { action: "save", initialPlacement: "none" },
  );

  assert.equal(state.inserted[0].matchday_id, MATCHDAY_ID);
  assert.equal(state.inserted[0].season_id, SEASON_ID);
  assert.equal(state.inserted[0].competition_id, COMPETITION_ID);
});

test("IDs de contexto explicitamente divergentes são rejeitados", async () => {
  const seasonMismatch = fixture();
  addMatchdayContext(seasonMismatch.state);
  await expectServiceError(
    () => seasonMismatch.service.createArticle(
      completeInput({ matchday_id: MATCHDAY_ID, season_id: OTHER_SEASON_ID }),
      { action: "save", initialPlacement: "none" },
    ),
    "invalid-context",
  );

  const competitionMismatch = fixture();
  addMatchdayContext(competitionMismatch.state);
  competitionMismatch.state.competitions.set(OTHER_COMPETITION_ID, {
    id: OTHER_COMPETITION_ID,
  });
  await expectServiceError(
    () => competitionMismatch.service.createArticle(
      completeInput({
        matchday_id: MATCHDAY_ID,
        competition_id: OTHER_COMPETITION_ID,
      }),
      { action: "save", initialPlacement: "none" },
    ),
    "invalid-context",
  );
});

test("scope é matchday quando existe Jornada", async () => {
  const { service, state } = fixture();
  addMatchdayContext(state);

  await service.createArticle(
    completeInput({ matchday_id: MATCHDAY_ID }),
    { action: "save", initialPlacement: "none" },
  );

  assert.equal(state.inserted[0].scope, "matchday");
});

test("scope é competition apenas com contexto competitivo e home sem contexto", async () => {
  const competitive = fixture();
  competitive.state.competitions.set(COMPETITION_ID, { id: COMPETITION_ID });
  await competitive.service.createArticle(
    completeInput({ competition_id: COMPETITION_ID }),
    { action: "save", initialPlacement: "none" },
  );
  assert.equal(competitive.state.inserted[0].scope, "competition");

  const home = fixture();
  await home.service.createArticle(
    completeInput(),
    { action: "save", initialPlacement: "none" },
  );
  assert.equal(home.state.inserted[0].scope, "home");
});

test("edição mantém slug próprio disponível e aplica o mesmo payload canónico", async () => {
  const { service, state } = fixture();
  state.currentArticle = {
    id: ARTICLE_ID,
    status: "draft",
    matchday_id: null,
  };
  state.slugRows.push({ id: ARTICLE_ID });

  await service.updateArticle(
    ARTICLE_ID,
    completeInput({ image_caption: null, published_at: null }),
    { action: "save", initialPlacement: "none" },
  );

  assert.equal(state.updated.length, 1);
  assert.equal(state.updated[0].articleId, ARTICLE_ID);
  assert.equal(state.updated[0].payload.slug, "titulo-canonico");
  assert.equal(state.updated[0].payload.status, "draft");
  assert.equal(state.updated[0].payload.image_caption, null);
  assert.equal(state.updated[0].payload.updated_at, DEFAULT_NOW);
});

test("guardar artigo já published não o despublica", async () => {
  const { service, state } = fixture();
  const refreshedPublishedAt = "2026-08-13T18:00:00.000Z";
  const updatedAt = "2026-08-13T18:00:00.010Z";
  state.currentArticle = {
    id: ARTICLE_ID,
    status: "published",
    matchday_id: null,
  };
  state.nowValues.push(refreshedPublishedAt, updatedAt);

  const result = await service.updateArticle(
    ARTICLE_ID,
    completeInput({ published_at: null }),
    { action: "save", initialPlacement: "highlight" },
  );

  assert.equal(result.status, "published");
  assert.equal(result.isFirstPublication, false);
  assert.equal(result.placement, "none");
  assert.equal(state.updated[0].payload.status, "published");
  assert.equal(state.updated[0].payload.published_at, refreshedPublishedAt);
  assert.equal(state.placements.length, 0);
});

test("atualização de artigo já publicado sincroniza snapshots depois da escrita canónica", async () => {
  const { service, state } = fixture();
  state.currentArticle = {
    id: ARTICLE_ID,
    status: "published",
    matchday_id: null,
    slug: "endereco-publicado-original",
  };

  await service.updateArticle(
    ARTICLE_ID,
    completeInput({
      title: "Título canónico atualizado",
      slug: "endereco-novo-ignorado",
    }),
    { action: "save", initialPlacement: "none" },
  );

  assert.deepEqual(state.updateEvents, [
    "article-updated",
    "live-snapshots-synced",
  ]);
  assert.equal(state.snapshotSyncs.length, 1);
  assert.equal(state.snapshotSyncs[0].articleId, ARTICLE_ID);
  assert.equal(state.snapshotSyncs[0].previousSlug, "endereco-publicado-original");
  assert.equal(state.snapshotSyncs[0].article.slug, "endereco-publicado-original");
  assert.equal(state.snapshotSyncs[0].article.title, "Título canónico atualizado");
  assert.equal(
    state.snapshotSyncs[0].article.published_at,
    "2026-08-13T10:30:00.000Z",
  );
});

test("primeira publicação com placement chama o circuito canónico", async () => {
  const { service, state } = fixture();
  addMatchdayContext(state);
  state.currentArticle = {
    id: ARTICLE_ID,
    status: "draft",
    matchday_id: MATCHDAY_ID,
  };

  const result = await service.updateArticle(
    ARTICLE_ID,
    completeInput({ matchday_id: MATCHDAY_ID }),
    { action: "publish", initialPlacement: "highlight" },
  );

  assert.equal(result.isFirstPublication, true);
  assert.equal(result.placement, "highlight");
  assert.deepEqual(state.placements, [{
    matchdayId: MATCHDAY_ID,
    articleId: ARTICLE_ID,
    placement: "highlight",
  }]);
  assert.equal(state.snapshotSyncs.length, 0);
});

test("placement none não força entrada em Últimas nem noutra zona", async () => {
  const { service, state } = fixture();
  addMatchdayContext(state);

  const result = await service.createArticle(
    completeInput({ matchday_id: MATCHDAY_ID }),
    { action: "publish", initialPlacement: "none" },
  );

  assert.equal(result.placement, "none");
  assert.equal(state.placements.length, 0);
});

test("erro de placement mantém o artigo publicado e é devolvido ao handler", async () => {
  const { service, state } = fixture();
  addMatchdayContext(state);
  state.placementFailure = new Error("falha controlada da zona");

  const result = await service.createArticle(
    completeInput({ matchday_id: MATCHDAY_ID }),
    { action: "publish", initialPlacement: "editorial_line_item" },
  );

  assert.equal(state.inserted[0].status, "published");
  assert.equal(result.status, "published");
  assert.equal(result.placement, "editorial_line_item");
  assert.equal(result.placementFailure?.cause, state.placementFailure);
});

test("fronteira pública é server-only e a route permanece apenas adapter HTTP", async () => {
  const [publicService, internalService, route] = await Promise.all([
    readFile("lib/editorial-article-service.ts", "utf8"),
    readFile("lib/editorial-article-service-internal.ts", "utf8"),
    readFile("app/api/admin/editorial/artigos/route.ts", "utf8"),
  ]);

  assert.match(publicService, /^import "server-only";/);
  assert.doesNotMatch(`${publicService}\n${internalService}`, /FormData|NextResponse|searchParams|React/);
  assert.doesNotMatch(`${publicService}\n${internalService}`, /Não foi possível aplicar a colocação/);
  assert.match(route, /createEditorialArticle\(articleInputFromFormData\(formData\)/);
  assert.match(route, /updateEditorialArticle\(/);
  assert.doesNotMatch(route, /writeSupabaseAdminReturning/);
  assert.doesNotMatch(route, /function normalizeContextIds|function buildPayload/);
});
