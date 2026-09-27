import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EMPTY_MESA_PREPARATION_BUFFER,
  mesaExplicitArticleIds,
  selectMesaMaterial,
} from "@/app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";
import { mesaPackageUsage } from "./newsroom-mesa-editorial-groups";
import { createMesaPageReadModel } from "./newsroom-mesa-page-read-model-internal";
import {
  createOperationalDeskReadModel,
  type OperationalDeskReadTransport,
} from "./newsroom-operational-desk-read-model-internal";

const migration = readFileSync(
  "supabase/migrations/20260926224911_restore_legacy_mesa_lifecycle_publications.sql",
  "utf8",
);

test("legacy publication evidence affects lifecycle only, not canonical article identity", () => {
  assert.match(migration, /create or replace function public\.newsroom_mesa_source_candidates_v1/);
  assert.match(migration, /legacy_publications as materialized/);
  assert.match(migration, /public\.newsroom_editorial_article_sources relation/);
  assert.match(
    migration,
    /or exists \(\s*select 1\s*from legacy_publications legacy[\s\S]*?legacy\.newsroom_article_id = article\.id::text/,
  );

  assert.doesNotMatch(migration, /create or replace function public\.newsroom_mesa_global_article_candidates_v1/);
  assert.doesNotMatch(migration, /create or replace function public\.newsroom_mesa_theme_summaries_v1/);
  assert.equal((migration.match(/create or replace function public\.newsroom_mesa_source_candidates_v1/g) ?? []).length, 1);
  assert.equal((migration.match(/legacy_publications as materialized/g) ?? []).length, 1);
  assert.equal((migration.match(/candidates as materialized/g) ?? []).length, 1);
  assert.equal((migration.match(/\$function\$;/g) ?? []).length, 1);
  assert.equal((migration.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^commit;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^notify pgrst, 'reload schema';/gm) ?? []).length, 1);
  assert.doesNotMatch(migration, /insert into public\.newsroom_editorial_article_sources/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.newsroom_editorial_article_sources/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.newsroom_editorial_article_sources/i);
});

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const detectedAt = "2026-09-26T12:00:00Z";
const sourceIds = [id(2), id(1)];
const publishedArticle = {
  id: id(50), slug: "legacy", title: "Artigo legacy", status: "published", published_at: detectedAt,
};
const emptyCounts = {
  total: 0, benfica: 0, sporting: 0, fc_porto: 0, other_liga_clubs: 0,
  outside_liga_other: 0, unclassified: 0,
};

function legacyManifest(version = 4, proof: "entry" | "output" = "entry") {
  const publication = { publishedArticleId: publishedArticle.id, usedAt: detectedAt };
  return {
    version, packageId: id(90), year: "2026", month: "09",
    entries: sourceIds.map((sourceId, index) => ({
      newsroomArticleId: sourceId, newsroomSnapshotId: id(100 + index),
      articlePosition: 1, status: "prepared",
      ...(proof === "entry" ? publication : {}),
    })),
    outputs: proof === "output" ? [{ sourceArticlePosition: 1, ...publication }] : [],
  };
}

function fixture({
  manifest = legacyManifest() as unknown,
  packageCreatedAt = detectedAt,
  firstDetectedAt = detectedAt,
  overrides = {} as Partial<OperationalDeskReadTransport>,
} = {}) {
  const transport: OperationalDeskReadTransport = {
    isConfigured: () => true,
    listCycleArticles: async (_sourceCode, ids) => {
      assert.deepEqual(ids, sourceIds);
      return sourceIds.map((sourceId) => ({
        id: sourceId, source_code: "fixture", source_name: null, original_url: null,
        normalized_url: null, title: "Fonte legacy", subtitle: null, summary: null,
        published_at: null, first_detected_at: firstDetectedAt, last_detected_at: detectedAt,
        image_url: null, processing_status: "ready_for_review",
      }));
    },
    readLatestSnapshots: async () => [],
    readReviewStates: async () => [],
    readClassifications: async () => [],
    readThemeSources: async () => [],
    readLegacyUsage: async () => mesaPackageUsage(manifest).map((usage) => ({
      newsroom_article_id: usage.newsroomArticleId,
      newsroom_snapshot_id: usage.newsroomSnapshotId,
      used_at: usage.usedAt,
      package_id: usage.packageId,
      package_created_at: packageCreatedAt,
      published_article_id: usage.publishedArticleId,
    })),
    readArticleSources: async () => [],
    readDossierSources: async () => [],
    readPlanAssignments: async () => [],
    readPlans: async () => [],
    readDossiers: async () => [],
    readPublishedArticles: async (ids) => ids.includes(publishedArticle.id) ? [publishedArticle] : [],
    ...overrides,
  };
  const loadDesk = createOperationalDeskReadModel(transport);
  const loadPage = createMesaPageReadModel({
    isConfigured: () => true,
    readCounts: async () => ({
      novas: emptyCounts,
      publicadas: { ...emptyCounts, total: sourceIds.length, unclassified: sourceIds.length },
    }),
    readPageIdentities: async () => sourceIds.map((sourceId) => ({
      newsroom_article_id: sourceId, lifecycle: "published", classification_key: null,
      last_detected_at: detectedAt,
    })),
    hydrateSources: async (ids) => {
      const hydrated = await loadDesk({ sourceIds: ids });
      assert.ok(hydrated.ok);
      return hydrated.value.sources;
    },
  });
  return {
    desk: () => loadDesk({ sourceIds }),
    page: () => loadPage({
      lifecycle: "published", classification: { mode: "all" }, sourceCode: null,
      pagination: { limit: 24, offset: 0 },
    }),
  };
}

