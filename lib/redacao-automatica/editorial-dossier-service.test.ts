import assert from "node:assert/strict";
import test from "node:test";

import {
  addEditorialDossierSourcesService,
  createEditorialDossierService,
  manageEditorialDossierSourcesService,
  updateEditorialDossierService,
  type EditorialDossierInsert,
  type EditorialDossierSourceCandidate,
  type EditorialDossierSourceInsert,
  type EditorialDossierSourceState,
  type EditorialDossierSourceUpsert,
  type EditorialDossierTransport,
  type EditorialDossierUpdate,
} from "@/lib/redacao-automatica/editorial-dossier-service-internal";

const dossierId = "00000000-0000-4000-8000-000000000001";
const sourceOneId = "00000000-0000-4000-8000-000000000011";
const sourceTwoId = "00000000-0000-4000-8000-000000000012";
const snapshotOneId = "00000000-0000-4000-8000-000000000021";
const snapshotTwoId = "00000000-0000-4000-8000-000000000022";
const dossierSourceOneId = "00000000-0000-4000-8000-000000000041";
const dossierSourceTwoId = "00000000-0000-4000-8000-000000000042";

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


function sourceState(
  id: string,
  articleId: string,
  snapshotId: string,
  sortOrder: number,
  sourceRole: EditorialDossierSourceState["sourceRole"] = "complementary",
): EditorialDossierSourceState {
  return {
    id,
    dossierId,
    newsroomArticleId: articleId,
    newsroomSnapshotId: snapshotId,
    sourceRole,
    sortOrder,
    editorialNote: null,
    included: true,
  };
}

function fakeTransport(overrides: Partial<EditorialDossierTransport> = {}) {
  let uuidIndex = 0;
  const insertedDossiers: EditorialDossierInsert[] = [];
  const insertedSources: Array<readonly EditorialDossierSourceInsert[]> = [];
  const upsertedSources: Array<readonly EditorialDossierSourceUpsert[]> = [];
  const deletedDossiers: string[] = [];
  const touchedDossiers: string[] = [];
  const updates: Array<{ id: string; payload: EditorialDossierUpdate }> = [];
  const currentSources: readonly EditorialDossierSourceState[] = [
    sourceState(dossierSourceOneId, sourceOneId, snapshotOneId, 10, "primary"),
    sourceState(dossierSourceTwoId, sourceTwoId, snapshotTwoId, 20, "corroboration"),
  ];
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
    readDossierSources: async () => currentSources,
    insertDossier: async (payload) => {
      insertedDossiers.push(payload);
      return { id: payload.id, title: payload.title };
    },
    insertSources: async (payload) => {
      insertedSources.push(payload);
      return payload.length;
    },
    upsertSources: async (payload) => {
      upsertedSources.push(payload);
      return payload.length;
    },
    touchDossier: async (id) => {
      touchedDossiers.push(id);
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
    upsertedSources,
    deletedDossiers,
    touchedDossiers,
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

test("gere ordem, papel, nota e inclusão sem substituir artigos ou snapshots", async () => {
  const fake = fakeTransport();
  const manage = manageEditorialDossierSourcesService(fake.transport);

  const result = await manage({
    dossierId,
    sources: [
      {
        sourceId: dossierSourceTwoId,
        priority: 1,
        sourceRole: "primary",
        editorialNote: "  Confirmar o resultado e a duração. ",
        included: true,
      },
      {
        sourceId: dossierSourceOneId,
        priority: 2,
        sourceRole: "context",
        editorialNote: " ",
        included: false,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(fake.upsertedSources.length, 1);
  assert.deepEqual(fake.upsertedSources[0], [
    {
      id: dossierSourceTwoId,
      dossier_id: dossierId,
      newsroom_article_id: sourceTwoId,
      newsroom_snapshot_id: snapshotTwoId,
      source_role: "primary",
      sort_order: 10,
      editorial_note: "Confirmar o resultado e a duração.",
      included: true,
    },
    {
      id: dossierSourceOneId,
      dossier_id: dossierId,
      newsroom_article_id: sourceOneId,
      newsroom_snapshot_id: snapshotOneId,
      source_role: "context",
      sort_order: 20,
      editorial_note: null,
      included: false,
    },
  ]);
  assert.deepEqual(fake.touchedDossiers, [dossierId]);
});

test("recusa uma gestão incompleta ou com fonte alheia ao Dossiê", async () => {
  const fake = fakeTransport();
  const manage = manageEditorialDossierSourcesService(fake.transport);

  const incomplete = await manage({
    dossierId,
    sources: [{
      sourceId: dossierSourceOneId,
      priority: 1,
      sourceRole: "primary",
      editorialNote: "",
      included: true,
    }],
  });

  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) {
    assert.equal(incomplete.error.code, "input_invalid");
  }

  const foreign = await manage({
    dossierId,
    sources: [
      {
        sourceId: dossierSourceOneId,
        priority: 1,
        sourceRole: "primary",
        editorialNote: "",
        included: true,
      },
      {
        sourceId: "00000000-0000-4000-8000-000000000099",
        priority: 2,
        sourceRole: "complementary",
        editorialNote: "",
        included: true,
      },
    ],
  });

  assert.equal(foreign.ok, false);
  if (!foreign.ok) {
    assert.equal(foreign.error.code, "source_not_found");
  }
});

test("acrescenta uma nova fonte no fim e congela apenas o snapshot atual dessa fonte", async () => {
  const existing = sourceState(
    dossierSourceOneId,
    sourceOneId,
    snapshotOneId,
    10,
    "primary",
  );
  const fake = fakeTransport({
    readDossierSources: async () => [existing],
  });
  const add = addEditorialDossierSourcesService(fake.transport);

  const result = await add({
    dossierId,
    sources: [{
      newsroomArticleId: sourceTwoId,
      sourceRole: "context",
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(fake.insertedSources.length, 1);
  assert.deepEqual(fake.insertedSources[0].map((source) => ({
    dossierId: source.dossier_id,
    articleId: source.newsroom_article_id,
    snapshotId: source.newsroom_snapshot_id,
    role: source.source_role,
    order: source.sort_order,
  })), [{
    dossierId,
    articleId: sourceTwoId,
    snapshotId: snapshotTwoId,
    role: "context",
    order: 20,
  }]);
  assert.equal(existing.newsroomSnapshotId, snapshotOneId);
});

test("impede acrescentar novamente uma fonte já congelada", async () => {
  const fake = fakeTransport();
  const add = addEditorialDossierSourcesService(fake.transport);

  const result = await add({
    dossierId,
    sources: [{
      newsroomArticleId: sourceOneId,
      sourceRole: "complementary",
    }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "source_already_in_dossier");
  }
  assert.equal(fake.insertedSources.length, 0);
});
