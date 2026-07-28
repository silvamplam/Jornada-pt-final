import assert from "node:assert/strict";
import test from "node:test";

import {
  createEditorialDossierService,
  updateEditorialDossierService,
  type EditorialDossierInsert,
  type EditorialDossierSourceCandidate,
  type EditorialDossierSourceInsert,
  type EditorialDossierTransport,
  type EditorialDossierUpdate,
} from "@/lib/redacao-automatica/editorial-dossier-service-internal";

const dossierId = "00000000-0000-4000-8000-000000000001";
const sourceOneId = "00000000-0000-4000-8000-000000000011";
const sourceTwoId = "00000000-0000-4000-8000-000000000012";
const snapshotOneId = "00000000-0000-4000-8000-000000000021";
const snapshotTwoId = "00000000-0000-4000-8000-000000000022";

function candidate(
  id: string,
  snapshotId: string,
  processingStatus: EditorialDossierSourceCandidate["processingStatus"] = "detected",
): EditorialDossierSourceCandidate {
  return {
    id,
    title: `Fonte ${id}`,
    processingStatus,
    snapshot: {
      id: snapshotId,
      body: [{ type: "paragraph", text: "Informação normalizada." }],
    },
  };
}

function fakeTransport(overrides: Partial<EditorialDossierTransport> = {}) {
  let uuidIndex = 0;
  const insertedDossiers: EditorialDossierInsert[] = [];
  const insertedSources: Array<readonly EditorialDossierSourceInsert[]> = [];
  const deletedDossiers: string[] = [];
  const updates: Array<{ id: string; payload: EditorialDossierUpdate }> = [];
  const ids = [
    dossierId,
    "00000000-0000-4000-8000-000000000031",
    "00000000-0000-4000-8000-000000000032",
  ];

  const transport: EditorialDossierTransport = {
    isConfigured: () => true,
    randomUuid: () => ids[uuidIndex++] ?? crypto.randomUUID(),
    readSourceCandidates: async (articleIds) => articleIds.map((id) => (
      id === sourceOneId
        ? candidate(sourceOneId, snapshotOneId)
        : candidate(sourceTwoId, snapshotTwoId, "ready_for_review")
    )),
    insertDossier: async (payload) => {
      insertedDossiers.push(payload);
      return { id: payload.id, title: payload.title };
    },
    insertSources: async (payload) => {
      insertedSources.push(payload);
      return payload.length;
    },
    deleteDossier: async (id) => {
      deletedDossiers.push(id);
    },
    updateDossier: async (id, payload) => {
      updates.push({ id, payload });
      return { id, title: payload.title };
    },
    ...overrides,
  };

  return {
    transport,
    insertedDossiers,
    insertedSources,
    deletedDossiers,
    updates,
  };
}

