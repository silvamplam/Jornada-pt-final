import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EMPTY_MESA_PREPARATION_BUFFER,
  mesaContextPreparationPayload,
  readMesaPreparationBuffer,
  selectMesaMaterial,
  selectMesaTheme,
  writeMesaPreparationBuffer,
  type MesaSourceSelection,
  type MesaThemeSelection,
} from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";

const id = (n: number) => `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function source(index: number): MesaSourceSelection {
  return {
    kind: "source",
    lifecycle: "new",
    newsroomArticleId: id(index),
    newsroomSnapshotId: id(100 + index),
    classificationKey: "benfica",
    title: `Fonte ${index}`,
    sourceLabel: "Record",
    imageUrl: null,
  };
}

function theme(index: number, sourceIndexes: readonly number[]): MesaThemeSelection {
  return {
    kind: "theme",
    themeId: id(200 + index),
    title: `Tema ${index}`,
    classificationKey: "benfica",
    sources: sourceIndexes.map((sourceIndex) => ({
      newsroomArticleId: id(sourceIndex),
      newsroomSnapshotId: id(100 + sourceIndex),
    })),
  };
}

test("buffer v3 continua a ler uma seleção v2 histórica sem a reinterpretar como Tema", () => {
  const historical = JSON.stringify({
    version: 2,
    preparationKey: id(900),
    title: "Seleção anterior",
    sources: [source(1)],
  });
  const restored = readMesaPreparationBuffer(historical);
  assert.equal(restored.version, 3);
  assert.deepEqual(restored.sources, [source(1)]);
  assert.equal(restored.themes, undefined);
});

test("Fonte + Tema são contextos independentes quando incorporar não está ativo", () => {
  const withSource = selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER, source(1), () => id(901));
  const selected = selectMesaTheme(withSource, theme(1, [2, 3]), () => id(902));
  const payload = mesaContextPreparationPayload(selected, false);

  assert.ok(payload);
  assert.deepEqual(payload.contexts.map((context) => context.kind), ["source", "theme"]);
  assert.equal(payload.incorporateThemeId, null);
  assert.deepEqual(payload.incorporateSourceIds, []);
  assert.deepEqual(readMesaPreparationBuffer(writeMesaPreparationBuffer(selected)), selected);
});

test("incorporar produz um único Tema enriquecido e conserva os snapshots exatos", () => {
  const withSource = selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER, source(1), () => id(903));
  const selected = selectMesaTheme(withSource, theme(1, [2, 3]), () => id(904));
  const payload = mesaContextPreparationPayload(selected, true);

  assert.ok(payload);
  assert.equal(payload.contexts.length, 1);
  assert.equal(payload.contexts[0].kind, "theme");
  assert.deepEqual(payload.contexts[0].sources, [
    theme(1, [2, 3]).sources[0],
    theme(1, [2, 3]).sources[1],
    {
      newsroomArticleId: source(1).newsroomArticleId,
      newsroomSnapshotId: source(1).newsroomSnapshotId,
    },
  ]);
  assert.equal(payload.incorporateThemeId, theme(1, [2, 3]).themeId);
  assert.deepEqual(payload.incorporateSourceIds, [source(1).newsroomArticleId]);
});

test("vários Temas nunca permitem incorporação ambígua", () => {
  const withSource = selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER, source(1), () => id(905));
  const withOneTheme = selectMesaTheme(withSource, theme(1, [2]), () => id(906));
  const withTwoThemes = selectMesaTheme(withOneTheme, theme(2, [3]), () => id(907));
  assert.equal(mesaContextPreparationPayload(withTwoThemes, true), null);
  assert.equal(mesaContextPreparationPayload(withTwoThemes, false)?.contexts.length, 3);
});

test("a mesma fonte pode ser congelada em dois Temas sem duplicar a fonte física", () => {
  const withFirst = selectMesaTheme(EMPTY_MESA_PREPARATION_BUFFER, theme(1, [2, 3]), () => id(908));
  const withBoth = selectMesaTheme(withFirst, theme(2, [2, 4]), () => id(909));
  const payload = mesaContextPreparationPayload(withBoth, false);
  assert.ok(payload);
  assert.equal(payload.contexts.length, 2);
  assert.equal(new Set(payload.contexts.flatMap((context) => context.sources)
    .map((ref) => ref.newsroomArticleId)).size, 3);
});

test("runtime 2C usa os RPCs existentes e falha quando a estrutura normalizada não confirma o marcador", () => {
  const prepareRoute = readFileSync(
    "app/api/admin/editorial/redacao-automatica/mesa/preparar/route.ts",
    "utf8",
  );
  const workspaceRoute = readFileSync(
    "app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts",
    "utf8",
  );
  const repository = readFileSync(
    "lib/redacao-automatica/editorial-dossier-production-workspace-repository.ts",
    "utf8",
  );
  const planService = readFileSync(
    "lib/redacao-automatica/editorial-dossier-article-plan-service.ts",
    "utf8",
  );

  assert.match(prepareRoute, /newsroom_prepare_mesa_contexts_v3/);
  assert.match(prepareRoute, /mesaVersion === 3/);
  assert.match(repository, /payload\.contractVersion === 3 && payload\.contextContractVersion === 1/);
  assert.match(repository, /hasContextMarker !== \(productionContextRows\.length > 0\)/);
  assert.match(repository, /return readUnavailable\(\)/);
  assert.match(planService, /rpc\/newsroom_save_mesa_context_article_plan_v1/);
  assert.match(workspaceRoute, /productionContext\.sources\.flatMap/);
  assert.match(workspaceRoute, /contextSourceIds: productionContext\.sources\.map/);
  assert.match(workspaceRoute, /sourceScope: "context"/);
  assert.match(workspaceRoute, /sourceScope: "workspace"/);
});

test("UI mantém o total na Produção, exige duas fontes para Criar tema e só incorpora com um Tema", () => {
  const selectionClient = readFileSync(
    "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
    "utf8",
  );
  const workspaceClient = readFileSync(
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx",
    "utf8",
  );
  const themePage = readFileSync(
    "app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/page.tsx",
    "utf8",
  );

  assert.match(selectionClient, /selectedThemes\.length === 1[\s\S]*buffer\.sources\.length > 0/);
  assert.match(selectionClient, /Incorporar fontes selecionadas no Tema antes de produzir/);
  assert.match(selectionClient, /action === "create" && command\.sourceIds\.length < 2/);
  assert.match(workspaceClient, /Número total de artigos a produzir/);
  assert.match(workspaceClient, /<span>Contexto<\/span>/);
  assert.match(workspaceClient, /productionContextId/);
  assert.match(themePage, /Adicionar material/);
  assert.match(themePage, /member\.theme_id !== themeId/);
  assert.match(themePage, /!currentThemeSourceIds\.has/);
});
