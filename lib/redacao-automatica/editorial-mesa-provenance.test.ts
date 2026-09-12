import assert from "node:assert/strict";
import test from "node:test";

import type { EditorialBatchArticle } from "./editorial-batch-parser";
import {
  editorialMesaPackageBatchContract,
  validateEditorialMesaOutputProvenance,
  validateEditorialMesaSingleOutputProvenance,
} from "./editorial-mesa-provenance";
import type {
  EditorialSourcePackageManifest,
  EditorialSourcePackageManifestEntry,
  EditorialSourcePackageOutput,
} from "./editorial-source-package-internal";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function entry(position: number): EditorialSourcePackageManifestEntry {
  return {
    position,
    articlePosition: 1,
    newsroomArticleId: id(100 + position),
    newsroomSnapshotId: id(200 + position),
    provenanceSourceId: id(300 + position),
    status: "prepared",
    sourceCode: "record",
    sourceName: "Record",
    title: `Fonte ${position}`,
    errorCode: null,
  };
}

function output(position: number): EditorialSourcePackageOutput {
  return {
    position,
    outputId: id(400 + position),
    startingPointSourceId: id(300 + position),
    sourceArticlePosition: 1,
    focus: `Output ${position}`,
    imageNewsroomArticleId: null,
    articlePlan: {
      dossierId: id(600),
      articlePlanId: id(400 + position),
      workingTitle: `Output ${position}`,
      articleKind: "news",
      articleKindLabel: "Notícia",
      lengthMode: "standard",
      lengthModeLabel: "Média",
      editorialInstructions: "",
      destination: "new",
      workspaceContractVersion: 2,
      sourceScope: "workspace",
    },
  };
}

function manifest(version: 4 | 5 = 5): EditorialSourcePackageManifest {
  return {
    version,
    ...(version === 5 ? { provenanceContract: "mesa-v2" as const } : {}),
    packageId: id(500),
    createdAt: "2026-09-12T12:00:00.000Z",
    year: "2026",
    month: "09",
    markdownFileName: "fontes.md",
    genre: "news",
    genreLabel: "Notícia",
    suggestedTitle: null,
    additionalInstructions: null,
    selectedCount: 3,
    articleCount: 2,
    preparedCount: 3,
    failedCount: 0,
    imageCount: 0,
    localDirectory: null,
    outputs: [output(1), output(2)],
    entries: [entry(1), entry(2), entry(3)],
  };
}

function article(
  index: number,
  outputId: string | null,
  sourceIds: readonly string[],
): EditorialBatchArticle {
  return {
    index,
    key: String(index).padStart(2, "0"),
    outputId,
    sourceIds,
    label: "DESPORTO",
    title: `Artigo ${index}`,
    subtitle: "Pós-título",
    body: "Corpo",
  };
}

test("Mesa v2 aceita apenas fontes autorizadas e permite um subconjunto diferente dos assignments técnicos", () => {
  const result = validateEditorialMesaOutputProvenance(manifest(), [
    article(1, id(401), [id(301)]),
    article(2, id(402), [id(302), id(303)]),
  ]);

  assert.equal(result.ok, true);
  if (!result.ok || result.contract !== "mesa-v2") return;
  assert.deepEqual(result.outputs[0].sources.map((source) => source.provenanceSourceId), [id(301)]);
  assert.deepEqual(result.outputs[1].sources.map((source) => source.provenanceSourceId), [id(302), id(303)]);
});

test("manifesto Mesa v2 produz descritor fechado para o preflight do importador", () => {
  assert.deepEqual(editorialMesaPackageBatchContract(manifest()), {
    kind: "mesa-v2",
    value: {
      manifestVersion: 5,
      provenanceContract: "mesa-v2",
      workspaceContractVersion: 2,
      outputIds: [id(401), id(402)],
      sourceIds: [id(301), id(302), id(303)],
    },
  });
  assert.deepEqual(editorialMesaPackageBatchContract(manifest(4)), { kind: "historical" });
});

test("PONTO_DE_PARTIDA orienta o assunto mas não prova utilização", () => {
  const result = validateEditorialMesaOutputProvenance(manifest(), [
    article(1, id(401), [id(303)]),
    article(2, id(402), [id(301)]),
  ]);

  assert.equal(result.ok, true);
  if (!result.ok || result.contract !== "mesa-v2") return;
  assert.equal(result.outputs[0].output.startingPointSourceId, id(301));
  assert.deepEqual(result.outputs[0].sources.map((source) => source.provenanceSourceId), [id(303)]);
});

test("OUTPUT_ID é a identidade estável e não depende da posição visual ou do título", () => {
  const result = validateEditorialMesaOutputProvenance(manifest(), [
    article(1, id(402), [id(303)]),
    article(2, id(401), [id(301)]),
  ]);

  assert.equal(result.ok, true);
  if (!result.ok || result.contract !== "mesa-v2") return;
  assert.deepEqual(result.outputs.map((item) => item.output.outputId), [id(402), id(401)]);
});

test("Mesa v2 bloqueia proveniência ausente, output duplicado e fonte externa", () => {
  const missing = validateEditorialMesaOutputProvenance(manifest(), [
    article(1, null, []),
    article(2, id(402), [id(302)]),
  ]);
  const duplicateOutput = validateEditorialMesaOutputProvenance(manifest(), [
    article(1, id(401), [id(301)]),
    article(2, id(401), [id(302)]),
  ]);
  const externalSource = validateEditorialMesaOutputProvenance(manifest(), [
    article(1, id(401), [id(999)]),
    article(2, id(402), [id(302)]),
  ]);

  assert.deepEqual(missing, { ok: false, code: "mesa-v2-provenance-missing", articleKey: "01" });
  assert.deepEqual(duplicateOutput, { ok: false, code: "mesa-v2-output-duplicate", articleKey: "02" });
  assert.deepEqual(externalSource, { ok: false, code: "mesa-v2-source-unknown", articleKey: "01" });
});

test("Mesa v2 bloqueia fontes duplicadas e outputs desconhecidos", () => {
  const duplicateSource = validateEditorialMesaSingleOutputProvenance(
    manifest(),
    article(1, id(401), [id(301), id(301)]),
  );
  const unknownOutput = validateEditorialMesaSingleOutputProvenance(
    manifest(),
    article(1, id(999), [id(301)]),
  );

  assert.deepEqual(duplicateSource, { ok: false, code: "mesa-v2-source-duplicate", articleKey: "01" });
  assert.deepEqual(unknownOutput, { ok: false, code: "mesa-v2-output-unknown", articleKey: "01" });
});

test("manifesto histórico continua legível sem reinterpretar nem exigir proveniência v2", () => {
  const result = validateEditorialMesaOutputProvenance(manifest(4), [
    article(1, null, []),
  ]);
  assert.deepEqual(result, { ok: true, contract: "historical", outputs: [] });
});
