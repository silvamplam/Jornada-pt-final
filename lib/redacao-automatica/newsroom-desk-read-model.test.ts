import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createEditorialDeskReadModel,
  type EditorialDeskBankContextRecord,
  type EditorialDeskNewArticleRecord,
  type EditorialDeskPublishedArticleRecord,
  type EditorialDeskReadTransport,
  type EditorialDeskThemeRecord,
} from "./newsroom-desk-read-model-internal";

const NOW = "2026-09-09T10:00:00.000Z";
const EARLIER = "2026-09-08T10:00:00.000Z";
const ARTICLE_1 = "10000000-0000-4000-8000-000000000001";
const ARTICLE_2 = "10000000-0000-4000-8000-000000000002";
const ARTICLE_3 = "10000000-0000-4000-8000-000000000003";
const SNAPSHOT_1 = "20000000-0000-4000-8000-000000000001";
const SNAPSHOT_2 = "20000000-0000-4000-8000-000000000002";
const SNAPSHOT_3 = "20000000-0000-4000-8000-000000000003";
const PUBLISHED_1 = "30000000-0000-4000-8000-000000000001";
const PUBLISHED_2 = "30000000-0000-4000-8000-000000000002";
const THEME_1 = "40000000-0000-4000-8000-000000000001";
const THEME_2 = "40000000-0000-4000-8000-000000000002";
const DOSSIER_1 = "50000000-0000-4000-8000-000000000001";
const DOSSIER_SOURCE_1 = "51000000-0000-4000-8000-000000000001";
const PLAN_1 = "52000000-0000-4000-8000-000000000001";
const PACKAGE_1 = "60000000-0000-4000-8000-000000000001";
const COMPETITION_1 = "70000000-0000-4000-8000-000000000001";
const SEASON_1 = "71000000-0000-4000-8000-000000000001";
const MATCHDAY_1 = "72000000-0000-4000-8000-000000000001";
const MATCHDAY_2 = "72000000-0000-4000-8000-000000000002";
const BANK_1 = "73000000-0000-4000-8000-000000000001";
const BANK_2 = "73000000-0000-4000-8000-000000000002";

function newArticle(
  id = ARTICLE_1,
  lastDetectedAt = NOW,
): EditorialDeskNewArticleRecord {
  return {
    id,
    source_code: "wire",
    source_name: null,
    original_url: `https://example.test/${id}`,
    normalized_url: `https://example.test/${id}`,
    title: `Fonte ${id}`,
    subtitle: null,
    summary: null,
    author: null,
    published_at: null,
    detected_at: EARLIER,
    image_url: null,
    processing_status: "detected",
    last_detected_at: lastDetectedAt,
  };
}

function publishedArticle(
  id = PUBLISHED_1,
  publishedAt: string | null = NOW,
): EditorialDeskPublishedArticleRecord {
  return {
    id,
    slug: `artigo-${id}`,
    title: `Artigo ${id}`,
    label: "Antetítulo",
    subtitle: "Pós-título",
    image_url: null,
    published_at: publishedAt,
    status: "published",
    competition_id: null,
    season_id: null,
    matchday_id: null,
  };
}

function theme(
  id = THEME_1,
  updatedAt = NOW,
  status: "open" | "archived" = "open",
  classificationKey = "benfica",
): EditorialDeskThemeRecord {
  return {
    id,
    title: `Tema ${id}`,
    classification_key: classificationKey,
    status,
    context_text: null,
    competition_id: null,
    season_id: null,
    matchday_id: null,
    match_id: null,
    created_at: EARLIER,
    updated_at: updatedAt,
  };
}

function bankContext(
  id: string,
  matchdayId: string,
  classification: Readonly<{
    key: string | null;
    source: string | null;
    at: string | null;
  }>,
  sourceId = PUBLISHED_1,
): EditorialDeskBankContextRecord {
  return {
    id,
    source_id: sourceId,
    status: "active",
    competition_id: COMPETITION_1,
    season_id: SEASON_1,
    matchday_id: matchdayId,
    classification_key: classification.key,
    classification_source: classification.source,
    classified_at: classification.at,
  };
}

