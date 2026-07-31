import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  articleAdminRedirect,
  articleAdminRedirectLocation,
  isArticleAdminUuid,
  safeArticleAdminReturnTo,
} from "@/lib/admin-article-redirect";
import {
  articleEditorialWorkflowStep,
  dossierEditorialWorkflowStep,
  editorialWorkflowStepState,
  formatNewsroomPublishedAt,
} from "@/lib/redacao-automatica/editorial-workflow-ux";
import {
  publishedAtPrecisionFromSourceMetadata,
} from "@/lib/redacao-automatica/types";

test("o Dossiê avança pela primeira etapa editorial ainda incompleta", () => {
  assert.equal(dossierEditorialWorkflowStep({ includedSourceCount: 0, plans: [] }), "sources");
  assert.equal(dossierEditorialWorkflowStep({ includedSourceCount: 2, plans: [] }), "planning");
  assert.equal(dossierEditorialWorkflowStep({
    includedSourceCount: 2,
    plans: [{
      status: "ready",
      sortOrder: 10,
      editorialArticleId: "article-1",
      editorialArticleStatus: "draft",
      editorialArticleHasBody: false,
    }],
  }), "draft");
  assert.equal(dossierEditorialWorkflowStep({
    includedSourceCount: 2,
    plans: [{
      status: "ready",
      sortOrder: 10,
      editorialArticleId: "article-1",
      editorialArticleStatus: "draft",
      editorialArticleHasBody: true,
    }],
  }), "review");
  assert.equal(dossierEditorialWorkflowStep({
    includedSourceCount: 2,
    plans: [{
      status: "ready",
      sortOrder: 10,
      editorialArticleId: "article-1",
      editorialArticleStatus: "published",
      editorialArticleHasBody: true,
    }],
  }), "publication");
});

test("o editor distingue rascunho vazio, revisão e publicação", () => {
  assert.equal(articleEditorialWorkflowStep({ status: "draft", body: "" }), "draft");
  assert.equal(articleEditorialWorkflowStep({ status: "draft", body: "Texto revisto." }), "review");
  assert.equal(articleEditorialWorkflowStep({ status: "published", body: "Texto final." }), "publication");
  assert.equal(editorialWorkflowStepState("review", "draft"), "complete");
  assert.equal(editorialWorkflowStepState("review", "review"), "current");
  assert.equal(editorialWorkflowStepState("review", "publication"), "upcoming");
});

test("os redirects dos Artigos usam Location relativa e preservam os indicadores", () => {
  const articleId = "11111111-2222-4333-8444-555555555555";
  const cases = [
    { params: { articleId, saved: "1" }, indicator: "saved", expected: "1" },
    { params: { articleId, created: "1" }, indicator: "created", expected: "1" },
    { params: { articleId, published: "1" }, indicator: "published", expected: "1" },
    { params: { removed: "1" }, indicator: "removed", expected: "1" },
    { params: { error: "invalid-action" }, indicator: "error", expected: "invalid-action" },
  ] as const;

  for (const { params, indicator, expected } of cases) {
    const response = articleAdminRedirect("/admin/editorial/artigos", params);
    const location = response.headers.get("location");

    assert.equal(response.status, 303);
    assert.ok(location);
    assert.match(location, /^\/admin\/editorial\/artigos(?:\?|$)/);
    assert.equal(new URL(location, "https://jornada.local").searchParams.get(indicator), expected);
    assert.doesNotMatch(location, /0\.0\.0\.0/);

    if ("articleId" in params) {
      assert.equal(new URL(location, "https://jornada.local").searchParams.get("articleId"), articleId);
    }
  }
});

test("o browser resolve o redirect dos Artigos na origem pela qual acedeu", () => {
  const articleId = "11111111-2222-4333-8444-555555555555";
  const location = articleAdminRedirectLocation("/admin/editorial/artigos", {
    articleId,
    saved: "1",
  });
  const origins = [
    "http://localhost:3000",
    "https://jornada-preview.example",
    "https://www.jornada.pt",
  ];

  for (const origin of origins) {
    const resolved = new URL(location, origin);
    assert.equal(resolved.origin, origin);
    assert.equal(resolved.pathname, "/admin/editorial/artigos");
    assert.equal(resolved.searchParams.get("articleId"), articleId);
    assert.equal(resolved.searchParams.get("saved"), "1");
  }
});

