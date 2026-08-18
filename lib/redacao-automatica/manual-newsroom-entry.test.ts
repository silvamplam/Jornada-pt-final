import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildEditorialDossierGenerationPrompt,
  type EditorialDossierArticlePlanGenerationContext,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-generation-service-internal";
import {
  normalizeEditorialComposeInput,
} from "@/lib/redacao-automatica/editorial-compose-idempotency-internal";
import {
  buildEditorialArticleProvenance,
} from "@/lib/redacao-automatica/editorial-article-provenance-internal";
import {
  MANUAL_NEWSROOM_ANTETITLE_MAX_LENGTH,
  MANUAL_NEWSROOM_AUTHOR_MAX_LENGTH,
  MANUAL_NEWSROOM_BODY_MAX_LENGTH,
  MANUAL_NEWSROOM_POST_TITLE_MAX_LENGTH,
  MANUAL_NEWSROOM_SOURCE_CODE,
  MANUAL_NEWSROOM_SOURCE_LABEL,
  isManualNewsroomSource,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import {
  createManualNewsroomEntryPersistence,
  lisbonDateOnly,
  normalizeManualNewsroomEntry,
  normalizeManualNewsroomImageUrl,
  type ManualNewsroomEntryRpcArguments,
} from "@/lib/redacao-automatica/manual-newsroom-entry-internal";
import {
  isNewsroomTopicPublishedAtEligible,
  scoreNewsroomTopicCandidate,
} from "@/lib/redacao-automatica/newsroom-topic-search";

const SUBMISSION_ID = "41000000-0000-4000-8000-000000000001";
const ARTICLE_ID = "41000000-0000-4000-8000-000000000002";
const SNAPSHOT_ID = "41000000-0000-4000-8000-000000000003";
const AUTO_ARTICLE_ID = "41000000-0000-4000-8000-000000000004";
const AUTO_SNAPSHOT_ID = "41000000-0000-4000-8000-000000000005";
const DOSSIER_ID = "41000000-0000-4000-8000-000000000006";
const PLAN_ID = "41000000-0000-4000-8000-000000000007";
const EDITORIAL_ARTICLE_ID = "41000000-0000-4000-8000-000000000008";
const DOSSIER_SOURCE_ID = "41000000-0000-4000-8000-000000000009";
const STORAGE_BASE_URL = "https://project.example.invalid";
const SYNTHETIC_IMAGE_URL =
  `${STORAGE_BASE_URL}/storage/v1/object/public/editorial-images/editorial/2026/07/synthetic-image.webp`;
const NOW = new Date("2026-07-30T10:00:00.000Z");

function validInput(overrides: Partial<{
  submissionId: string;
  anteTitle: string;
  title: string;
  postTitle: string;
  author: string;
  body: string;
  publishedDate: string;
  publishedTime: string;
  imageUrl: string | null;
}> = {}) {
  return {
    submissionId: SUBMISSION_ID,
    anteTitle: "  ANTETÍTULO   sintético  ",
    title: "  Título   sintético manual  ",
    postTitle: "  Pós-título   sintético manual  ",
    author: "  Autor   Sintético  ",
    body: "Primeiro parágrafo sintético.\r\n\r\nSegundo parágrafo sintético.",
    publishedDate: "2026-07-29",
    publishedTime: "09:15",
    imageUrl: SYNTHETIC_IMAGE_URL,
    ...overrides,
  };
}

test("normaliza o artigo manual completo e preserva os parágrafos", () => {
  const result = normalizeManualNewsroomEntry(validInput(), {
    now: NOW,
    storageBaseUrl: STORAGE_BASE_URL,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.anteTitle, "ANTETÍTULO sintético");
  assert.equal(result.value.title, "Título sintético manual");
  assert.equal(result.value.postTitle, "Pós-título sintético manual");
  assert.equal(result.value.author, "Autor Sintético");
  assert.equal(
    result.value.body,
    "Primeiro parágrafo sintético.\n\nSegundo parágrafo sintético.",
  );
  assert.deepEqual(result.value.bodyBlocks, [
    { type: "paragraph", text: "Primeiro parágrafo sintético." },
    { type: "paragraph", text: "Segundo parágrafo sintético." },
  ]);
  assert.equal(result.value.publishedDate, "2026-07-29");
  assert.equal(result.value.publishedTime, "09:15");
  assert.equal(result.value.imageUrl, SYNTHETIC_IMAGE_URL);
  assert.match(result.value.requestFingerprint, /^[0-9a-f]{64}$/);
  assert.match(result.value.contentHash, /^[0-9a-f]{64}$/);
});

test("valida todos os campos canónicos sem deduplicar pelo conteúdo", () => {
  const cases = [
    [validInput({ submissionId: "invalid" }), "submission_id_invalid"],
    [validInput({ anteTitle: " " }), "ante_title_invalid"],
    [validInput({ anteTitle: "x".repeat(MANUAL_NEWSROOM_ANTETITLE_MAX_LENGTH + 1) }), "ante_title_invalid"],
    [validInput({ title: " " }), "title_invalid"],
    [validInput({ postTitle: " " }), "post_title_invalid"],
    [validInput({ postTitle: "x".repeat(MANUAL_NEWSROOM_POST_TITLE_MAX_LENGTH + 1) }), "post_title_invalid"],
    [validInput({ author: " " }), "author_invalid"],
    [validInput({ author: "x".repeat(MANUAL_NEWSROOM_AUTHOR_MAX_LENGTH + 1) }), "author_invalid"],
    [validInput({ body: " " }), "body_invalid"],
    [validInput({ body: "x".repeat(MANUAL_NEWSROOM_BODY_MAX_LENGTH + 1) }), "body_invalid"],
    [validInput({ imageUrl: null }), "image_invalid"],
  ] as const;

  for (const [input, expectedCode] of cases) {
    const result = normalizeManualNewsroomEntry(input, {
      now: NOW,
      storageBaseUrl: STORAGE_BASE_URL,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, expectedCode);
  }

  const first = normalizeManualNewsroomEntry(validInput(), {
    now: NOW,
    storageBaseUrl: STORAGE_BASE_URL,
  });
  const second = normalizeManualNewsroomEntry(validInput({
    submissionId: "41000000-0000-4000-8000-000000000099",
  }), {
    now: NOW,
    storageBaseUrl: STORAGE_BASE_URL,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.value.contentHash, second.value.contentHash);
    assert.notEqual(first.value.requestFingerprint, second.value.requestFingerprint);
  }
});

test("data e hora são separadas, válidas e não podem estar no futuro", () => {
  for (const [input, code] of [
    [validInput({ publishedDate: "2026-02-30" }), "published_date_invalid"],
    [validInput({ publishedDate: "2026-07-29T10:00" }), "published_date_invalid"],
    [validInput({ publishedTime: "25:00" }), "published_time_invalid"],
    [validInput({ publishedDate: "2026-07-31" }), "published_at_future"],
    [validInput({ publishedDate: "2026-07-30", publishedTime: "11:01" }), "published_at_future"],
  ] as const) {
    const result = normalizeManualNewsroomEntry(input, {
      now: NOW,
      storageBaseUrl: STORAGE_BASE_URL,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, code);
  }

  assert.equal(lisbonDateOnly(new Date("2026-07-30T00:30:00.000Z")), "2026-07-30");
});

test("a imagem aceita apenas o destino e extensões do upload administrativo", () => {
  assert.equal(
    normalizeManualNewsroomImageUrl(SYNTHETIC_IMAGE_URL, STORAGE_BASE_URL),
    SYNTHETIC_IMAGE_URL,
  );
  assert.equal(normalizeManualNewsroomImageUrl(null, STORAGE_BASE_URL), undefined);
  assert.equal(
    normalizeManualNewsroomImageUrl(
      "https://evil.example/storage/v1/object/public/editorial-images/editorial/image.webp",
      STORAGE_BASE_URL,
    ),
    undefined,
  );
  assert.equal(
    normalizeManualNewsroomImageUrl(
      `${SYNTHETIC_IMAGE_URL}?token=unexpected`,
      STORAGE_BASE_URL,
    ),
    undefined,
  );
  assert.equal(
    normalizeManualNewsroomImageUrl(
      `${STORAGE_BASE_URL}/storage/v1/object/public/other-bucket/editorial/image.webp`,
      STORAGE_BASE_URL,
    ),
    undefined,
  );
});

test("a persistência reutiliza a mesma submissão e cria identidades diferentes para outra chave", async () => {
  const requests = new Map<string, {
    fingerprint: string;
    articleId: string;
    snapshotId: string;
  }>();
  let createdCount = 0;

  const persist = createManualNewsroomEntryPersistence({
    configuration: () => ({ storageBaseUrl: STORAGE_BASE_URL }),
    async executeRpc(_functionName, args: ManualNewsroomEntryRpcArguments) {
      const existing = requests.get(args.p_submission_id);
      if (existing && existing.fingerprint !== args.p_request_fingerprint) {
        throw new Error("manual_entry_payload_conflict");
      }
      if (existing) {
        return [{
          submission_id: args.p_submission_id,
          request_fingerprint: existing.fingerprint,
          newsroom_article_id: existing.articleId,
          newsroom_snapshot_id: existing.snapshotId,
          entry_action: "reused",
        }];
      }

      createdCount += 1;
      const suffix = String(createdCount).padStart(12, "0");
      const value = {
        fingerprint: args.p_request_fingerprint,
        articleId: `42000000-0000-4000-8000-${suffix}`,
        snapshotId: `43000000-0000-4000-8000-${suffix}`,
      };
      requests.set(args.p_submission_id, value);
      return [{
        submission_id: args.p_submission_id,
        request_fingerprint: value.fingerprint,
        newsroom_article_id: value.articleId,
        newsroom_snapshot_id: value.snapshotId,
        entry_action: "created",
      }];
    },
  });

  const first = await persist(validInput(), { now: NOW });
  const repeated = await persist(validInput(), { now: NOW });
  const otherSubmission = await persist(validInput({
    submissionId: "41000000-0000-4000-8000-000000000099",
  }), { now: NOW });

  assert.equal(first.ok, true);
  assert.equal(repeated.ok, true);
  assert.equal(otherSubmission.ok, true);
  if (first.ok && repeated.ok && otherSubmission.ok) {
    assert.equal(first.value.action, "created");
    assert.equal(repeated.value.action, "reused");
    assert.equal(first.value.newsroomArticleId, repeated.value.newsroomArticleId);
    assert.equal(first.value.newsroomSnapshotId, repeated.value.newsroomSnapshotId);
    assert.notEqual(first.value.newsroomArticleId, otherSubmission.value.newsroomArticleId);
  }
  assert.equal(createdCount, 2);

  const conflict = await persist(validInput({ title: "Payload diferente" }), { now: NOW });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "submission_payload_conflict");
});

test("falhas de configuração e respostas inesperadas são controladas", async () => {
  const unavailable = createManualNewsroomEntryPersistence({
    configuration: () => null,
    executeRpc: async () => [],
  });
  const malformed = createManualNewsroomEntryPersistence({
    configuration: () => ({ storageBaseUrl: STORAGE_BASE_URL }),
    executeRpc: async () => [{ unexpected: true }],
  });

  const unavailableResult = await unavailable(validInput(), { now: NOW });
  const malformedResult = await malformed(validInput(), { now: NOW });
  assert.equal(unavailableResult.ok, false);
  assert.equal(malformedResult.ok, false);
  if (!unavailableResult.ok) assert.equal(unavailableResult.error.code, "service_unavailable");
  if (!malformedResult.ok) assert.equal(malformedResult.error.code, "save_failed");
});

test("a entrada manual é pesquisável por título e corpo e respeita o período", () => {
  assert.ok(scoreNewsroomTopicCandidate({
    title: "Clube sintético prepara a época",
    body: "Texto factual de teste.",
  }, "Clube sintético") > 0);
  assert.ok(scoreNewsroomTopicCandidate({
    title: "Preparação",
    body: "O Clube Sintético apresentou o projeto.",
  }, "Clube sintético") > 0);
  assert.equal(
    isNewsroomTopicPublishedAtEligible("2026-07-29T00:00:00.000Z", 7, NOW),
    true,
  );
  assert.equal(
    isNewsroomTopicPublishedAtEligible("2026-07-01T00:00:00.000Z", 7, NOW),
    false,
  );
});

test("uma fonte manual combina com uma automática no contrato existente", () => {
  const normalized = normalizeEditorialComposeInput({
    submissionId: "44000000-0000-4000-8000-000000000001",
    workingTitle: "Composição sintética",
    combineInstructions: "Combinar os factos das duas fontes.",
    highlightInstructions: "Destacar apenas factos confirmados.",
    contextInstructions: "",
    avoidInstructions: "",
    articleKind: "news",
    lengthMode: "standard",
    outputLanguage: "pt-PT",
    sources: [
      {
        newsroomArticleId: ARTICLE_ID,
        newsroomSnapshotId: SNAPSHOT_ID,
        priority: 1,
        sourceRole: "primary",
        editorialNote: "",
      },
      {
        newsroomArticleId: AUTO_ARTICLE_ID,
        newsroomSnapshotId: AUTO_SNAPSHOT_ID,
        priority: 2,
        sourceRole: "corroboration",
        editorialNote: "",
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized?.sources.length, 2);
});

test("o corpo manual entra no input normal da geração sem fluxo paralelo", () => {
  const context: EditorialDossierArticlePlanGenerationContext = {
    dossier: {
      id: DOSSIER_ID,
      title: "Dossiê sintético",
      editorialInstructions: "Instruções sintéticas.",
      contextInstructions: "",
      outputLanguage: "pt-PT",
    },
    plan: {
      id: PLAN_ID,
      dossierId: DOSSIER_ID,
      status: "ready",
      workingTitle: "Artigo sintético",
      articleKind: "news",
      lengthMode: "brief",
      editorialInstructions: "Usar as fontes congeladas.",
      editorialArticleId: EDITORIAL_ARTICLE_ID,
    },
    article: {
      id: EDITORIAL_ARTICLE_ID,
      status: "draft",
      body: "",
      updatedAt: "2026-07-30T10:00:00.000Z",
    },
    sources: [{
      dossierSourceId: DOSSIER_SOURCE_ID,
      newsroomArticleId: ARTICLE_ID,
      newsroomSnapshotId: SNAPSHOT_ID,
      sourceCode: MANUAL_NEWSROOM_SOURCE_CODE,
      articleTitle: "Título manual sintético",
      sourceRole: "primary",
      sortOrder: 1,
      editorialNote: null,
      contentHash: "a".repeat(64),
      imageUrl: null,
      body: [{ type: "paragraph", text: "Corpo manual congelado e sintético." }],
    }],
  };
  const prompt = buildEditorialDossierGenerationPrompt(context);

  assert.match(prompt.input, /Corpo manual congelado e sintético/);
  assert.match(prompt.input, /manual_entry/);
  assert.equal(prompt.inputSnapshot.sources[0].newsroom_snapshot_id, SNAPSHOT_ID);
});

test("a proveniência manual usa o snapshot congelado e omite URLs externas", () => {
  const provenance = buildEditorialArticleProvenance({
    editorialArticleId: EDITORIAL_ARTICLE_ID,
    editorialArticleStatus: "draft",
    plan: {
      id: PLAN_ID,
      dossier_id: DOSSIER_ID,
      editorial_article_id: EDITORIAL_ARTICLE_ID,
      working_title: "Plano sintético",
      article_kind: "news",
      length_mode: "brief",
      status: "ready",
      editorial_instructions: "Instruções sintéticas.",
      created_at: "2026-07-30T10:00:00.000Z",
    },
    dossier: {
      id: DOSSIER_ID,
      title: "Dossiê sintético",
      status: "draft",
      output_language: "pt-PT",
    },
    assignments: [{ dossier_source_id: DOSSIER_SOURCE_ID, sort_order: 1 }],
    dossierSources: [{
      id: DOSSIER_SOURCE_ID,
      newsroom_article_id: ARTICLE_ID,
      newsroom_snapshot_id: SNAPSHOT_ID,
      source_role: "primary",
      sort_order: 1,
      editorial_note: null,
      title_snapshot: "Título manual congelado",
      published_at_snapshot: "2026-07-29T00:00:00.000Z",
    }],
    newsroomArticles: [{
      id: ARTICLE_ID,
      source_code: MANUAL_NEWSROOM_SOURCE_CODE,
      title: "Título manual atual",
      original_url: null,
      normalized_url: null,
      published_at: "2026-07-29T00:00:00.000Z",
    }],
    snapshots: [{
      id: SNAPSHOT_ID,
      article_id: ARTICLE_ID,
      content_hash: "b".repeat(64),
      source_metadata: {
        origin: "manual",
        sourceCode: MANUAL_NEWSROOM_SOURCE_CODE,
        sourceName: MANUAL_NEWSROOM_SOURCE_LABEL,
        publishedAtPrecision: "date",
      },
      extracted_at: "2026-07-30T10:00:00.000Z",
    }],
    generation: null,
  });
  const source = provenance.sources[0];

  assert.equal(source.isManualEntry, true);
  assert.equal(source.newsroomSnapshotId, SNAPSHOT_ID);
  assert.equal(source.originalUrl, null);
  assert.equal(source.normalizedUrl, null);
  assert.equal(source.publishedAtPrecision, "date");
  assert.equal(source.contentHash, "b".repeat(64));
});

test("a origem manual é inequívoca e mantém fallback para dados legacy", () => {
  assert.equal(isManualNewsroomSource(MANUAL_NEWSROOM_SOURCE_CODE), true);
  assert.equal(isManualNewsroomSource("legacy", { origin: "manual" }), true);
  assert.equal(isManualNewsroomSource("record", { origin: "automatic" }), false);
});

test("o formulário manual recolhe o artigo canónico completo", () => {
  const source = readFileSync(
    "app/admin/editorial/redacao-automatica/_manualNewsEntryForm.tsx",
    "utf8",
  );
  assert.equal((source.match(/<label>/g) ?? []).length, 8);
  for (const label of [
    "Antetítulo",
    "Título",
    "Pós-título / resumo",
    "Autor",
    "Corpo",
    "Data",
    "Hora",
    "Imagem",
  ]) {
    assert.match(source, new RegExp(`<span>${label}</span>`));
  }
  for (const name of [
    "ante_title",
    "title",
    "post_title",
    "author",
    "body",
    "published_date",
    "published_time",
  ]) {
    assert.match(source, new RegExp(`name="${name}"`));
  }
  assert.match(source, /type="file"[\s\S]*required/);
  assert.match(source, />Guardar notícia</);
  assert.doesNotMatch(source, />Publicar/);
  assert.doesNotMatch(source, />Gerar/);
  assert.doesNotMatch(source, />Enviar para Artigos/);
});

test("o enhancer preserva submission_id, bloqueia duplo submit e mantém POST normal", () => {
  const source = readFileSync(
    "app/admin/editorial/redacao-automatica/_manualNewsEntryForm.tsx",
    "utf8",
  );
  assert.match(source, /name="submission_id" value=\{submissionId\}/);
  assert.match(source, /method="post"/);
  assert.match(source, /submittingRef\.current/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /disabled=\{submitting\}/);
  assert.match(source, /form\.submit\(\)/);
  assert.match(source, /name="image_url"/);
});

test("a rota guarda apenas no arquivo, usa 303 relativo e não tem GET nem efeitos editoriais", () => {
  const source = readFileSync(
    "app/api/admin/editorial/redacao-automatica/manual-entry/route.ts",
    "utf8",
  );
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function GET/);
  assert.match(source, /status: 303/);
  assert.match(source, /Location: `\$\{PAGE_PATH\}/);
  assert.match(source, /createManualNewsroomEntry/);
  for (const field of ["ante_title", "post_title", "author", "published_time"]) {
    assert.ok(source.includes(`formData.get("${field}")`));
  }
  assert.doesNotMatch(source, /OpenAI|generate|editorial_articles|dossier/i);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
});

test("a página mantém pesquisa por tema e integra fontes automáticas e manuais no pacote", () => {
  const source = readFileSync(
    "app/admin/editorial/redacao-automatica/page.tsx",
    "utf8",
  );
  assert.match(source, /<span>Tema<\/span>/);
  assert.match(source, /name="query"/);
  assert.match(source, /placeholder="Pesquisar"/);
  assert.match(source, />Pesquisar<\/button>/);
  assert.match(source, /ManualNewsEntryForm/);
  assert.match(source, /article\.sourceUrl && !article\.isManualEntry/);
  assert.match(source, /create-editorial-source-package/);
  assert.match(source, /Preparar fontes/);
  assert.doesNotMatch(source, /article\.usedInComposition/);
  assert.doesNotMatch(source, />Usada<\/span>/);
});
test("imagem, autenticação e segurança reutilizam os contratos administrativos existentes", () => {
  const imageRoute = readFileSync(
    "app/api/admin/editorial/artigos/upload-image/sign/route.ts",
    "utf8",
  );
  const middleware = readFileSync("middleware.ts", "utf8");
  const manualForm = readFileSync(
    "app/admin/editorial/redacao-automatica/_manualNewsEntryForm.tsx",
    "utf8",
  );

  assert.match(imageRoute, /DEFAULT_MAX_UPLOAD_MB = 8/);
  assert.match(imageRoute, /image\/jpeg/);
  assert.match(imageRoute, /image\/png/);
  assert.match(imageRoute, /image\/webp/);
  assert.match(imageRoute, /image\/avif/);
  assert.match(imageRoute, /safeFilename/);
  assert.match(imageRoute, /editorial-images/);
  assert.match(manualForm, /upload-image\/sign/);
  assert.match(middleware, /pathname\.startsWith\("\/api\/admin"\)/);
  assert.match(middleware, /verifyAdminSession/);
});

test("os steps 92–95 acrescentam a entrada manual canónica sem quebrar a RPC legacy", () => {
  const preflight = readFileSync(
    "supabase/steps/92-redacao-automatica-recolha-manual-artigo-canonico-preflight.sql",
    "utf8",
  );
  const apply = readFileSync(
    "supabase/steps/93-redacao-automatica-recolha-manual-artigo-canonico-apply.sql",
    "utf8",
  );
  const postflight = readFileSync(
    "supabase/steps/94-redacao-automatica-recolha-manual-artigo-canonico-postflight.sql",
    "utf8",
  );
  const smoke = readFileSync(
    "supabase/steps/95-redacao-automatica-recolha-manual-artigo-canonico-smoke-rollback.sql",
    "utf8",
  );

  assert.match(preflight, /'writes_performed', false/);
  assert.doesNotMatch(preflight, /^\s*(?:insert|update|delete|alter|create|drop|truncate)\s/im);
  assert.match(apply, /create function public\.newsroom_create_complete_manual_entry/);
  assert.match(apply, /p_ante_title text/);
  assert.match(apply, /p_post_title text/);
  assert.match(apply, /p_author text/);
  assert.match(apply, /p_published_time text/);
  assert.match(apply, /'publishedAtPrecision', 'instant'/);
  assert.match(apply, /'anteTitle', btrim\(p_ante_title\)/);
  assert.match(apply, /grant execute on function public\.newsroom_create_complete_manual_entry/);
  assert.match(apply, /to service_role/);
  assert.doesNotMatch(apply, /drop function public\.newsroom_create_manual_entry/);
  assert.match(postflight, /'writes_performed', false/);
  assert.match(smoke, /^begin;/im);
  assert.match(smoke, /^rollback;/im);
  assert.doesNotMatch(smoke, /^commit;/im);
});

test("os steps 38–41 preservam o contrato SQL, a idempotência e o rollback", () => {
  const step38 = readFileSync(
    "supabase/steps/38-redacao-automatica-recolha-manual-preflight.sql",
    "utf8",
  );
  const step39 = readFileSync(
    "supabase/steps/39-redacao-automatica-recolha-manual-apply.sql",
    "utf8",
  );
  const step40 = readFileSync(
    "supabase/steps/40-redacao-automatica-recolha-manual-postflight.sql",
    "utf8",
  );
  const step41 = readFileSync(
    "supabase/steps/41-redacao-automatica-recolha-manual-smoke-rollback.sql",
    "utf8",
  );

  assert.match(step38, /'writes_performed', false/);
  assert.doesNotMatch(step38, /^\s*(?:insert|update|delete|alter|create|drop|truncate)\s/im);
  assert.match(step39, /create table public\.newsroom_manual_entry_requests/);
  assert.match(step39, /security definer/);
  assert.match(step39, /set search_path = ''/);
  assert.match(
    step39,
    /on conflict on constraint newsroom_manual_entry_requests_pkey do nothing/,
  );
  assert.match(step39, /grant execute on function public\.newsroom_create_manual_entry/);
  assert.match(step39, /to service_role/);
  assert.match(step39, /from public, anon, authenticated, service_role/);
  assert.match(step39, /'ready_for_review'/);
  assert.doesNotMatch(step39, /insert into public\.editorial_articles/i);
  assert.doesNotMatch(step39, /insert into public\.newsroom_editorial_dossiers/i);
  assert.match(step40, /'writes_performed', false/);
  assert.doesNotMatch(step40, /^\s*(?:insert|update|delete|alter|create|drop|truncate)\s/im);
  assert.match(step41, /^begin;/im);
  assert.match(step41, /^rollback;/im);
  assert.doesNotMatch(step41, /^commit;/im);
  assert.match(step41, /'writes_committed', false/);
  assert.match(step41, /'residue_count'/);
  assert.match(step41, /manual_entry_payload_conflict/);
});