function fixtureTransport(
  overrides: Partial<EditorialDeskReadTransport> = {},
): EditorialDeskReadTransport {
  return {
    isConfigured: () => true,
    listNewArticles: async () => ({ items: [], hasNextPage: false }),
    readLatestSnapshots: async () => [],
    readReviewStates: async () => [],
    readPrePublicationClassifications: async () => [],
    readThemeSourcesByArticleIds: async () => [],
    readDossierSources: async () => [],
    readPlanAssignments: async () => [],
    readPlans: async () => [],
    readDossiers: async () => [],
    readLegacyUsage: async () => [],
    readPublishedArticlesByIds: async () => [],
    listPublishedArticles: async () => ({ items: [], hasNextPage: false }),
    readBankContexts: async () => [],
    readThemeArticlesByArticleIds: async () => [],
    listThemes: async () => ({ items: [], hasNextPage: false }),
    readThemeSourcesByThemeIds: async () => [],
    readThemeArticlesByThemeIds: async () => [],
    ...overrides,
  };
}

async function successful(
  transport: EditorialDeskReadTransport,
  input: Parameters<ReturnType<typeof createEditorialDeskReadModel>>[0] = {},
) {
  const result = await createEditorialDeskReadModel(transport)(input);
  if (!result.ok) assert.fail(result.error.code);
  return result.value;
}

test("rejeita filtro e relação com classification_key inválida", async () => {
  let reads = 0;
  const invalidInput = await createEditorialDeskReadModel(fixtureTransport({
    listThemes: async () => {
      reads += 1;
      return { items: [], hasNextPage: false };
    },
  }))({
    classification: {
      mode: "classified",
      classificationKey: "sexta_classificacao",
    } as never,
  });
  assert.deepEqual(invalidInput.ok, false);
  if (invalidInput.ok) assert.fail("expected invalid request");
  assert.equal(invalidInput.error.code, "invalid_request");
  assert.equal(reads, 0);

  const invalidRow = await createEditorialDeskReadModel(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readPrePublicationClassifications: async () => [{
      newsroom_article_id: ARTICLE_1,
      classification_key: "sexta_classificacao",
      classification_source: "manual",
      classified_at: NOW,
      updated_at: NOW,
    }],
  }))();
  assert.equal(invalidRow.ok, false);
  if (invalidRow.ok) assert.fail("expected invalid relation");
  assert.equal(invalidRow.error.code, "relation_invalid");
});

test("POR CLASSIFICAR usa null e não cria uma sexta chave", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
  }));
  assert.deepEqual(value.novas.items[0].classification, {
    status: "unclassified",
    classificationKey: null,
    classificationSource: null,
    classifiedAt: null,
    updatedAt: null,
  });
});

test("classification Sporting filtra NOVAS pela classificação persistida", async () => {
  const seenFilters: unknown[] = [];
  const value = await successful(fixtureTransport({
    listNewArticles: async (input) => {
      seenFilters.push(input.classification);
      return { items: [newArticle()], hasNextPage: false };
    },
    readPrePublicationClassifications: async () => [{
      newsroom_article_id: ARTICLE_1,
      classification_key: "sporting",
      classification_source: "manual",
      classified_at: EARLIER,
      updated_at: NOW,
    }],
  }), {
    classification: { mode: "classified", classificationKey: "sporting" },
  });
  assert.deepEqual(seenFilters, [{ mode: "classified", classificationKey: "sporting" }]);
  assert.equal(value.novas.items.length, 1);
  assert.equal(value.novas.items[0].classification.classificationKey, "sporting");
  assert.deepEqual(value.classification, {
    mode: "classified",
    classificationKey: "sporting",
  });
});

