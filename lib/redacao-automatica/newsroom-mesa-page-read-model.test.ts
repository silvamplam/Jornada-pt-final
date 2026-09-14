import assert from "node:assert/strict";
import test from "node:test";

import {
  createMesaPageReadModel,
  type MesaPageIdentity,
  type MesaPageReadTransport,
} from "@/lib/redacao-automatica/newsroom-mesa-page-read-model-internal";
import type {
  OperationalDeskSourceItem,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

const detectedAt = "2026-09-14T12:00:00.000Z";

function uuid(index: number): string {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function identity(
  index: number,
  lifecycle: "new" | "published" = "new",
  classificationKey: MesaPageIdentity["classification_key"] = index % 2 === 0 ? "benfica" : null,
): MesaPageIdentity {
  return {
    newsroom_article_id: uuid(index),
    lifecycle,
    classification_key: classificationKey,
    last_detected_at: new Date(Date.parse(detectedAt) - index * 1_000).toISOString(),
  };
}

function source(row: MesaPageIdentity): OperationalDeskSourceItem {
  return {
    lifecycle: row.lifecycle,
    newsroomArticleId: row.newsroom_article_id,
    sourceCode: "record",
    sourceName: "Record",
    url: `https://example.test/${row.newsroom_article_id}`,
    title: row.newsroom_article_id,
    subtitle: null,
    summary: null,
    imageCandidateUrl: null,
    publishedAt: null,
    firstDetectedAt: detectedAt,
    lastDetectedAt: row.last_detected_at,
    snapshot: null,
    classification: row.classification_key ? {
      status: "classified",
      classificationKey: row.classification_key,
      classificationSource: "automatic",
      classifiedAt: detectedAt,
      updatedAt: detectedAt,
    } : {
      status: "unclassified",
      classificationKey: null,
      classificationSource: null,
      classifiedAt: null,
      updatedAt: null,
    },
    themeMembership: { status: "none", themeIds: [] },
    publishedContributions: [],
    sourceUpdated: false,
    dossierMembership: [],
    comparisonSnapshotId: null,
    sourceUpdatedAt: null,
  };
}

const counts = {
  novas: {
    total: 0,
    benfica: 0,
    sporting: 0,
    fc_porto: 0,
    other_liga_clubs: 0,
    outside_liga_other: 0,
    unclassified: 0,
  },
  publicadas: {
    total: 0,
    benfica: 0,
    sporting: 0,
    fc_porto: 0,
    other_liga_clubs: 0,
    outside_liga_other: 0,
    unclassified: 0,
  },
} as const;

function transport(universe: readonly MesaPageIdentity[]) {
  const calls: Array<Readonly<{
    kind: string;
    ids?: readonly string[];
    limit?: number;
    offset?: number;
    lifecycle?: "new" | "published";
    sourceCode?: string | null;
  }>> = [];
  const value: MesaPageReadTransport = {
    isConfigured: () => true,
    readCounts: async (sourceCode) => {
      calls.push({ kind: "counts", sourceCode });
      return counts;
    },
    readPageIdentities: async (input) => {
      calls.push({
        kind: "identities",
        limit: input.pagination.limit,
        offset: input.pagination.offset,
        lifecycle: input.lifecycle,
        sourceCode: input.sourceCode,
      });
      const filtered = universe.filter((row) => (
        row.lifecycle === input.lifecycle
        && (input.classification.mode === "all"
          || (input.classification.mode === "unclassified"
            ? row.classification_key === null
            : row.classification_key === input.classification.classificationKey))
      ));
      return filtered.slice(
        input.pagination.offset,
        input.pagination.offset + input.pagination.limit + 1,
      );
    },
    hydrateSources: async (ids) => {
      calls.push({ kind: "hydrate", ids });
      const byId = new Map(universe.map((row) => [row.newsroom_article_id, row]));
      return ids.map((id) => source(byId.get(id)!));
    },
  };
  return { value, calls };
}

for (const size of [0, 1, 23, 24, 25, 48, 49, 101, 501]) {
  test(`pagina todo o universo sem omissões ou duplicações (${size})`, async () => {
    const universe = Array.from({ length: size }, (_, index) => identity(index + 1));
    const collected: string[] = [];
    for (let offset = 0; ;) {
      const fake = transport(universe);
      const result = await createMesaPageReadModel(fake.value)({
        lifecycle: "new",
        classification: { mode: "all" },
        sourceCode: null,
        pagination: { limit: 24, offset },
      });
      assert.equal(result.ok, true);
      collected.push(...result.value.page.items.map((item) => item.newsroomArticleId));
      const hydrated = fake.calls.find((call) => call.kind === "hydrate");
      assert.ok((hydrated?.ids?.length ?? 0) <= 24);
      if (!result.value.page.pagination.hasNextPage) break;
      offset += 24;
    }
    assert.deepEqual(collected, universe.map((row) => row.newsroom_article_id));
    assert.equal(new Set(collected).size, size);
  });
}

test("filtra e pagina na origem antes de hidratar", async () => {
  const universe = Array.from({ length: 100 }, (_, index) => identity(index + 1));
  const fake = transport(universe);
  const result = await createMesaPageReadModel(fake.value)({
    lifecycle: "new",
    classification: { mode: "classified", classificationKey: "benfica" },
    sourceCode: "record",
    pagination: { limit: 24, offset: 24 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls.map((call) => call.kind), ["counts", "identities", "hydrate"]);
  assert.equal(fake.calls[1]?.limit, 24);
  assert.equal(fake.calls[1]?.offset, 24);
  assert.deepEqual(
    fake.calls[2]?.ids,
    universe.filter((row) => row.classification_key === "benfica")
      .slice(24, 48).map((row) => row.newsroom_article_id),
  );
});

test("preserva a ordem autoritativa das identidades mesmo se a hidratação regressar noutra ordem", async () => {
  const universe = [identity(1, "published"), identity(2, "published"), identity(3, "published")];
  const fake = transport(universe);
  fake.value.hydrateSources = async (ids) => [...ids].reverse().map((id) => (
    source(universe.find((row) => row.newsroom_article_id === id)!)
  ));
  const result = await createMesaPageReadModel(fake.value)({
    lifecycle: "published",
    classification: { mode: "all" },
    sourceCode: null,
    pagination: { limit: 24, offset: 0 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.page.items.map((item) => item.newsroomArticleId),
    universe.map((row) => row.newsroom_article_id),
  );
});

test("counts são globais e independentes da página pedida", async () => {
  const universe = Array.from({ length: 99 }, (_, index) => identity(index + 1));
  const fake = transport(universe);
  fake.value.readCounts = async () => ({
    novas: { ...counts.novas, total: 700, benfica: 300, unclassified: 400 },
    publicadas: { ...counts.publicadas, total: 90, sporting: 90 },
  });
  const result = await createMesaPageReadModel(fake.value)({
    lifecycle: "new",
    classification: { mode: "unclassified" },
    sourceCode: null,
    pagination: { limit: 24, offset: 24 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.counts.novas.total, 700);
  assert.equal(result.value.counts.publicadas.sporting, 90);
  assert.equal(result.value.page.items.length, 24);
  assert.equal(result.value.page.pagination.hasNextPage, true);
});

test("preserva todos os filtros editoriais, sourceCode e ambos os lifecycles", async () => {
  const keys = [
    null,
    "benfica",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ] as const;
  const universe = keys.flatMap((classificationKey, index) => [
    identity(index + 1, "new", classificationKey),
    identity(index + 101, "published", classificationKey),
  ]).sort((left, right) => Date.parse(right.last_detected_at) - Date.parse(left.last_detected_at));
  const filters = [
    { mode: "all" as const },
    { mode: "unclassified" as const },
    ...keys.flatMap((classificationKey) => classificationKey
      ? [{ mode: "classified" as const, classificationKey }]
      : []),
  ];

  for (const lifecycle of ["new", "published"] as const) {
    for (const classification of filters) {
      const fake = transport(universe);
      const result = await createMesaPageReadModel(fake.value)({
        lifecycle,
        classification,
        sourceCode: "record",
        pagination: { limit: 24, offset: 0 },
      });
      assert.equal(result.ok, true);
      const identityCall = fake.calls.find((call) => call.kind === "identities");
      assert.equal(identityCall?.lifecycle, lifecycle);
      assert.equal(identityCall?.sourceCode, "record");
      assert.equal(fake.calls.find((call) => call.kind === "counts")?.sourceCode, "record");
      assert.ok(result.value.page.items.every((item) => {
        if (classification.mode === "all") return item.lifecycle === lifecycle;
        if (classification.mode === "unclassified") return item.classification.status === "unclassified";
        return item.classification.status === "classified"
          && item.classification.classificationKey === classification.classificationKey;
      }));
    }
  }
});

test("falha fechada se identidade paginada e hidratação divergirem", async () => {
  const universe = [identity(1, "new", "sporting")];
  const fake = transport(universe);
  fake.value.hydrateSources = async () => [source(identity(1, "published", "sporting"))];
  const lifecycleMismatch = await createMesaPageReadModel(fake.value)({
    lifecycle: "new",
    classification: { mode: "classified", classificationKey: "sporting" },
    sourceCode: null,
    pagination: { limit: 24, offset: 0 },
  });
  assert.deepEqual(lifecycleMismatch, {
    ok: false,
    error: {
      code: "relation_invalid",
      message: "A Mesa encontrou uma relação editorial persistida inválida.",
    },
  });

  const classificationFake = transport(universe);
  classificationFake.value.hydrateSources = async () => [source(identity(1, "new", "benfica"))];
  const classificationMismatch = await createMesaPageReadModel(classificationFake.value)({
    lifecycle: "new",
    classification: { mode: "classified", classificationKey: "sporting" },
    sourceCode: null,
    pagination: { limit: 24, offset: 0 },
  });
  assert.equal(classificationMismatch.ok, false);
  assert.equal(classificationMismatch.error.code, "relation_invalid");
});
