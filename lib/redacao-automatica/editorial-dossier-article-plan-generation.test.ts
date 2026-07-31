import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildEditorialDossierGenerationPrompt,
  createEditorialDossierArticlePlanGenerationService,
  normalizeGeneratedEditorialDraft,
  EDITORIAL_DOSSIER_GENERATION_PROMPT_VERSION,
  type ApplyEditorialDossierGenerationInput,
  type EditorialDossierArticlePlanGenerationContext,
  type EditorialDossierArticlePlanGenerationTransport,
  type EditorialGenerationProvider,
  type ExistingEditorialDossierGeneration,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal";

const dossierId = "00000000-0000-4000-8000-000000000001";
const planId = "00000000-0000-4000-8000-000000000011";
const articleId = "00000000-0000-4000-8000-000000000021";
const generationId = "00000000-0000-4000-8000-000000000031";
const sourceOneId = "00000000-0000-4000-8000-000000000041";
const sourceTwoId = "00000000-0000-4000-8000-000000000042";
const newsroomOneId = "00000000-0000-4000-8000-000000000051";
const newsroomTwoId = "00000000-0000-4000-8000-000000000052";
const snapshotOneId = "00000000-0000-4000-8000-000000000061";
const snapshotTwoId = "00000000-0000-4000-8000-000000000062";
const profileId = "00000000-0000-4000-8000-000000000071";
const profileVersionId = "00000000-0000-4000-8000-000000000072";
const profileDocument =
  "A Jornada.pt parte dos factos para identificar problemas e avaliar alternativas com evidência.";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function context(
  overrides: Partial<EditorialDossierArticlePlanGenerationContext> = {},
): EditorialDossierArticlePlanGenerationContext {
  return {
    dossier: {
      id: dossierId,
      title: "Teste de composição editorial com duas fontes",
      editorialInstructions: "Separar os dois contextos.",
      contextInstructions: "Explicar que ambas as equipas preparam a nova época.",
      outputLanguage: "pt-PT",
    },
    plan: {
      id: planId,
      dossierId,
      status: "ready",
      workingTitle: "Vitória fecha estágio; FC Porto prepara a nova época",
      articleKind: "analysis",
      lengthMode: "developed",
      editorialInstructions: "Usar apenas os factos presentes nas fontes atribuídas.",
      editorialArticleId: articleId,
      editorialProfile: {
        profileId,
        profileCode: "jornada-pt",
        profileName: "Linha editorial da Jornada.pt",
        versionId: profileVersionId,
        versionNumber: 1,
        documentText: profileDocument,
        contentHash: "c".repeat(64),
        approvalState: "approved",
        versionCreatedAt: "2026-07-29T07:00:00.000Z",
        pinnedAt: "2026-07-29T07:30:00.000Z",
      },
    },
    article: {
      id: articleId,
      status: "draft",
      body: "",
      updatedAt: "2026-07-29T08:00:00.000Z",
    },
    sources: [
      {
        dossierSourceId: sourceOneId,
        newsroomArticleId: newsroomOneId,
        newsroomSnapshotId: snapshotOneId,
        sourceCode: "record",
        articleTitle: "FC Porto vence S. João de Ver",
        articleTitleOrigin: "frozen",
        sourceRole: "primary",
        sortOrder: 10,
        editorialNote: "Abrir com o FC Porto.",
        contentHash: "a".repeat(64),
        imageUrl: "https://cdn.example.test/fc-porto.jpg",
        body: [
          { type: "paragraph", text: "O FC Porto venceu o S. João de Ver num jogo de preparação." },
          { type: "paragraph", text: "Rodrigo Mora e Eduardo Ferreira estiveram em destaque." },
        ],
      },
      {
        dossierSourceId: sourceTwoId,
        newsroomArticleId: newsroomTwoId,
        newsroomSnapshotId: snapshotTwoId,
        sourceCode: "abola",
        articleTitle: "Vitória encerra estágio",
        articleTitleOrigin: "frozen",
        sourceRole: "context",
        sortOrder: 20,
        editorialNote: null,
        contentHash: "b".repeat(64),
        imageUrl: null,
        body: [
          { type: "paragraph", text: "O Vitória encerrou o estágio com um teste frente ao Nottingham Forest." },
        ],
      },
    ],
    ...overrides,
  };
}

function existingGeneration(): ExistingEditorialDossierGeneration {
  return {
    id: generationId,
    editorialArticleId: articleId,
    provider: "openai",
    model: "gpt-5-mini",
    promptVersion: EDITORIAL_DOSSIER_GENERATION_PROMPT_VERSION,
    createdAt: "2026-07-29T08:05:00.000Z",
  };
}