test("classification Sporting filtra PUBLICADAS pela autoridade contextual do Bank", async () => {
  const seenFilters: unknown[] = [];
  const value = await successful(fixtureTransport({
    listPublishedArticles: async (input) => {
      seenFilters.push(input.classification);
      return { items: [publishedArticle()], hasNextPage: false };
    },
    readBankContexts: async () => [bankContext(BANK_1, MATCHDAY_1, {
      key: "sporting",
      source: "manual",
      at: NOW,
    })],
  }), {
    classification: { mode: "classified", classificationKey: "sporting" },
  });
  assert.deepEqual(seenFilters, [{ mode: "classified", classificationKey: "sporting" }]);
  assert.equal(value.publicadas.items.length, 1);
  assert.equal(value.publicadas.items[0].bankContexts[0].matchesFilter, true);
});

test("classification Sporting filtra TEMAS pela classificação persistida do Tema", async () => {
  const seenFilters: unknown[] = [];
  const value = await successful(fixtureTransport({
    listThemes: async (input) => {
      seenFilters.push(input.classification);
      return {
        items: [theme(THEME_1, NOW, "open", "sporting")],
        hasNextPage: false,
      };
    },
  }), {
    classification: { mode: "classified", classificationKey: "sporting" },
  });
  assert.deepEqual(seenFilters, [{ mode: "classified", classificationKey: "sporting" }]);
  assert.equal(value.temas.items.length, 1);
  assert.equal(value.temas.items[0].classificationKey, "sporting");
});

test("POR CLASSIFICAR pode ser pedido explicitamente nas NOVAS", async () => {
  const seenFilters: unknown[] = [];
  const value = await successful(fixtureTransport({
    listNewArticles: async (input) => {
      seenFilters.push(input.classification);
      return { items: [newArticle()], hasNextPage: false };
    },
  }), {
    classification: { mode: "unclassified" },
  });
  assert.deepEqual(seenFilters, [{ mode: "unclassified" }]);
  assert.deepEqual(value.novas.items[0].classification, {
    status: "unclassified",
    classificationKey: null,
    classificationSource: null,
    classifiedAt: null,
    updatedAt: null,
  });
  assert.deepEqual(value.temas.items, []);
});

test("NOVA incompleta e sem Tema continua visível", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
  }));
  const item = value.novas.items[0];
  assert.equal(item.snapshot, null);
  assert.deepEqual(item.body, []);
  assert.equal(item.imageCandidateUrl, null);
  assert.deepEqual(item.themeMembership, { status: "none", themeIds: [] });
  assert.equal(item.sourceState.editoriallyActionable, true);
});

test("PUBLICADA canónica sem Tema continua visível", async () => {
  const value = await successful(fixtureTransport({
    listPublishedArticles: async () => ({
      items: [publishedArticle()],
      hasNextPage: false,
    }),
  }));
  assert.equal(value.publicadas.items[0].editorialArticleId, PUBLISHED_1);
  assert.equal(value.publicadas.items[0].status, "published");
  assert.deepEqual(value.publicadas.items[0].themeMembership, {
    status: "none",
    themeIds: [],
  });
});

test("Tema sem fontes e sem artigos permanece na coleção", async () => {
  const value = await successful(fixtureTransport({
    listThemes: async () => ({ items: [theme()], hasNextPage: false }),
  }));
  assert.equal(value.temas.items[0].sourceCount, 0);
  assert.equal(value.temas.items[0].articleCount, 0);
  assert.equal(value.temas.items[0].lastActivityAt, null);
});

test("Tema é opcional e membership não significa source used", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readThemeSourcesByArticleIds: async () => [{
      theme_id: THEME_1,
      newsroom_article_id: ARTICLE_1,
      added_at: NOW,
    }],
  }));
  const item = value.novas.items[0];
  assert.equal(item.themeMembership.status, "associated");
  assert.equal(item.usageProvenance.status, "none");
  assert.equal(item.sourceState.editorial.view, "pending");
});

