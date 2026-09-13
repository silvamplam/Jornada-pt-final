import assert from "node:assert/strict";
import test from "node:test";

import {
  editorialMesaContextVisualSeedAssignments,
  editorialMesaResolvedVisualImageChoice,
  editorialMesaWorkspaceInitialOutputCount,
  editorialMesaWorkspaceOutputWorkingTitle,
  editorialMesaWorkspaceStartingPointSourceIds,
  editorialMesaWorkspaceVisualSourceOrder,
} from "./editorial-mesa-workspace-defaults";

const articleId = (position: number) => `81000000-0000-4000-8000-${String(position).padStart(12, "0")}`;
const sourceId = (position: number) => `82000000-0000-4000-8000-${String(position).padStart(12, "0")}`;

const sources = [1, 2, 3, 4].map((position) => ({
  dossierSourceId: sourceId(position),
  newsroomArticleId: articleId(position),
}));

test("quatro fontes definem quatro outputs e quatro pontos de partida pela seleção congelada", () => {
  const selection = {
    sources: [4, 2, 1, 3].map((position) => ({ newsroomArticleId: articleId(position) })),
    materials: [],
  };

  assert.equal(editorialMesaWorkspaceInitialOutputCount(selection, 4), 4);
  assert.deepEqual(
    editorialMesaWorkspaceVisualSourceOrder(
      selection,
      [],
      sources.map((source) => source.newsroomArticleId),
    ),
    [articleId(4), articleId(2), articleId(1), articleId(3)],
  );
  assert.deepEqual(
    editorialMesaWorkspaceStartingPointSourceIds(selection, [], sources, 4),
    [sourceId(4), sourceId(2), sourceId(1), sourceId(3)],
  );
});

test("cada output deriva o título técnico do seu próprio ponto de partida", () => {
  const titledSources = sources.map((source, index) => ({
    ...source,
    articleTitle: `Fonte ${index + 1}`,
  }));
  const startingPoints = editorialMesaWorkspaceStartingPointSourceIds(
    { sources: [1, 2, 3, 4].map((position) => ({ newsroomArticleId: articleId(position) })), materials: [] },
    [],
    sources,
    4,
  );

  assert.deepEqual(
    startingPoints.map((startingPointSourceId, index) => (
      editorialMesaWorkspaceOutputWorkingTitle(
        index + 1,
        startingPointSourceId,
        titledSources,
      )
    )),
    [
      "Output 01 — Fonte 1",
      "Output 02 — Fonte 2",
      "Output 03 — Fonte 3",
      "Output 04 — Fonte 4",
    ],
  );
  assert.equal(
    editorialMesaWorkspaceOutputWorkingTitle(1, sourceId(99), titledSources),
    null,
  );
});

test("um material usa a primeira fonte congelada como ponto de partida sem fundir o workspace", () => {
  const versionId = "83000000-0000-4000-8000-000000000001";
  const selection = {
    sources: [],
    materials: [{ key: "dossier:um", versionId }],
  };
  const materialRefs = [{
    key: "dossier:um",
    versionId,
    sources: [
      { newsroomArticleId: articleId(3) },
      { newsroomArticleId: articleId(4) },
    ],
  }];

  assert.deepEqual(
    editorialMesaWorkspaceStartingPointSourceIds(selection, materialRefs, sources, 1),
    [sourceId(3)],
  );
});

test("outputs adicionais repetem deterministicamente a ordem sem limitar as fontes disponíveis", () => {
  assert.deepEqual(
    editorialMesaWorkspaceStartingPointSourceIds(
      { sources: [{ newsroomArticleId: articleId(1) }], materials: [] },
      [],
      sources.slice(0, 1),
      3,
    ),
    [sourceId(1), sourceId(1), sourceId(1)],
  );
});

test("contextos Source ignoram a ordem visual global e usam a respetiva fonte", () => {
  const contextA = "context-source-a";
  const contextB = "context-source-b";
  const assignments = editorialMesaContextVisualSeedAssignments([
    { id: contextA, sources: [{ newsroomArticleId: articleId(1), sortOrder: 1 }] },
    { id: contextB, sources: [{ newsroomArticleId: articleId(2), sortOrder: 1 }] },
  ], [
    { key: "output-b", productionContextId: contextB },
    { key: "output-a", productionContextId: contextA },
  ], [articleId(1), articleId(2)]);

  assert.deepEqual(
    assignments.map((assignment) => assignment.newsroomArticleId),
    [articleId(2), articleId(1)],
  );
});

test("Tema e Source solta nunca cruzam imagens", () => {
  const themeId = "context-theme";
  const sourceContextId = "context-source";
  const assignments = editorialMesaContextVisualSeedAssignments([
    {
      id: themeId,
      sources: [
        { newsroomArticleId: articleId(1), sortOrder: 1 },
        { newsroomArticleId: articleId(2), sortOrder: 2 },
      ],
    },
    { id: sourceContextId, sources: [{ newsroomArticleId: articleId(3), sortOrder: 1 }] },
  ], [
    { key: "theme-1", productionContextId: themeId },
    { key: "source-1", productionContextId: sourceContextId },
    { key: "theme-2", productionContextId: themeId },
  ], [articleId(1), articleId(2), articleId(3), articleId(4)]);

  assert.deepEqual(
    assignments.map((assignment) => assignment.newsroomArticleId),
    [articleId(1), articleId(3), articleId(2)],
  );
});