function fakeEnvironment(options: {
  generation?: ExistingEditorialDossierGeneration | null;
  generationContext?: EditorialDossierArticlePlanGenerationContext | null;
  providerConfigured?: boolean;
  providerText?: string;
  applyAction?: "applied" | "reused";
} = {}) {
  let providerCalls = 0;
  let applyCalls = 0;
  let appliedInput: ApplyEditorialDossierGenerationInput | null = null;

  const transport: EditorialDossierArticlePlanGenerationTransport = {
    isConfigured: () => true,
    pinEditorialProfileVersion: async () =>
      (options.generationContext ?? context()).plan.editorialProfile ?? null,
    findGeneration: async () => options.generation ?? null,
    readContext: async () => options.generationContext ?? context(),
    applyGeneration: async (input) => {
      applyCalls += 1;
      appliedInput = input;
      return {
        generationId,
        editorialArticleId: articleId,
        action: options.applyAction ?? "applied",
      };
    },
  };

  const provider: EditorialGenerationProvider = {
    isConfigured: () => options.providerConfigured ?? true,
    generate: async () => {
      providerCalls += 1;
      return {
        provider: "openai",
        model: "gpt-5-mini-2025-08-07",
        responseId: "resp_test",
        text: options.providerText
          ?? JSON.stringify({
            title: "FC Porto vence e prepara a nova época",
            post_title: "Dragões bateram o S. João de Ver, enquanto o Vitória encerrou o estágio frente ao Nottingham Forest.",
            body: "O FC Porto venceu o S. João de Ver num encontro de preparação em que Rodrigo Mora e Eduardo Ferreira estiveram em destaque.\n\nO Vitória de Guimarães encerrou o estágio com um teste frente ao Nottingham Forest, num contexto distinto da preparação portista.",
          }),
        inputTokens: 500,
        outputTokens: 120,
        totalTokens: 620,
      };
    },
  };

  return {
    service: createEditorialDossierArticlePlanGenerationService(transport, provider),
    counts: () => ({ providerCalls, applyCalls }),
    appliedInput: () => appliedInput,
  };
}

test("rejeita identificadores inválidos sem ler contexto nem chamar o fornecedor", async () => {
  const environment = fakeEnvironment();
  const result = await environment.service("inválido", planId);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
  }
  assert.deepEqual(environment.counts(), { providerCalls: 0, applyCalls: 0 });
});

test("reutiliza uma geração existente sem nova chamada externa", async () => {
  const environment = fakeEnvironment({ generation: existingGeneration() });
  const result = await environment.service(dossierId, planId);

  assert.deepEqual(result, {
    ok: true,
    value: {
      generationId,
      editorialArticleId: articleId,
      action: "reused",
    },
  });
  assert.deepEqual(environment.counts(), { providerCalls: 0, applyCalls: 0 });
});

test("protege rascunhos com texto humano e planos não prontos", async () => {
  const withBody = fakeEnvironment({
    generationContext: context({
      article: {
        id: articleId,
        status: "draft",
        body: "Texto escrito por uma pessoa.",
        updatedAt: "2026-07-29T08:00:00.000Z",
      },
    }),
  });
  const bodyResult = await withBody.service(dossierId, planId);
  assert.equal(bodyResult.ok, false);
  if (!bodyResult.ok) {
    assert.equal(bodyResult.error.code, "draft_not_empty");
  }

  const plannedContext = context();
  const planned = fakeEnvironment({
    generationContext: {
      ...plannedContext,
      plan: { ...plannedContext.plan, status: "planned" },
    },
  });
  const plannedResult = await planned.service(dossierId, planId);
  assert.equal(plannedResult.ok, false);
  if (!plannedResult.ok) {
    assert.equal(plannedResult.error.code, "article_plan_not_ready");
  }

  assert.deepEqual(withBody.counts(), { providerCalls: 0, applyCalls: 0 });
  assert.deepEqual(planned.counts(), { providerCalls: 0, applyCalls: 0 });
});