test("preserva Utilizadas e Arquivo e marca apenas Por rever/Em trabalho como acionáveis", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({
      items: [newArticle(ARTICLE_1), newArticle(ARTICLE_2), newArticle(ARTICLE_3)],
      hasNextPage: false,
    }),
    readLatestSnapshots: async () => [
      {
        id: SNAPSHOT_1,
        article_id: ARTICLE_1,
        content_hash: "snapshot-1",
        body: [],
        source_metadata: {},
        extracted_at: NOW,
        created_at: NOW,
      },
      {
        id: SNAPSHOT_2,
        article_id: ARTICLE_2,
        content_hash: "snapshot-2",
        body: [],
        source_metadata: {},
        extracted_at: NOW,
        created_at: NOW,
      },
      {
        id: SNAPSHOT_3,
        article_id: ARTICLE_3,
        content_hash: "snapshot-3",
        body: [],
        source_metadata: {},
        extracted_at: NOW,
        created_at: NOW,
      },
    ],
    readReviewStates: async () => [
      {
        newsroom_article_id: ARTICLE_2,
        decision: "seen",
        reviewed_snapshot_id: SNAPSHOT_2,
        reviewed_at: NOW,
      },
      {
        newsroom_article_id: ARTICLE_3,
        decision: "working",
        reviewed_snapshot_id: SNAPSHOT_3,
        reviewed_at: NOW,
      },
    ],
    readLegacyUsage: async () => [{
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      used_at: NOW,
      package_id: PACKAGE_1,
      year: "2026",
      month: "09",
      article_position: 1,
      source_position: 1,
      published_article_id: null,
    }],
  }));
  const byId = new Map(value.novas.items.map((item) => [item.newsroomArticleId, item]));
  assert.equal(byId.get(ARTICLE_1)?.sourceState.editorial.view, "used");
  assert.equal(byId.get(ARTICLE_1)?.sourceState.editoriallyActionable, false);
  assert.equal(byId.get(ARTICLE_2)?.sourceState.editorial.view, "archive");
  assert.equal(byId.get(ARTICLE_2)?.sourceState.editoriallyActionable, false);
  assert.equal(byId.get(ARTICLE_3)?.sourceState.editorial.view, "working");
  assert.equal(byId.get(ARTICLE_3)?.sourceState.editoriallyActionable, true);
});

test("FONTE ATUALIZADA fica separada de relação publicada e de update target", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readLatestSnapshots: async () => [{
      id: SNAPSHOT_2,
      article_id: ARTICLE_1,
      content_hash: "snapshot-2",
      body: [{ type: "paragraph", text: "Corpo novo" }],
      source_metadata: {},
      extracted_at: NOW,
      created_at: NOW,
    }],
    readReviewStates: async () => [{
      newsroom_article_id: ARTICLE_1,
      decision: "seen",
      reviewed_snapshot_id: SNAPSHOT_1,
      reviewed_at: EARLIER,
    }],
    readLegacyUsage: async () => [{
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      used_at: EARLIER,
      package_id: PACKAGE_1,
      year: "2026",
      month: "09",
      article_position: 1,
      source_position: 1,
      published_article_id: PUBLISHED_1,
    }],
    readPublishedArticlesByIds: async () => [publishedArticle()],
  }));
  const item = value.novas.items[0];
  assert.equal(item.sourceState.editorial.label, "updated");
  assert.equal(item.sourceState.changedAfterKnownUsage, true);
  assert.equal(item.publishedRelations.status, "known");
  assert.equal(Object.hasOwn(item, "updateTarget"), false);
});

test("classificação manual persistida da NOVA é projetada sem substituição", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readPrePublicationClassifications: async () => [{
      newsroom_article_id: ARTICLE_1,
      classification_key: "sporting",
      classification_source: "manual",
      classified_at: EARLIER,
      updated_at: NOW,
    }],
  }), {
    classification: { mode: "classified", classificationKey: "sporting" },
  });
  assert.deepEqual(value.novas.items[0].classification, {
    status: "classified",
    classificationKey: "sporting",
    classificationSource: "manual",
    classifiedAt: EARLIER,
    updatedAt: NOW,
  });
});

