import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEditorialBatchTransferSourcePackage,
  preflightEditorialArticleBatchForSourcePackage,
} from "./editorial-batch-transfer";

const PACKAGE_ID = "91000000-0000-4000-8000-000000000001";
const MATCHDAY_ID = "92000000-0000-4000-8000-000000000001";
const OUTPUT_ID = "93000000-0000-4000-8000-000000000001";
const SOURCE_ID = "94000000-0000-4000-8000-000000000001";

const mesaV2Text = `[JORNADA_ARTIGO_V1]
OUTPUT_ID
${OUTPUT_ID}
FONTES_UTILIZADAS
${SOURCE_ID}
ANTETÍTULO
Liga Portugal
TÍTULO
Título Mesa v2
PÓS-TÍTULO
Pós-título.
CORPO
Corpo do artigo.
[/JORNADA_ARTIGO_V1]`;

test("transferências antigas do Dossiê continuam legíveis", () => {
  assert.deepEqual(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
    })),
    {
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
    },
  );
});

test("a transferência preserva o contexto canónico de uma atualização", () => {
  assert.deepEqual(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      matchdayId: MATCHDAY_ID,
      updateArticleCount: 3,
    })),
    {
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      matchdayId: MATCHDAY_ID,
      updateArticleCount: 3,
    },
  );
});

test("a transferência rejeita contexto de atualização inválido", () => {
  assert.equal(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      matchdayId: "jornada-invalida",
      updateArticleCount: 3,
    })),
    null,
  );

  assert.equal(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      matchdayId: MATCHDAY_ID,
      updateArticleCount: 0,
    })),
    null,
  );
});

test("a transferência preserva uma imagem final independente por output", () => {
  const outputImages = [
    {
      position: 1,
      imageUrl: "https://assets.example.invalid/a.jpg",
      label: "Fonte A",
    },
    {
      position: 2,
      imageUrl: "https://assets.example.invalid/a.jpg",
      label: "Fonte A repetida",
    },
    {
      position: 3,
      imageUrl: "https://project.supabase.co/storage/v1/object/public/editorial-images/editorial/2026/08/c.webp",
      label: "externa-c.webp",
    },
  ];

  assert.deepEqual(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      outputImages,
    }))?.outputImages,
    outputImages,
  );
});

test("a transferência rejeita posições de imagem duplicadas", () => {
  assert.equal(
    parseEditorialBatchTransferSourcePackage(JSON.stringify({
      year: "2026",
      month: "08",
      packageId: PACKAGE_ID,
      outputImages: [
        { position: 1, imageUrl: "https://assets.example.invalid/a.jpg", label: "A" },
        { position: 1, imageUrl: "https://assets.example.invalid/b.jpg", label: "B" },
      ],
    })),
    null,
  );
});

test("a transferência Mesa v2 conserva o contrato fechado do package", () => {
  const parsed = parseEditorialBatchTransferSourcePackage(JSON.stringify({
    year: "2026",
    month: "09",
    packageId: PACKAGE_ID,
    batchContract: {
      manifestVersion: 5,
      provenanceContract: "mesa-v2",
      workspaceContractVersion: 2,
      outputIds: [OUTPUT_ID],
      sourceIds: [SOURCE_ID],
    },
  }));

  assert.ok(parsed?.batchContract);
  const preflight = preflightEditorialArticleBatchForSourcePackage(mesaV2Text, parsed);
  assert.equal(preflight.ready, true);
  assert.equal(preflight.total, 1);
  assert.equal(preflight.articles[0].outputId, OUTPUT_ID);
});

test("Mesa v2 sem OUTPUT_ID ou FONTES_UTILIZADAS bloqueia sem downgrade histórico", () => {
  const sourcePackage = {
    year: "2026",
    month: "09",
    packageId: PACKAGE_ID,
    batchContract: {
      manifestVersion: 5 as const,
      provenanceContract: "mesa-v2" as const,
      workspaceContractVersion: 2 as const,
      outputIds: [OUTPUT_ID],
      sourceIds: [SOURCE_ID],
    },
  };
  const withoutOutput = mesaV2Text.replace(`OUTPUT_ID\n${OUTPUT_ID}\n`, "");
  const withoutSources = mesaV2Text.replace(`FONTES_UTILIZADAS\n${SOURCE_ID}\n`, "");

  assert.equal(preflightEditorialArticleBatchForSourcePackage(withoutOutput, sourcePackage).ready, false);
  assert.equal(preflightEditorialArticleBatchForSourcePackage(withoutSources, sourcePackage).ready, false);
  assert.equal(preflightEditorialArticleBatchForSourcePackage(mesaV2Text, null).ready, false);
});

test("contrato Mesa v2 parcial ou malformado não é aceite como pacote histórico", () => {
  assert.equal(parseEditorialBatchTransferSourcePackage(JSON.stringify({
    year: "2026",
    month: "09",
    packageId: PACKAGE_ID,
    batchContract: {
      manifestVersion: 5,
      provenanceContract: "mesa-v2",
      outputIds: [OUTPUT_ID],
      sourceIds: [SOURCE_ID],
    },
  })), null);
});
