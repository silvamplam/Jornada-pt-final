import assert from "node:assert/strict";
import test from "node:test";

import {
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