for (const [version, proof] of [[2, "entry"], [3, "entry"], [4, "entry"], [4, "output"]] as const) {
  test(`PUBLICADAS hidrata prova legacy v${version}/${proof} sem inferir continuidade canónica`, async () => {
    const readers = fixture({ manifest: legacyManifest(version, proof) });
    const desk = await readers.desk();
    assert.ok(desk.ok);
    assert.equal(desk.value.counts.novas.total, 0);
    assert.equal(desk.value.counts.publicadas.total, sourceIds.length);

    const page = await readers.page();
    assert.ok(page.ok);
    assert.deepEqual(page.value.page.items.map((source) => source.newsroomArticleId), sourceIds);
    for (const source of page.value.page.items) {
      assert.equal(source.lifecycle, "published");
      assert.equal(source.comparisonSnapshotId, null);
      const selection = selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER, {
        kind: "source", lifecycle: source.lifecycle, newsroomArticleId: source.newsroomArticleId,
        newsroomSnapshotId: id(100), classificationKey: null, title: source.title,
        sourceLabel: "Fixture", imageUrl: null,
        relatedArticleIds: source.publishedContributions.map((contribution) => contribution.editorialArticleId),
      }, () => id(99));
      assert.deepEqual(source.publishedContributions, []);
      assert.deepEqual(mesaExplicitArticleIds(selection), []);
    }
  });
}

test("continuidade canónica existente permanece autoritativa perante prova legacy de outro artigo", async () => {
  for (const canonicalId of [publishedArticle.id, id(51)]) {
    const result = await fixture({ overrides: {
      readArticleSources: async () => sourceIds.map((sourceId) => ({
        newsroom_article_id: sourceId, editorial_article_id: canonicalId,
      })),
      readPublishedArticles: async () => canonicalId === publishedArticle.id
        ? [publishedArticle] : [publishedArticle, { ...publishedArticle, id: canonicalId }],
    } }).desk();
    assert.ok(result.ok);
    for (const source of result.value.sources) {
      assert.equal(source.lifecycle, "published");
      assert.deepEqual(source.publishedContributions.map((contribution) => contribution.editorialArticleId), [canonicalId]);
      assert.equal(source.publishedContributions[0].origin,
        canonicalId === publishedArticle.id ? "legacy_source_package" : "article_continuity");
    }
  }
});

const manifest = legacyManifest();
for (const [name, options] of [
  ["artigo não publicado", { overrides: { readPublishedArticles: async () => [] } }],
  ["pacote anterior à fonte", { packageCreatedAt: "2026-09-25T12:00:00Z" }],
  ["pacote anterior ao ciclo", { packageCreatedAt: "2026-09-08T12:00:00Z", firstDetectedAt: "2026-09-07T12:00:00Z" }],
  ["entrada sem usedAt", { manifest: { ...manifest, entries: manifest.entries.map((entry) => ({ ...entry, usedAt: null })) } }],
  ["entrada não preparada", { manifest: { ...manifest, entries: manifest.entries.map((entry) => ({ ...entry, status: "failed" })) } }],
  ["manifesto Mesa v2", { manifest: { ...manifest, version: 5, provenanceContract: "mesa-v2" } }],
] as const) {
  test(`prova inválida (${name}) não publica e divergência real continua a falhar fechada`, async () => {
    const readers = fixture(options);
    const desk = await readers.desk();
    assert.ok(desk.ok);
    assert.ok(desk.value.sources.every((source) => source.lifecycle === "new"));
    assert.ok(desk.value.sources.every((source) => source.publishedContributions.length === 0));
    const page = await readers.page();
    assert.equal(page.ok, false);
    if (!page.ok) assert.equal(page.error.code, "relation_invalid");
  });
}

test("prova legacy válida não encobre divergência de classificação da Mesa", async () => {
  const page = await fixture({ overrides: {
    readClassifications: async () => sourceIds.map((sourceId) => ({
      newsroom_article_id: sourceId, classification_key: "sporting", classification_source: "manual",
      classified_at: detectedAt, updated_at: detectedAt,
    })),
  } }).page();
  assert.equal(page.ok, false);
  if (!page.ok) assert.equal(page.error.code, "relation_invalid");
});
