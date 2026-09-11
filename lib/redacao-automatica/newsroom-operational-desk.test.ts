import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createOperationalDeskAutomaticClassification,
} from "@/lib/redacao-automatica/newsroom-operational-desk-classification-internal";
import {
  MESA_OPERATIONAL_CLASSIFICATION_CONTEXT,
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";
import {
  createOperationalDeskReadModel,
  type OperationalDeskArticleRecord,
  type OperationalDeskReadTransport,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

const articleA = "10000000-0000-4000-8000-000000000001";
const articleB = "10000000-0000-4000-8000-000000000002";
const snapshotA = "20000000-0000-4000-8000-000000000001";
const snapshotB = "20000000-0000-4000-8000-000000000002";
const dossierId = "30000000-0000-4000-8000-000000000001";
const dossierSourceA = "40000000-0000-4000-8000-000000000001";
const dossierSourceB = "40000000-0000-4000-8000-000000000002";
const planId = "50000000-0000-4000-8000-000000000001";
const publishedId = "60000000-0000-4000-8000-000000000001";
const packageId = "70000000-0000-4000-8000-000000000001";
const detectedAt = "2026-09-09T14:02:01Z";

function article(id: string, title: string): OperationalDeskArticleRecord {
  return {
    id,
    source_code: "record",
    source_name: "Record",
    original_url: `https://example.test/${id}`,
    normalized_url: `https://example.test/${id}`,
    title,
    subtitle: null,
    summary: null,
    published_at: null,
    first_detected_at: detectedAt,
    last_detected_at: detectedAt,
    image_url: null,
    processing_status: "ready_for_review",
  };
}

function snapshot(id: string, newsroomArticleId: string) {
  return {
    id,
    article_id: newsroomArticleId,
    content_hash: `hash-${id}`,
    body: [{ type: "paragraph", text: "Conteúdo concreto" }],
    source_metadata: {},
    extracted_at: detectedAt,
    created_at: detectedAt,
  };
}

function transport(
  overrides: Partial<OperationalDeskReadTransport> = {},
): OperationalDeskReadTransport {
  return {
    isConfigured: () => true,
    listCycleArticles: async () => [article(articleA, "Fonte A")],
    readLatestSnapshots: async () => [snapshot(snapshotA, articleA)],
    readReviewStates: async () => [],
    readClassifications: async () => [],
    readThemeSources: async () => [],
    readLegacyUsage: async () => [],
    readDossierSources: async () => [],
    readPlanAssignments: async () => [],
    readPlans: async () => [],
    readDossiers: async () => [],
    readPublishedArticles: async () => [],
    ...overrides,
  };
}

async function value(overrides: Partial<OperationalDeskReadTransport> = {}) {
  const result = await createOperationalDeskReadModel(transport(overrides))();
  if (!result.ok) assert.fail(result.error.code);
  return result.value;
}

const publishedArticle = {
  id: publishedId,
  slug: "artigo-publicado",
  title: "Artigo publicado",
  status: "published",
  published_at: "2026-09-09T15:00:00Z",
};

test("fonte do novo ciclo sem contribuição publicada é NOVA", async () => {
  const model = await value();
  assert.equal(model.novas.items[0]?.newsroomArticleId, articleA);
  assert.equal(model.novas.items[0]?.lifecycle, "new");
  assert.equal(model.publicadas.items.length, 0);
});

test("cadeia Dossier Source → Plan Source → plano → artigo published torna a fonte PUBLICADA", async () => {
  const model = await value({
    readDossierSources: async () => [{
      id: dossierSourceA,
      dossier_id: dossierId,
      newsroom_article_id: articleA,
      newsroom_snapshot_id: snapshotA,
    }],
    readPlanAssignments: async () => [{
      dossier_id: dossierId,
      article_plan_id: planId,
      dossier_source_id: dossierSourceA,
    }],
    readPlans: async () => [{
      id: planId,
      dossier_id: dossierId,
      editorial_article_id: publishedId,
    }],
    readDossiers: async () => [{
      id: dossierId,
      title: "Dossiê legacy ou novo",
      preparation_key: null,
    }],
    readPublishedArticles: async () => [publishedArticle],
  });
  assert.equal(model.novas.items.length, 0);
  assert.equal(model.publicadas.items[0]?.lifecycle, "published");
  assert.equal(model.publicadas.items[0]?.publishedContributions[0]?.origin, "dossier_plan");
});

test("Source Package legacy validado também torna a fonte PUBLICADA", async () => {
  const model = await value({
    readLegacyUsage: async () => [{
      newsroom_article_id: articleA,
      newsroom_snapshot_id: snapshotA,
      used_at: "2026-09-09T14:30:00Z",
      package_id: packageId,
      published_article_id: publishedId,
    }],
    readPublishedArticles: async () => [publishedArticle],
  });
  assert.equal(model.publicadas.items[0]?.publishedContributions[0]?.origin, "legacy_source_package");
});

test("uma publicação com N fontes transforma todas em PUBLICADAS e reutilização não regride", async () => {
  const model = await value({
    listCycleArticles: async () => [article(articleA, "Fonte A"), article(articleB, "Fonte B")],
    readLatestSnapshots: async () => [snapshot(snapshotA, articleA), snapshot(snapshotB, articleB)],
    readDossierSources: async () => [{
      id: dossierSourceA,
      dossier_id: dossierId,
      newsroom_article_id: articleA,
      newsroom_snapshot_id: snapshotA,
    }, {
      id: dossierSourceB,
      dossier_id: dossierId,
      newsroom_article_id: articleB,
      newsroom_snapshot_id: snapshotB,
    }],
    readPlanAssignments: async () => [{
      dossier_id: dossierId,
      article_plan_id: planId,
      dossier_source_id: dossierSourceA,
    }, {
      dossier_id: dossierId,
      article_plan_id: planId,
      dossier_source_id: dossierSourceB,
    }],
    readPlans: async () => [{
      id: planId,
      dossier_id: dossierId,
      editorial_article_id: publishedId,
    }],
    readDossiers: async () => [{ id: dossierId, title: "Dossiê", preparation_key: null }],
    readLegacyUsage: async () => [{
      newsroom_article_id: articleA,
      newsroom_snapshot_id: snapshotA,
      used_at: "2026-09-09T16:00:00Z",
      package_id: packageId,
      published_article_id: publishedId,
    }],
    readPublishedArticles: async () => [publishedArticle],
  });
  assert.equal(model.publicadas.items.length, 2);
  assert.deepEqual(
    model.publicadas.items.map((item) => item.newsroomArticleId).sort(),
    [articleA, articleB],
  );
  assert.equal(model.publicadas.items.every((item) => item.lifecycle === "published"), true);
});

test("estados legacy não criam terceiro estado e artigo histórico isolado não povoa PUBLICADAS", async () => {
  const model = await value({
    readReviewStates: async () => [{
      newsroom_article_id: articleA,
      decision: "working",
      reviewed_snapshot_id: snapshotA,
      reviewed_at: detectedAt,
    }],
    readPublishedArticles: async () => [publishedArticle],
  });
  assert.equal(model.novas.items[0]?.lifecycle, "new");
  assert.deepEqual(
    [...new Set([...model.novas.items, ...model.publicadas.items].map((item) => item.lifecycle))],
    ["new"],
  );
});

test("corte usa first_detected_at e nunca last_detected_at", async () => {
  const beforeCut = article(articleA, "Fonte antiga");
  const result = await createOperationalDeskReadModel(transport({
    listCycleArticles: async () => [{
      ...beforeCut,
      first_detected_at: "2026-09-09T14:01:59Z",
      last_detected_at: "2027-01-01T00:00:00Z",
    }],
  }))();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "relation_invalid");

  const implementation = readFileSync(
    "lib/redacao-automatica/newsroom-operational-desk-read-model.ts",
    "utf8",
  );
  assert.match(implementation, /first_detected_at=gte/);
  assert.doesNotMatch(implementation, /last_detected_at=gte/);
});

test("contadores são reais por estado e classificação", async () => {
  const model = await value({
    listCycleArticles: async () => [article(articleA, "Fonte A"), article(articleB, "Fonte B")],
    readLatestSnapshots: async () => [snapshot(snapshotA, articleA), snapshot(snapshotB, articleB)],
    readClassifications: async () => [{
      newsroom_article_id: articleA,
      classification_key: "benfica",
      classification_source: "automatic",
      classified_at: detectedAt,
      updated_at: detectedAt,
    }],
  });
  assert.deepEqual(model.counts.novas, {
    total: 2,
    benfica: 1,
    sporting: 0,
    fc_porto: 0,
    other_liga_clubs: 0,
    outside_liga_other: 0,
    unclassified: 1,
  });
});

test("dismissed retira só o snapshot decidido e não apaga a fonte", async () => {
  const dismissed = await value({
    readReviewStates: async () => [{
      newsroom_article_id: articleA,
      decision: "dismissed",
      reviewed_snapshot_id: snapshotA,
      reviewed_at: detectedAt,
    }],
  });
  assert.equal(dismissed.counts.novas.total, 0);

  const refreshed = await value({
    readReviewStates: async () => [{
      newsroom_article_id: articleA,
      decision: "dismissed",
      reviewed_snapshot_id: snapshotB,
      reviewed_at: detectedAt,
    }],
  });
  assert.equal(refreshed.novas.items[0]?.newsroomArticleId, articleA);
});

test("classificação automática só tenta fontes criadas no ciclo e usa a época fixa", async () => {
  const calls: Array<{ seasonId: string; newsroomArticleId: string }> = [];
  const classify = createOperationalDeskAutomaticClassification({
    classify: async (input) => {
      calls.push(input);
      return {
        ok: true,
        value: {
          seasonId: input.seasonId,
          classification: {},
          persistence: { status: "no_confident_replacement", mutation: null },
        },
      } as never;
    },
  });
  const ambiguous = await classify({
    newsroomArticleId: articleA,
    articleAction: "created",
    firstDetectedAt: detectedAt,
  });
  assert.equal(ambiguous.status, "unclassified");
  assert.equal(calls[0]?.seasonId, MESA_OPERATIONAL_CLASSIFICATION_CONTEXT.seasonId);
  assert.equal(MESA_OPERATIONAL_CYCLE_STARTED_AT, "2026-09-09T14:02:00Z");

  await classify({
    newsroomArticleId: articleA,
    articleAction: "updated",
    firstDetectedAt: detectedAt,
  });
  await classify({
    newsroomArticleId: articleA,
    articleAction: "created",
    firstDetectedAt: "2026-09-09T14:01:59Z",
  });
  assert.equal(calls.length, 1);
});

test("classificação segura persiste e manual é reconhecida como soberana", async () => {
  for (const [persistence, expected] of [
    [{ status: "applied", mutation: {} }, "classified"],
    [{ status: "manual_override_preserved", mutation: {} }, "manual_preserved"],
  ] as const) {
    const classify = createOperationalDeskAutomaticClassification({
      classify: async (input) => ({
        ok: true,
        value: { seasonId: input.seasonId, classification: {}, persistence },
      }) as never,
    });
    const result = await classify({
      newsroomArticleId: articleA,
      articleAction: "created",
      firstDetectedAt: detectedAt,
    });
    assert.equal(result.status, expected);
  }
});

test("todas as portas de persistência do circuito ligam a tentativa automática ao writer central", () => {
  const persistence = readFileSync(
    "lib/redacao-automatica/newsroom-article-persistence.ts",
    "utf8",
  );
  const manual = readFileSync(
    "lib/redacao-automatica/manual-newsroom-entry-service.ts",
    "utf8",
  );
  const operational = readFileSync(
    "lib/redacao-automatica/newsroom-operational-desk-classification.ts",
    "utf8",
  );
  assert.match(persistence, /attemptOperationalDeskAutomaticClassification/);
  assert.match(manual, /attemptOperationalDeskAutomaticClassification/);
  assert.match(operational, /validateOperationalDeskCycleSourceIds/);
  assert.match(operational, /MESA_OPERATIONAL_CLASSIFICATION_CONTEXT\.seasonId/);
  assert.doesNotMatch(operational, /is_current|currentSeason|Date\.now/);
});

test("POR CLASSIFICAR é bloqueado no servidor antes de PREPARAR", () => {
  const route = readFileSync(
    "app/api/admin/editorial/redacao-automatica/mesa/preparar/route.ts",
    "utf8",
  );
  const classificationCheck = route.indexOf("getNewsroomArticleClassificationsByIds");
  const prepare = route.indexOf("prepareEditorialDossierWorkspace(input)");
  assert.ok(classificationCheck >= 0 && classificationCheck < prepare);
  assert.match(route, /classification_required/);
  assert.match(route, /POR CLASSIFICAR/);
});

test("DESCARTAR é otimista, repõe na falha e persiste dismissed sem apagar fonte", () => {
  const client = readFileSync(
    "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
    "utf8",
  );
  const route = readFileSync(
    "app/api/admin/editorial/redacao-automatica/mesa/source/route.ts",
    "utf8",
  );
  assert.ok(client.indexOf("setDismissed") < client.indexOf("await fetch(DISCARD_ROUTE"));
  assert.match(client, /setDismissed\(\(current\) => current\.filter/);
  assert.match(route, /applyNewsroomEditorialInboxAction\("dismissed"/);
  assert.doesNotMatch(route, /delete|removeNewsroomArticle|\.delete\(/i);
});