test("bloqueia fontes sem snapshot utilizável e fornecedor não configurado", async () => {
  const invalidContext = context();
  const missingSource = fakeEnvironment({
    generationContext: {
      ...invalidContext,
      sources: [{ ...invalidContext.sources[0], body: [] }],
    },
  });
  const sourceResult = await missingSource.service(dossierId, planId);
  assert.equal(sourceResult.ok, false);
  if (!sourceResult.ok) {
    assert.equal(sourceResult.error.code, "source_snapshot_missing");
  }

  const unavailable = fakeEnvironment({ providerConfigured: false });
  const providerResult = await unavailable.service(dossierId, planId);
  assert.equal(providerResult.ok, false);
  if (!providerResult.ok) {
    assert.equal(providerResult.error.code, "generation_provider_unavailable");
  }

  assert.deepEqual(missingSource.counts(), { providerCalls: 0, applyCalls: 0 });
  assert.deepEqual(unavailable.counts(), { providerCalls: 0, applyCalls: 0 });
});

test("recusa gerar sem versão editorial fixada", async () => {
  const unpinnedContext = context();
  const environment = fakeEnvironment({
    generationContext: {
      ...unpinnedContext,
      plan: {
        ...unpinnedContext.plan,
        editorialProfile: undefined,
      },
    },
  });
  const result = await environment.service(dossierId, planId);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "editorial_profile_unavailable");
  }
  assert.deepEqual(environment.counts(), { providerCalls: 0, applyCalls: 0 });
});

test("analisa diretamente fontes pequenas e gera título, pós-título e corpo", async () => {
  const environment = fakeEnvironment();
  const result = await environment.service(dossierId, planId);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.action, "generated");
    assert.equal(result.value.editorialArticleId, articleId);
  }
  assert.deepEqual(environment.counts(), { providerCalls: 1, applyCalls: 1 });

  const applied = environment.appliedInput();
  assert.ok(applied);
  assert.equal(applied?.provider, "openai");
  assert.equal(applied?.model, "gpt-5-mini-2025-08-07");
  assert.equal(applied?.promptVersion, EDITORIAL_DOSSIER_GENERATION_PROMPT_VERSION);
  assert.equal(applied?.inputHash.length, 64);
  assert.equal(applied?.inputSnapshot.version, 2);
  assert.equal(applied?.inputSnapshot.editorial_profile.version_id, profileVersionId);
  assert.equal(applied?.inputSnapshot.sources[0].dossier_source_id, sourceOneId);
  assert.equal(applied?.inputSnapshot.sources[1].dossier_source_id, sourceTwoId);
  assert.equal(applied?.inputSnapshot.plan.working_title, context().plan.workingTitle);
  assert.equal(applied?.generatedTitle, "FC Porto vence e prepara a nova época");
  assert.match(applied?.generatedPostTitle ?? "", /Dragões/);
  assert.deepEqual(applied?.sourceImages, [
    {
      sourceCode: "record",
      articleTitle: "FC Porto vence S. João de Ver",
      imageUrl: "https://cdn.example.test/fc-porto.jpg",
    },
  ]);
  assert.match(applied?.generatedBody ?? "", /FC Porto/);
  assert.match(applied?.generatedBody ?? "", /Vitória/);
});

test("o prompt separa instruções de fontes e pede a notícia completa para revisão", () => {
  const prompt = buildEditorialDossierGenerationPrompt(context());
  const payload = JSON.parse(prompt.input) as {
    titulo_de_trabalho: string;
    idioma: string;
    fontes: Array<{ fonte: string; conteudo: string[] }>;
  };

  assert.equal(payload.titulo_de_trabalho, context().plan.workingTitle);
  assert.equal(payload.idioma, "pt-PT");
  assert.equal(payload.fontes[0].fonte, "record");
  assert.equal(payload.fontes[1].fonte, "abola");
  assert.match(prompt.instructions, /título, pós-título e corpo/i);
  assert.match(prompt.instructions, /formato estruturado/i);
  assert.match(prompt.instructions, /exclusivamente factos/i);
  assert.match(prompt.instructions, /revisto por uma pessoa/i);
  assert.match(prompt.instructions, /\[LINHA_EDITORIAL_APROVADA\]/);
  assert.match(prompt.instructions, new RegExp(profileDocument));
  assert.equal(
    prompt.inputSnapshot.editorial_profile.content_hash,
    "c".repeat(64),
  );
  assert.equal(prompt.inputHash.length, 64);
  assert.equal(prompt.maxOutputTokens, 5_000);
});