test("ausência de evidência determinística permanece UNKNOWN", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
  }));
  assert.deepEqual(value.novas.items[0].publishedRelations, {
    status: "unknown",
    items: [],
  });
});

test("legacy enriquece a leitura sem criar Tema", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readLegacyUsage: async () => [{
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      used_at: EARLIER,
      package_id: PACKAGE_1,
      year: "2026",
      month: "09",
      article_position: 1,
      source_position: 2,
      published_article_id: PUBLISHED_1,
    }],
    readPublishedArticlesByIds: async () => [publishedArticle()],
  }));
  const item = value.novas.items[0];
  assert.equal(item.usageProvenance.status, "known");
  assert.equal(item.usageProvenance.legacySourcePackages.length, 1);
  assert.equal(item.publishedRelations.items[0].evidence[0].kind, "legacy_source_package");
  assert.equal(item.themeMembership.status, "none");
});

test("Dossiê/plano projeta apenas a relação publicada determinística", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readDossierSources: async () => [{
      id: DOSSIER_SOURCE_1,
      dossier_id: DOSSIER_1,
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      included: false,
    }],
    readPlanAssignments: async () => [{
      dossier_id: DOSSIER_1,
      article_plan_id: PLAN_1,
      dossier_source_id: DOSSIER_SOURCE_1,
    }],
    readPlans: async () => [{
      id: PLAN_1,
      dossier_id: DOSSIER_1,
      editorial_article_id: PUBLISHED_1,
    }],
    readDossiers: async () => [{ id: DOSSIER_1, title: "Dossiê", status: "completed" }],
    readPublishedArticlesByIds: async () => [publishedArticle()],
  }));
  const item = value.novas.items[0];
  assert.equal(item.publishedRelations.status, "known");
  assert.equal(item.publishedRelations.items[0].evidence[0].kind, "dossier_plan");
  assert.equal(item.usageProvenance.dossierSources[0].included, false);
});

test("uma NOVA pode projetar duas PUBLICADAS conhecidas sem escolher updateTarget", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readDossierSources: async () => [{
      id: DOSSIER_SOURCE_1,
      dossier_id: DOSSIER_1,
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      included: true,
    }],
    readPlanAssignments: async () => [{
      dossier_id: DOSSIER_1,
      article_plan_id: PLAN_1,
      dossier_source_id: DOSSIER_SOURCE_1,
    }],
    readPlans: async () => [{
      id: PLAN_1,
      dossier_id: DOSSIER_1,
      editorial_article_id: PUBLISHED_1,
    }],
    readDossiers: async () => [{ id: DOSSIER_1, title: "Dossiê", status: "completed" }],
    readLegacyUsage: async () => [{
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      used_at: NOW,
      package_id: PACKAGE_1,
      year: "2026",
      month: "09",
      article_position: 1,
      source_position: 1,
      published_article_id: PUBLISHED_2,
    }],
    readPublishedArticlesByIds: async () => [
      publishedArticle(PUBLISHED_1),
      publishedArticle(PUBLISHED_2),
    ],
  }));
  const item = value.novas.items[0];
  assert.equal(item.publishedRelations.status, "known");
  assert.deepEqual(
    item.publishedRelations.items.map((relation) => relation.editorialArticleId),
    [PUBLISHED_1, PUBLISHED_2],
  );
  assert.equal(Object.hasOwn(item, "updateTarget"), false);
});