test("o redirect dos Artigos rejeita origens e identificadores fornecidos pelo utilizador", () => {
  const articleId = "11111111-2222-4333-8444-555555555555";

  assert.equal(
    safeArticleAdminReturnTo(`/admin/editorial/artigos?articleId=${articleId}`),
    `/admin/editorial/artigos?articleId=${articleId}`,
  );
  assert.equal(safeArticleAdminReturnTo("https://evil.example/admin/editorial/artigos"), null);
  assert.equal(safeArticleAdminReturnTo("//evil.example/admin/editorial/artigos"), null);
  assert.equal(safeArticleAdminReturnTo("/admin/login"), null);
  assert.equal(isArticleAdminUuid(articleId), true);
  assert.equal(isArticleAdminUuid("not-a-uuid"), false);
  assert.equal(isArticleAdminUuid(null), false);
  assert.throws(
    () => articleAdminRedirectLocation("https://evil.example/admin/editorial/artigos", { saved: "1" }),
    /invalid-return-to/,
  );
});

test("a rota dos Artigos não reconstrói redirects a partir do endereço de escuta", () => {
  const route = readFileSync("app/api/admin/editorial/artigos/route.ts", "utf8");
  const redirectHelper = readFileSync("lib/admin-article-redirect.ts", "utf8");

  assert.match(redirectHelper, /new NextResponse\(null, \{/);
  assert.match(redirectHelper, /Location: articleAdminRedirectLocation\(path, params\)/);
  assert.doesNotMatch(route, /new URL\(path, request\.url\)/);
  assert.doesNotMatch(redirectHelper, /request\.url|request\.nextUrl/);
  assert.doesNotMatch(route, /x-forwarded-host|x-forwarded-proto/i);
  assert.doesNotMatch(redirectHelper, /x-forwarded-host|x-forwarded-proto/i);
  assert.doesNotMatch(route, /process\.env\.(?:HOST|HOSTNAME|URL|ORIGIN)/);
  assert.doesNotMatch(redirectHelper, /process\.env\.(?:HOST|HOSTNAME|URL|ORIGIN)/);
  assert.match(route, /cleanArticleId\(formData\.get\("article_id"\)\)/);
  assert.match(route, /editorialAction === "publish"/);
  assert.match(
    route,
    /editorialAction === "publish"\s*\?\s*"published"\s*:\s*cleanStatus\(currentArticle\.status\)/,
  );
  assert.doesNotMatch(route, /OpenAI|generateEditorial|dossier_sources/i);
});

test("a precisão de publicação é validada sem ser inferida pela hora", () => {
  assert.equal(
    publishedAtPrecisionFromSourceMetadata({ publishedAtPrecision: "date" }),
    "date",
  );
  assert.equal(
    publishedAtPrecisionFromSourceMetadata({ publishedAtPrecision: "instant" }),
    "instant",
  );
  assert.equal(publishedAtPrecisionFromSourceMetadata({}), null);
  assert.equal(
    publishedAtPrecisionFromSourceMetadata({ publishedAtPrecision: "unknown" }),
    null,
  );
  assert.equal(
    publishedAtPrecisionFromSourceMetadata({
      publishedAt: "2026-07-29T00:00:00.000Z",
    }),
    null,
  );
});

test("a data de publicação respeita a precisão original", () => {
  const dateOnly = formatNewsroomPublishedAt(
    "2026-07-29T00:00:00.000Z",
    "date",
  );
  assert.equal(dateOnly, "29 de julho de 2026");
  assert.doesNotMatch(dateOnly, /(?:00:00|01:00|às)/);

  const instant = formatNewsroomPublishedAt(
    "2026-07-29T09:30:00.000Z",
    "instant",
  );
  assert.equal(instant, "29 de julho de 2026, às 10:30");

  const legacy = formatNewsroomPublishedAt(
    "2026-07-29T09:30:00.000Z",
    null,
  );
  assert.equal(legacy, "29 de julho de 2026, às 10:30");

  assert.equal(formatNewsroomPublishedAt("data-inválida", null), "data inválida");
});

test("a composição principal apresenta atualidade, uma instrução e revisão", () => {
  const newsroom = readFileSync("app/admin/editorial/redacao-automatica/page.tsx", "utf8");
  const repository = readFileSync("lib/redacao-automatica/newsroom-article-repository.ts", "utf8");
  const workflow = readFileSync("lib/redacao-automatica/editorial-workflow-ux.ts", "utf8");
  const styles = readFileSync(
    "app/admin/editorial/redacao-automatica/redacao-automatica.module.css",
    "utf8",
  );
  const route = readFileSync("app/api/admin/editorial/redacao-automatica/dossies/route.ts", "utf8");
  const feedRoute = readFileSync(
    "app/api/admin/editorial/redacao-automatica/current-feed/route.ts",
    "utf8",
  );

  assert.match(newsroom, /<strong>Atualidade<\/strong>/);
  assert.match(newsroom, /<strong>Criar notícia<\/strong>/);
  assert.match(newsroom, /<strong>Revisão<\/strong>/);
  assert.match(newsroom, /listCurrentNewsroomArticles/);
  assert.match(newsroom, />Atualizar<\/button>/);
  assert.match(newsroom, /id="create-editorial-composition"/);
  assert.match(newsroom, /name="newsroom_article_id"/);
  assert.match(newsroom, /name="ai_instructions"/);
  assert.match(newsroom, /A linha editorial não está disponível/);
  assert.match(newsroom, /<time dateTime=\{article\.publishedAt\}>/);
  assert.match(
    newsroom,
    /formatNewsroomPublishedAt\(\s*article\.publishedAt,\s*article\.publishedAtPrecision,\s*\)/,
  );
  assert.match(newsroom, /Abrir fonte/);
  assert.match(newsroom, /name="query"/);
  assert.match(newsroom, /ManualNewsEntryForm/);
  assert.match(newsroom, /article\.usedInComposition/);
  assert.match(newsroom, /CurrentFeedReveal/);
  assert.doesNotMatch(newsroom, /name="combine_instructions"/);
  assert.doesNotMatch(newsroom, /Detalhes técnicos da pesquisa/);
  assert.doesNotMatch(newsroom, />Prioridade</);
  assert.doesNotMatch(newsroom, />Função na composição</);
  assert.match(styles, /REDACAO-AUTOMATICA-FLUXO-SIMPLES-INICIO/);
  assert.match(repository, /listCurrentNewsroomArticles/);
  assert.match(repository, /newsroom_editorial_dossier_sources\?select=newsroom_article_id/);
  assert.match(repository, /included=eq\.true/);
  assert.doesNotMatch(repository, /!usedArticleIds\.has\(row\.id\)/);
  assert.match(workflow, /new Intl\.DateTimeFormat\("pt-PT"/);
  assert.match(workflow, /timeZone: "Europe\/Lisbon"/);

  assert.match(feedRoute, /refreshNewsroomCurrentFeed/);
  assert.match(feedRoute, /export const maxDuration = 300/);

  assert.match(route, /action === "compose"/);
  assert.match(route, /const aiInstructions = cleanText\(formData\.get\("ai_instructions"\)\)/);
  assert.match(route, /index === 0 \? "primary" : "complementary"/);
  assert.match(route, /const composeResult = await prepareEditorialCompose/);
  assert.match(route, /const generationResult = await runEditorialComposeGeneration/);
  assert.match(route, /claim: \(\) => claimEditorialComposeGeneration/);
  assert.match(route, /generate: \(\) => generateEditorialDossierArticlePlanDraftBody/);
  assert.match(route, /markEditorialComposeGenerationCompleted/);
  assert.match(route, /dossier_plan_generation/);

  const prepareIndex = route.indexOf("const composeResult = await prepareEditorialCompose");
  const generationIndex = route.indexOf("const generationResult = await runEditorialComposeGeneration");

  assert.ok(prepareIndex >= 0 && prepareIndex < generationIndex);
});

test("a simples leitura da página não inicia recolha, geração ou publicação", () => {
  const newsroom = readFileSync("app/admin/editorial/redacao-automatica/page.tsx", "utf8");

  assert.doesNotMatch(newsroom, /searchExternalNewsroomTopic/);
  assert.doesNotMatch(newsroom, /ingestHttpNewsroomArticle/);
  assert.doesNotMatch(newsroom, /generateEditorialDossierArticlePlanDraftBody/);
  assert.doesNotMatch(newsroom, /publishEditorial/);
  assert.match(
    newsroom,
    /<form action="\/api\/admin\/editorial\/redacao-automatica\/current-feed" method="post">/,
  );
});

test("o Dossiê fica identificado como gestão avançada e a revisão permanece nos Artigos", () => {
  const dossier = readFileSync("app/admin/editorial/redacao-automatica/dossies/[id]/page.tsx", "utf8");
  const editor = readFileSync("app/admin/editorial/artigos/_articleForm.tsx", "utf8");
  const route = readFileSync("app/api/admin/editorial/artigos/route.ts", "utf8");

  assert.match(dossier, /Gestão avançada/);
  assert.match(dossier, /Voltar à nova composição/);
  assert.match(dossier, /Registo técnico da geração/);
  assert.match(editor, /Guardar em revisão/);
  assert.match(editor, />\s*Publicar\s*</);
  assert.doesNotMatch(editor, /<select name="status"/);
  assert.match(route, /editorial_action/);
  assert.match(route, /missing-body/);
});
