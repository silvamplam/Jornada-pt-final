import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildEditorialDossierGenerationPrompt,
  buildEditorialDossierSourceAnalysisBatches,
  normalizeEditorialDossierSourceAnalysis,
  type EditorialDossierArticlePlanGenerationContext,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal";

const context: EditorialDossierArticlePlanGenerationContext = {
  dossier: {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Preparação do FC Porto",
    editorialInstructions: "Escolher o que é relevante para a preparação da equipa.",
    contextInstructions: "Relacionar mercado, plantel e jogos de preparação.",
    outputLanguage: "pt-PT",
  },
  plan: {
    id: "10000000-0000-4000-8000-000000000002",
    dossierId: "10000000-0000-4000-8000-000000000001",
    status: "ready",
    workingTitle: "FC Porto prepara a nova época",
    articleKind: "news",
    lengthMode: "standard",
    editorialInstructions: "A IA deve analisar todas as fontes e escolher os factos relevantes.",
    editorialArticleId: "10000000-0000-4000-8000-000000000003",
    editorialProfile: {
      profileId: "10000000-0000-4000-8000-000000000004",
      profileCode: "jornada-pt",
      profileName: "Linha editorial Jornada.pt",
      versionId: "10000000-0000-4000-8000-000000000005",
      versionNumber: 1,
      documentText: "Rigor factual, clareza e contexto competitivo.",
      contentHash: "c".repeat(64),
      approvalState: "approved",
      versionCreatedAt: "2026-07-31T10:00:00.000Z",
      pinnedAt: "2026-07-31T10:05:00.000Z",
    },
  },
  article: {
    id: "10000000-0000-4000-8000-000000000003",
    status: "draft",
    body: "",
    updatedAt: "2026-07-31T10:10:00.000Z",
  },
  sources: [
    {
      dossierSourceId: "10000000-0000-4000-8000-000000000011",
      newsroomArticleId: "10000000-0000-4000-8000-000000000012",
      newsroomSnapshotId: "10000000-0000-4000-8000-000000000013",
      sourceCode: "record",
      articleTitle: "Fonte extensa",
      articleTitleOrigin: "frozen",
      sourceRole: "primary",
      sortOrder: 1,
      editorialNote: null,
      contentHash: "a".repeat(64),
      imageUrl: null,
      body: [{ type: "paragraph", text: "A".repeat(100_000) }],
    },
    {
      dossierSourceId: "10000000-0000-4000-8000-000000000021",
      newsroomArticleId: "10000000-0000-4000-8000-000000000022",
      newsroomSnapshotId: "10000000-0000-4000-8000-000000000023",
      sourceCode: "abola",
      articleTitle: "Fonte complementar",
      articleTitleOrigin: "frozen",
      sourceRole: "context",
      sortOrder: 2,
      editorialNote: null,
      contentHash: "b".repeat(64),
      imageUrl: null,
      body: [{
        type: "paragraph",
        text: "CONTEUDO_BRUTO_NAO_DEVE_IR_PARA_A_REDACAO_FINAL",
      }],
    },
  ],
};

test("o erro input_invalid deixa de ser provocado por prioridades vazias", () => {
  const route = readFileSync(
    "app/api/admin/editorial/redacao-automatica/dossies/route.ts",
    "utf8",
  );
  assert.match(route, /const normalized = cleanText\(value\)/);
  assert.match(route, /if \(!normalized\) \{\s*return fallback;/);
});

test("todas as fontes são fragmentadas sem descarte antes da análise", () => {
  const batches = buildEditorialDossierSourceAnalysisBatches(context);
  assert.ok(batches.length >= 2);

  const fragments = batches.flatMap((batch) => {
    const payload = JSON.parse(batch.input) as {
      sources: Array<{ source_ref: string; content: string }>;
    };
    return payload.sources;
  });
  const sourceOne = fragments
    .filter((fragment) => fragment.source_ref === "F1")
    .map((fragment) => fragment.content)
    .join("");
  const sourceTwo = fragments
    .filter((fragment) => fragment.source_ref === "F2")
    .map((fragment) => fragment.content)
    .join("");

  assert.equal(sourceOne, "A".repeat(100_000));
  assert.equal(
    sourceTwo,
    "CONTEUDO_BRUTO_NAO_DEVE_IR_PARA_A_REDACAO_FINAL",
  );
  assert.ok(batches.every((batch) => (
    batch.instructions.length + batch.input.length <= 55_000
  )));
});

test("a redação final recebe a análise da IA sem repetir os corpos integrais", () => {
  const prompt = buildEditorialDossierGenerationPrompt(context, [{
    batchNumber: 1,
    sourceRefs: ["F1", "F2"],
    text: "[F1] Facto principal. [F2] Contexto complementar.",
  }]);

  assert.match(prompt.input, /analise_intermedia/);
  assert.match(prompt.input, /Facto principal/);
  assert.doesNotMatch(
    prompt.input,
    /CONTEUDO_BRUTO_NAO_DEVE_IR_PARA_A_REDACAO_FINAL/,
  );
});

test("a resposta da análise intermédia tem validação própria", () => {
  assert.match(
    normalizeEditorialDossierSourceAnalysis(JSON.stringify({
      title: "Análise do lote 1",
      post_title:
        "Cobertura factual das fontes F1 e F2 para orientar a redação final.",
      body:
        "[F1] Facto principal suficientemente desenvolvido. [F2] Contexto complementar igualmente sustentado pela fonte selecionada.",
    })) ?? "",
    /Facto principal/,
  );
  assert.equal(normalizeEditorialDossierSourceAnalysis("texto livre"), null);
});