test("a mesma PUBLICADA encontrada por Dossiê e legacy é deduplicada com ambas as proveniências", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: [newArticle()], hasNextPage: false }),
    readDossierSources: async () => [{
      id: DOSSIER_SOURCE_1,
      dossier_id: DOSSIER_1,
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      included: true,
    }],
    readPlanAssignments: async () => [{
      dossier_id: DOSSIER_1,
      article_plan_id: PLAN_1,
      dossier_source_id: DOSSIER_SOURCE_1,
    }],
    readPlans: async () => [{
      id: PLAN_1,
      dossier_id: DOSSIER_1,
      editorial_article_id: PUBLISHED_1,
    }],
    readDossiers: async () => [{ id: DOSSIER_1, title: "Dossiê", status: "completed" }],
    readLegacyUsage: async () => [{
      newsroom_article_id: ARTICLE_1,
      newsroom_snapshot_id: SNAPSHOT_1,
      used_at: NOW,
      package_id: PACKAGE_1,
      year: "2026",
      month: "09",
      article_position: 1,
      source_position: 1,
      published_article_id: PUBLISHED_1,
    }],
    readPublishedArticlesByIds: async () => [publishedArticle(PUBLISHED_1)],
  }));
  const relations = value.novas.items[0].publishedRelations.items;
  assert.equal(relations.length, 1);
  assert.equal(relations[0].editorialArticleId, PUBLISHED_1);
  assert.deepEqual(
    relations[0].evidence.map((evidence) => evidence.kind),
    ["dossier_plan", "legacy_source_package"],
  );
});

test("PUBLICADA devolve todos os contextos do Bank sem escolha arbitrária", async () => {
  const value = await successful(fixtureTransport({
    listPublishedArticles: async () => ({ items: [publishedArticle()], hasNextPage: false }),
    readBankContexts: async () => [
      bankContext(BANK_2, MATCHDAY_2, {
        key: "fc_porto",
        source: "automatic",
        at: NOW,
      }),
      bankContext(BANK_1, MATCHDAY_1, {
        key: "benfica",
        source: "manual",
        at: EARLIER,
      }),
    ],
  }), {
    publicadas: { matchdayId: MATCHDAY_1 },
  });
  assert.equal(value.publicadas.items.length, 1);
  assert.equal(value.publicadas.items[0].editorialArticleId, PUBLISHED_1);
  const contexts = value.publicadas.items[0].bankContexts;
  assert.equal(contexts.length, 2);
  assert.deepEqual(contexts.map((context) => context.matchesFilter), [true, false]);
  assert.deepEqual(
    contexts.map((context) => context.classification.status === "classified"
      ? context.classification.classificationSource
      : null),
    ["manual", "automatic"],
  );
});

test("classificação contextual inválida do Bank é rejeitada", async () => {
  const result = await createEditorialDeskReadModel(fixtureTransport({
    listPublishedArticles: async () => ({ items: [publishedArticle()], hasNextPage: false }),
    readBankContexts: async () => [bankContext(BANK_1, MATCHDAY_1, {
      key: "outside_liga_other",
      source: null,
      at: null,
    })],
  }))();
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected invalid relation");
  assert.equal(result.error.code, "relation_invalid");
});

test("paginação explicita e ordenação usam desempate por identidade", async () => {
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({
      items: [newArticle(ARTICLE_1), newArticle(ARTICLE_2)],
      hasNextPage: true,
    }),
    listPublishedArticles: async () => ({
      items: [publishedArticle(PUBLISHED_1), publishedArticle(PUBLISHED_2)],
      hasNextPage: true,
    }),
    listThemes: async () => ({
      items: [theme(THEME_2), theme(THEME_1)],
      hasNextPage: true,
    }),
  }), {
    novas: { limit: 2, offset: 4 },
    publicadas: { limit: 2, offset: 6 },
    temas: { limit: 2, offset: 8 },
  });
  assert.deepEqual(value.novas.items.map((item) => item.newsroomArticleId), [ARTICLE_2, ARTICLE_1]);
  assert.deepEqual(value.publicadas.items.map((item) => item.editorialArticleId), [PUBLISHED_2, PUBLISHED_1]);
  assert.deepEqual(value.temas.items.map((item) => item.id), [THEME_1, THEME_2]);
  assert.deepEqual(value.novas.pagination, { limit: 2, offset: 4, hasNextPage: true });
  assert.deepEqual(value.publicadas.pagination, { limit: 2, offset: 6, hasNextPage: true });
  assert.deepEqual(value.temas.pagination, { limit: 2, offset: 8, hasNextPage: true });
});