test("normaliza apenas respostas estruturadas completas", () => {
  assert.deepEqual(
    normalizeGeneratedEditorialDraft(JSON.stringify({
      title: "Título editorial válido",
      post_title: "Pós-título factual suficientemente completo para revisão.",
      body: "Este é um corpo editorial com dimensão suficiente para ser aceite pela validação e seguir para revisão humana antes de qualquer publicação.",
    })),
    {
      title: "Título editorial válido",
      postTitle: "Pós-título factual suficientemente completo para revisão.",
      body: "Este é um corpo editorial com dimensão suficiente para ser aceite pela validação e seguir para revisão humana antes de qualquer publicação.",
    },
  );
  assert.equal(normalizeGeneratedEditorialDraft("texto livre"), null);
  assert.equal(normalizeGeneratedEditorialDraft(JSON.stringify({
    title: "Curto",
    post_title: "Também curto",
    body: "Insuficiente",
  })), null);
});

test("o input hash é determinístico e muda quando muda a versão editorial", () => {
  const first = buildEditorialDossierGenerationPrompt(context());
  const repeated = buildEditorialDossierGenerationPrompt(context());
  const changedContext = context();
  const changed = buildEditorialDossierGenerationPrompt({
    ...changedContext,
    plan: {
      ...changedContext.plan,
      editorialProfile: {
        ...changedContext.plan.editorialProfile!,
        versionId: "00000000-0000-4000-8000-000000000073",
        versionNumber: 2,
      },
    },
  });

  assert.equal(first.inputHash, repeated.inputHash);
  assert.notEqual(first.inputHash, changed.inputHash);
  assert.notEqual(
    first.inputSnapshot.editorial_profile.version_id,
    changed.inputSnapshot.editorial_profile.version_id,
  );
});

test("o contexto usa title_snapshot e identifica o fallback legacy", () => {
  const service = read(
    "lib/redacao-automatica/editorial-dossier-article-plan-generation-service.ts",
  );
  const frozen = buildEditorialDossierGenerationPrompt(context());
  const legacyContext = context();
  const legacy = buildEditorialDossierGenerationPrompt({
    ...legacyContext,
    sources: legacyContext.sources.map((source, index) =>
      index === 0
        ? { ...source, articleTitleOrigin: "legacy_current_article" }
        : source,
    ),
  });

  assert.match(service, /title_snapshot/);
  assert.match(
    service,
    /dossierSource\.title_snapshot\?\.trim\(\)\s*\?\s*"frozen"\s*:\s*"legacy_current_article"/,
  );
  assert.equal(
    frozen.inputSnapshot.sources[0].article_title_origin,
    "frozen",
  );
  assert.equal(
    legacy.inputSnapshot.sources[0].article_title_origin,
    "legacy_current_article",
  );
});

test("a UI, rota, provider e SQL mantêm geração explícita, draft e proveniência", () => {
  const page = read("app/admin/editorial/redacao-automatica/dossies/[id]/page.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/dossies/route.ts");
  const provider = read(
    "lib/redacao-automatica/openai-editorial-generation-provider-internal.ts",
  );
  const apply = read(
    "supabase/steps/43-redacao-automatica-linha-editorial-persistente-apply.sql",
  );

  assert.match(page, /name="action" value="generate_article_plan_draft_body"/);
  assert.match(page, /Gerar primeira versão/);
  assert.match(page, /O artigo já contém texto ou foi publicado/i);
  assert.match(route, /generateEditorialDossierArticlePlanDraftBody/);
  assert.match(route, /dossier_plan_generation/);

  assert.match(provider, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(provider, /store:\s*false/);
  assert.match(provider, /reasoning:\s*\{\s*effort:\s*"low"/);
  assert.match(provider, /type:\s*"json_schema"/);
  assert.match(provider, /required:\s*\["title", "post_title", "body"\]/);
  assert.doesNotMatch(provider, /console\.log|OPENAI_API_KEY.*return|apiKey.*message/i);

  assert.match(
    apply,
    /alter table public\.newsroom_editorial_dossier_article_plan_generations/i,
  );
  assert.match(
    apply,
    /create or replace function public\.newsroom_apply_editorial_dossier_article_plan_generation/i,
  );
  assert.match(apply, /for update/i);
  assert.match(apply, /article\.status = 'draft'/i);
  assert.match(apply, /btrim\(coalesce\(article\.body, ''\)\) = ''/i);
  assert.match(apply, /p_input_snapshot is distinct from v_input_snapshot/i);
  assert.match(apply, /generated_body_hash/i);
  assert.match(apply, /title_snapshot/i);
  assert.match(apply, /dossier-article-plan-body-v2-editorial-profile/i);
  assert.match(apply, /'reused'::text/i);
  assert.match(apply, /'applied'::text/i);
  assert.doesNotMatch([page, route, provider, apply].join("\n"), /status\s*=\s*'published'|translation_run|web_search/i);
});