test("cria um Dossiê com vários snapshots congelados, ordem e papel editorial", async () => {
  const fake = fakeTransport();
  const create = createEditorialDossierService(fake.transport);

  const result = await create({
    title: "  Dossiê FC Porto  ",
    editorialInstructions: "  Começar pelo facto principal. ",
    contextInstructions: "  Enquadrar no próximo jogo. ",
    sources: [
      { newsroomArticleId: sourceTwoId, priority: 20, sourceRole: "corroboration" },
      { newsroomArticleId: sourceOneId, priority: 10, sourceRole: "complementary" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(fake.insertedDossiers.length, 1);
  assert.deepEqual(fake.insertedDossiers[0], {
    id: dossierId,
    title: "Dossiê FC Porto",
    status: "draft",
    editorial_instructions: "Começar pelo facto principal.",
    context_instructions: "Enquadrar no próximo jogo.",
    output_mode: "single",
    output_count: 1,
    length_mode: "standard",
    article_kind: "news",
    output_language: "pt-PT",
  });
  assert.equal(fake.insertedSources.length, 1);
  assert.deepEqual(
    fake.insertedSources[0].map((source) => ({
      article: source.newsroom_article_id,
      snapshot: source.newsroom_snapshot_id,
      role: source.source_role,
      order: source.sort_order,
    })),
    [
      {
        article: sourceOneId,
        snapshot: snapshotOneId,
        role: "primary",
        order: 10,
      },
      {
        article: sourceTwoId,
        snapshot: snapshotTwoId,
        role: "corroboration",
        order: 20,
      },
    ],
  );
});

test("preserva o papel principal explicitamente definido", async () => {
  const fake = fakeTransport();
  const create = createEditorialDossierService(fake.transport);

  const result = await create({
    title: "Dossiê",
    editorialInstructions: "",
    contextInstructions: "",
    sources: [
      { newsroomArticleId: sourceOneId, priority: 1, sourceRole: "context" },
      { newsroomArticleId: sourceTwoId, priority: 2, sourceRole: "primary" },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    fake.insertedSources[0].map((source) => source.source_role),
    ["context", "primary"],
  );
});

test("deduplica a mesma fonte antes de persistir", async () => {
  const fake = fakeTransport();
  const create = createEditorialDossierService(fake.transport);

  const result = await create({
    title: "Dossiê",
    editorialInstructions: "",
    contextInstructions: "",
    sources: [
      { newsroomArticleId: sourceOneId, priority: 1, sourceRole: "primary" },
      { newsroomArticleId: sourceOneId, priority: 2, sourceRole: "complementary" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(fake.insertedSources[0].length, 1);
});

test("recusa fontes sem snapshot, estados impróprios e pedidos sem fontes", async () => {
  const noSnapshot = fakeTransport({
    readSourceCandidates: async () => [{
      ...candidate(sourceOneId, snapshotOneId),
      snapshot: null,
    }],
  });
  const createNoSnapshot = createEditorialDossierService(noSnapshot.transport);
  const missingSnapshotResult = await createNoSnapshot({
    title: "Dossiê",
    editorialInstructions: "",
    contextInstructions: "",
    sources: [{ newsroomArticleId: sourceOneId, priority: 1, sourceRole: "primary" }],
  });

  assert.equal(missingSnapshotResult.ok, false);
  if (!missingSnapshotResult.ok) {
    assert.equal(missingSnapshotResult.error.code, "source_snapshot_missing");
  }

  const rejected = fakeTransport({
    readSourceCandidates: async () => [candidate(sourceOneId, snapshotOneId, "rejected")],
  });
  const createRejected = createEditorialDossierService(rejected.transport);
  const rejectedResult = await createRejected({
    title: "Dossiê",
    editorialInstructions: "",
    contextInstructions: "",
    sources: [{ newsroomArticleId: sourceOneId, priority: 1, sourceRole: "primary" }],
  });

  assert.equal(rejectedResult.ok, false);
  if (!rejectedResult.ok) {
    assert.equal(rejectedResult.error.code, "source_not_eligible");
  }

  const empty = fakeTransport();
  const emptyResult = await createEditorialDossierService(empty.transport)({
    title: "Dossiê",
    editorialInstructions: "",
    contextInstructions: "",
    sources: [],
  });

  assert.equal(emptyResult.ok, false);
  if (!emptyResult.ok) {
    assert.equal(emptyResult.error.code, "input_invalid");
  }
});

test("remove o Dossiê por compensação quando o lote de fontes falha", async () => {
  const fake = fakeTransport({
    insertSources: async () => {
      throw new Error("falha controlada");
    },
  });
  const result = await createEditorialDossierService(fake.transport)({
    title: "Dossiê",
    editorialInstructions: "",
    contextInstructions: "",
    sources: [{ newsroomArticleId: sourceOneId, priority: 1, sourceRole: "primary" }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "dossier_creation_failed");
  }
  assert.deepEqual(fake.deletedDossiers, [dossierId]);
});

test("atualiza orientações e preferências sem publicar nem gerar conteúdo", async () => {
  const fake = fakeTransport();
  const update = updateEditorialDossierService(fake.transport);

  const result = await update({
    dossierId,
    title: "Dossiê atualizado",
    editorialInstructions: "Dar prioridade à informação oficial.",
    contextInstructions: "Explicar o momento competitivo.",
    outputMode: "multiple",
    outputCount: 3,
    lengthMode: "developed",
    articleKind: "analysis",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(fake.updates, [{
    id: dossierId,
    payload: {
      title: "Dossiê atualizado",
      editorial_instructions: "Dar prioridade à informação oficial.",
      context_instructions: "Explicar o momento competitivo.",
      output_mode: "multiple",
      output_count: 3,
      length_mode: "developed",
      article_kind: "analysis",
      output_language: "pt-PT",
    },
  }]);
});

test("impede combinações inválidas entre modo e quantidade de artigos", async () => {
  const fake = fakeTransport();
  const update = updateEditorialDossierService(fake.transport);

  const result = await update({
    dossierId,
    title: "Dossiê",
    editorialInstructions: "",
    contextInstructions: "",
    outputMode: "single",
    outputCount: 2,
    lengthMode: "standard",
    articleKind: "news",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
  }
});