test("archived só é lido quando pedido explicitamente", async () => {
  const statuses: string[] = [];
  const transport = fixtureTransport({
    listThemes: async (input) => {
      statuses.push(input.status);
      return { items: [theme(THEME_1, NOW, input.status)], hasNextPage: false };
    },
  });
  const open = await successful(transport);
  const archived = await successful(transport, { temas: { status: "archived" } });
  assert.equal(open.temas.status, "open");
  assert.equal(archived.temas.status, "archived");
  assert.deepEqual(statuses, ["open", "archived"]);
});

test("enriquecimentos das coleções são feitos em lote", async () => {
  const calls = {
    classifications: 0,
    sourceThemes: 0,
    dossiers: 0,
    legacy: 0,
    bank: 0,
    articleThemes: 0,
    themeSources: 0,
    themeArticles: 0,
  };
  const articles = Array.from({ length: 20 }, (_, index) => (
    newArticle(`10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`)
  ));
  const value = await successful(fixtureTransport({
    listNewArticles: async () => ({ items: articles, hasNextPage: false }),
    readPrePublicationClassifications: async () => { calls.classifications += 1; return []; },
    readThemeSourcesByArticleIds: async () => { calls.sourceThemes += 1; return []; },
    readDossierSources: async () => { calls.dossiers += 1; return []; },
    readLegacyUsage: async () => { calls.legacy += 1; return []; },
    listPublishedArticles: async () => ({ items: [publishedArticle()], hasNextPage: false }),
    readBankContexts: async () => { calls.bank += 1; return []; },
    readThemeArticlesByArticleIds: async () => { calls.articleThemes += 1; return []; },
    listThemes: async () => ({ items: [theme()], hasNextPage: false }),
    readThemeSourcesByThemeIds: async () => { calls.themeSources += 1; return []; },
    readThemeArticlesByThemeIds: async () => { calls.themeArticles += 1; return []; },
  }));
  assert.equal(value.novas.items.length, 20);
  assert.deepEqual(calls, {
    classifications: 1,
    sourceThemes: 1,
    dossiers: 1,
    legacy: 1,
    bank: 1,
    articleThemes: 1,
    themeSources: 1,
    themeArticles: 1,
  });
});

test("transporte Supabase filtra pelas autoridades persistidas", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/redacao-automatica/newsroom-desk-read-model.ts"),
    "utf8",
  );
  assert.match(source, /newsroom_editorial_article_classifications!inner/);
  assert.match(source, /newsroom_editorial_article_classifications=is\.null/);
  assert.match(source, /matchday_editorial_bank_items\?select=source_id/);
  assert.match(source, /classification_key=eq\./);
  assert.match(source, /classification_key=is\.null/);
  assert.match(source, /newsroom_editorial_themes/);
});

test("nenhuma classificação é calculada durante a leitura", () => {
  const implementation = [
    "newsroom-desk-read-model-internal.ts",
    "newsroom-desk-read-model.ts",
  ].map((file) => readFileSync(
    path.join(process.cwd(), "lib/redacao-automatica", file),
    "utf8",
  )).join("\n");
  assert.doesNotMatch(implementation, /newsroom-deterministic-classifier/);
  assert.doesNotMatch(implementation, /classifyNewsroomArticlesDeterministically/);
});

test("implementação Supabase do read model não expõe operações de escrita", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/redacao-automatica/newsroom-desk-read-model.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /writeSupabaseAdmin/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\s*\(/);
  assert.match(source, /fetchSupabaseAdminTable/);
  assert.doesNotMatch(source, /create table|alter table|migration/i);
});