test("um Tema distribui e repete imagens pelo ordinal interno do contexto", () => {
  const contextId = "context-theme";
  const outputs = Array.from({ length: 5 }, (_, index) => ({
    key: `output-${index + 1}`,
    productionContextId: contextId,
  }));
  const assignments = editorialMesaContextVisualSeedAssignments([{
    id: contextId,
    sources: [
      { newsroomArticleId: articleId(2), sortOrder: 2 },
      { newsroomArticleId: articleId(1), sortOrder: 1 },
    ],
  }], outputs, [articleId(1), articleId(2)]);

  assert.deepEqual(
    assignments.map((assignment) => assignment.contextOrdinal),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    assignments.map((assignment) => assignment.newsroomArticleId),
    [articleId(1), articleId(2), articleId(1), articleId(2), articleId(1)],
  );
});

test("Tema ignora fontes sem imagem e nunca procura fallback fora do contexto", () => {
  const themeWithImage = "theme-with-image";
  const themeWithoutImage = "theme-without-image";
  const assignments = editorialMesaContextVisualSeedAssignments([
    {
      id: themeWithImage,
      sources: [
        { newsroomArticleId: articleId(1), sortOrder: 1 },
        { newsroomArticleId: articleId(2), sortOrder: 2 },
      ],
    },
    {
      id: themeWithoutImage,
      sources: [{ newsroomArticleId: articleId(3), sortOrder: 1 }],
    },
  ], [
    { key: "with-image", productionContextId: themeWithImage },
    { key: "without-image", productionContextId: themeWithoutImage },
  ], [articleId(2), articleId(4)]);

  assert.deepEqual(
    assignments.map((assignment) => assignment.newsroomArticleId),
    [articleId(2), null],
  );
});

test("vários Temas mantêm ordinais e imagens independentes", () => {
  const themeA = "theme-a";
  const themeB = "theme-b";
  const assignments = editorialMesaContextVisualSeedAssignments([
    {
      id: themeA,
      sources: [
        { newsroomArticleId: articleId(1), sortOrder: 1 },
        { newsroomArticleId: articleId(2), sortOrder: 2 },
      ],
    },
    {
      id: themeB,
      sources: [
        { newsroomArticleId: articleId(3), sortOrder: 1 },
        { newsroomArticleId: articleId(4), sortOrder: 2 },
      ],
    },
  ], [
    { key: "a-1", productionContextId: themeA },
    { key: "b-1", productionContextId: themeB },
    { key: "b-2", productionContextId: themeB },
    { key: "a-2", productionContextId: themeA },
  ], [articleId(1), articleId(2), articleId(3), articleId(4)]);

  assert.deepEqual(
    assignments.map((assignment) => assignment.newsroomArticleId),
    [articleId(1), articleId(3), articleId(4), articleId(2)],
  );
});

test("mudar o total ou o contexto recalcula apenas a distribuição contextual", () => {
  const themeA = "theme-a";
  const themeB = "theme-b";
  const contexts = [
    {
      id: themeA,
      sources: [
        { newsroomArticleId: articleId(1), sortOrder: 1 },
        { newsroomArticleId: articleId(2), sortOrder: 2 },
      ],
    },
    { id: themeB, sources: [{ newsroomArticleId: articleId(3), sortOrder: 1 }] },
  ];
  const first = editorialMesaContextVisualSeedAssignments(contexts, [
    { key: "one", productionContextId: themeA },
    { key: "two", productionContextId: themeA },
  ], [articleId(1), articleId(2), articleId(3)]);
  const expanded = editorialMesaContextVisualSeedAssignments(contexts, [
    { key: "one", productionContextId: themeA },
    { key: "two", productionContextId: themeB },
    { key: "three", productionContextId: themeA },
  ], [articleId(1), articleId(2), articleId(3)]);

  assert.deepEqual(first.map((assignment) => assignment.newsroomArticleId), [articleId(1), articleId(2)]);
  assert.deepEqual(expanded.map((assignment) => assignment.newsroomArticleId), [articleId(1), articleId(3), articleId(2)]);
});

test("só o estado automático acompanha o novo seed; escolhas explícitas permanecem", () => {
  assert.equal(
    editorialMesaResolvedVisualImageChoice(null, "image-context-a"),
    "dossier_image:image-context-a",
  );
  assert.equal(
    editorialMesaResolvedVisualImageChoice(null, "image-context-b"),
    "dossier_image:image-context-b",
  );
  assert.equal(
    editorialMesaResolvedVisualImageChoice("dossier_image:manual-bank", "image-context-b"),
    "dossier_image:manual-bank",
  );
  assert.equal(
    editorialMesaResolvedVisualImageChoice("dossier_image:manual-upload", "image-context-b"),
    "dossier_image:manual-upload",
  );
  assert.equal(
    editorialMesaResolvedVisualImageChoice("preserve_published", "image-context-b"),
    "preserve_published",
  );
  assert.equal(editorialMesaResolvedVisualImageChoice(null, null), "unselected");
});
