import assert from "node:assert/strict";
import test from "node:test";

import { abolaAdapter } from "@/lib/redacao-automatica/adapters/abola";
import { recordAdapter } from "@/lib/redacao-automatica/adapters/record";
import {
  NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT,
  NEWSROOM_TOPIC_INGESTION_CONCURRENCY,
  NEWSROOM_TOPIC_RECOVERY_LIMIT,
  NEWSROOM_TOPIC_SOURCE_ATTEMPT_LIMIT,
  aggregateNewsroomTopicFailureReasons,
  compactNewsroomExternalTopicSearchSourceReports,
  createNewsroomExternalTopicSearch,
  parseNewsroomExternalTopicSearchSourceReports,
  selectNewsroomExternalTopicCandidates,
} from "@/lib/redacao-automatica/newsroom-external-topic-search-internal";
import type {
  HttpNewsroomIngestionError,
} from "@/lib/redacao-automatica/http-newsroom-ingestion-internal";
import type { NewsroomTopicArchiveOutcome } from "@/lib/redacao-automatica/newsroom-topic-search";
import type {
  ArticleLinkCandidate,
  CollectionError,
  LoadedPage,
  OperationResult,
  SourceCollectionSummary,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

const TIMESTAMP = "2026-07-29T18:00:00.000Z";

const RECORD_SOURCE: SourceConfiguration = {
  code: "record",
  name: "Record",
  domain: "record.pt",
  homepage: "https://www.record.pt/",
  adapterKey: "record",
  operationalStatus: "paused",
  monitoringEnabled: false,
  manualCollectionEnabled: true,
  inactiveReason: "Monitorização automática inativa.",
  legalNote: null,
  editorialNote: "Pesquisa manual permitida.",
  displayOrder: 10,
};

const ABOLA_SOURCE: SourceConfiguration = {
  code: "abola",
  name: "A Bola",
  domain: "abola.pt",
  homepage: "https://www.abola.pt/",
  adapterKey: "abola",
  operationalStatus: "paused",
  monitoringEnabled: false,
  manualCollectionEnabled: true,
  inactiveReason: "Monitorização automática inativa.",
  legalNote: null,
  editorialNote: "Pesquisa manual permitida.",
  displayOrder: 20,
};

const MAISFUTEBOL_SOURCE: SourceConfiguration = {
  code: "maisfutebol",
  name: "Maisfutebol",
  domain: "maisfutebol.iol.pt",
  homepage: "https://maisfutebol.iol.pt/",
  adapterKey: null,
  operationalStatus: "paused",
  monitoringEnabled: false,
  manualCollectionEnabled: false,
  inactiveReason: "Pesquisa externa indisponível.",
  legalNote: null,
  editorialNote: "Sem adaptador HTTP ativo.",
  displayOrder: 30,
};

const OJOGO_SOURCE: SourceConfiguration = {
  code: "ojogo",
  name: "O Jogo",
  domain: "ojogo.pt",
  homepage: "https://www.ojogo.pt/",
  adapterKey: null,
  operationalStatus: "legal_hold",
  monitoringEnabled: false,
  manualCollectionEnabled: false,
  inactiveReason: "Pesquisa externa indisponível.",
  legalNote: "Validação jurídica necessária.",
  editorialNote: "Sem adaptador HTTP ativo.",
  displayOrder: 40,
};

function candidate(
  sourceCode: string,
  slug: string,
  anchorText: string,
): ArticleLinkCandidate {
  const hostname = sourceCode === "record" ? "www.record.pt" : "www.abola.pt";
  const normalizedUrl = sourceCode === "record"
    ? `https://${hostname}/futebol/futebol-nacional/liga-betclic/detalhe/${slug}`
    : `https://${hostname}/noticias/${slug}-1234567890123456789`;

  return {
    sourceCode,
    originalUrl: normalizedUrl,
    normalizedUrl,
    sourcePageUrl: `https://${hostname}/`,
    detectedAt: TIMESTAMP,
    sourceMetadata: {
      discoveryMethod: "anchor",
      anchorText,
    },
  };
}

function collectionSuccess(
  sourceCode: string,
  candidates: readonly ArticleLinkCandidate[],
): OperationResult<SourceCollectionSummary, CollectionError> {
  return {
    ok: true,
    value: {
      sourceCode,
      startedAt: TIMESTAMP,
      finishedAt: TIMESTAMP,
      listingUrls: [`https://${sourceCode === "record" ? "www.record.pt" : "www.abola.pt"}/`],
      loadedListingCount: 1,
      discoveredCount: candidates.length,
      acceptedCount: candidates.length,
      duplicateCount: 0,
      rejectedCount: 0,
      candidates,
      errors: [],
    },
  };
}

function collectionFailure(sourceCode: string): OperationResult<SourceCollectionSummary, CollectionError> {
  return {
    ok: false,
    error: {
      code: "timeout",
      stage: "listing",
      sourceCode,
      url: null,
      recoverable: true,
      detail: "Timeout sintético.",
    },
  };
}

function ingestionSuccess(
  sourceCode: string,
  articleUrl: string,
  action: "created" | "updated" | "reused" = "created",
  id = `article-${encodeURIComponent(articleUrl)}`,
) {
  void sourceCode;
  return {
    ok: true as const,
    value: {
      article: { id, action },
    },
  };
}

function ingestionFailure(
  sourceCode: string,
  overrides: Partial<HttpNewsroomIngestionError> = {},
) {
  return {
    ok: false as const,
    error: {
      sourceCode,
      code: "load_failed" as const,
      stage: "loading" as const,
      message: "fetch SECRET <html>raw</html> stack https://www.record.pt/segredo?token=abc",
      persistenceCode: null,
      operationIncomplete: false as const,
      ...overrides,
    },
  };
}

function loadedPage(body: string, finalUrl: string): LoadedPage {
  return {
    requestedUrl: finalUrl,
    finalUrl,
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body,
    loadedAt: TIMESTAMP,
    redirectCount: 0,
    byteLength: Buffer.byteLength(body),
  };
}

test("os adaptadores preservam o texto visível das ligações para a pesquisa temática", () => {
  const recordUrl = "https://www.record.pt/futebol/futebol-nacional/liga-betclic/detalhe/fc-porto-prepara-nova-epoca";
  const recordResult = recordAdapter.discoverArticleLinks({
    source: RECORD_SOURCE,
    page: loadedPage(
      `<a href="${recordUrl}"> FC Porto prepara   a nova época </a>`,
      "https://www.record.pt/",
    ),
  });
  assert.equal(recordResult.ok, true);
  if (recordResult.ok) {
    assert.equal(recordResult.value[0]?.sourceMetadata.anchorText, "FC Porto prepara a nova época");
  }

  const abolaUrl = "https://www.abola.pt/noticias/sporting-fecha-preparacao-1234567890123456789";
  const abolaResult = abolaAdapter.discoverArticleLinks({
    source: ABOLA_SOURCE,
    page: loadedPage(
      `<a href="${abolaUrl}" aria-label="Sporting fecha preparação"></a>`,
      "https://www.abola.pt/ultimas-noticias/",
    ),
  });
  assert.equal(abolaResult.ok, true);
  if (abolaResult.ok) {
    assert.equal(abolaResult.value[0]?.sourceMetadata.anchorText, "Sporting fecha preparação");
  }
});

test("seleciona apenas ligações relacionadas, sem fallback de pontuação zero", () => {
  const candidates = [
    candidate("record", "fc-porto-prepara-nova-epoca", "FC Porto prepara a nova época"),
    candidate("record", "benfica-regressa-ao-trabalho", "Benfica regressa ao trabalho"),
    candidate("record", "mercado-fc-porto", "Mercado: FC Porto avalia reforço"),
    candidate("record", "sporting-joga-amanha", "Sporting joga amanhã"),
  ];

  const selected = selectNewsroomExternalTopicCandidates(candidates, "FC Porto", 4);
  assert.deepEqual(
    selected.map((item) => item.normalizedUrl),
    [
      candidates[0].normalizedUrl,
      candidates[2].normalizedUrl,
    ],
  );
});

test("a pesquisa consulta apenas fontes manuais autorizadas e devolve resultado parcial controlado", async () => {
  const recordCandidates = [
    candidate("record", "fc-porto-prepara-nova-epoca", "FC Porto prepara a nova época"),
    candidate("record", "fc-porto-mercado", "Mercado do FC Porto"),
    candidate("record", "benfica-treino", "Benfica regressa ao treino"),
  ];
  const collectedSources: string[] = [];
  const ingestedUrls: string[] = [];
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE, MAISFUTEBOL_SOURCE, OJOGO_SOURCE],
    async collectSource(input) {
      collectedSources.push(input.sourceCode);
      return input.sourceCode === "record"
        ? collectionSuccess("record", recordCandidates)
        : collectionFailure(input.sourceCode);
    },
    async ingestArticle(input) {
      ingestedUrls.push(input.articleUrl);
      return input.articleUrl.includes("fc-porto-mercado")
        ? ingestionFailure(input.sourceCode)
        : ingestionSuccess(input.sourceCode, input.articleUrl);
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "FC Porto" });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(collectedSources, ["record", "abola"]);
  assert.equal(collectedSources.includes("maisfutebol"), false);
  assert.equal(collectedSources.includes("ojogo"), false);
  assert.equal(result.value.status, "partial");
  assert.equal(result.value.failedSourceCount, 1);
  assert.equal(result.value.failedIngestionCount, 1);
  assert.equal(result.value.ingestedCount, 1);
  assert.equal(result.value.selectedCount, 2);
  assert.equal(result.value.candidateLinkCount, 3);
  assert.equal(result.value.attemptedArticleCount, 2);
  assert.equal(result.value.readArticleCount, 1);
  assert.equal(result.value.failedArticleCount, 1);
  assert.deepEqual(result.value.failureReasonCounts, [{
    sourceCode: "record",
    stage: "loading",
    code: "load_failed",
    count: 1,
  }]);
  assert.equal(ingestedUrls.length, 2);
});

test("devolve IDs persistidos e classifica created, updated e reused uma vez por ID", async () => {
  const candidates = [
    candidate("record", "fc-porto-preparacao", "FC Porto inicia preparação"),
    candidate("record", "fc-porto-estagio", "FC Porto inicia estágio"),
    candidate("record", "fc-porto-treino", "FC Porto regressa ao treino"),
    candidate("record", "fc-porto-amigavel", "FC Porto agenda amigável"),
  ];
  const actions = ["created", "reused", "updated", "reused"] as const;
  const ids = ["article-1", "article-1", "article-2", "article-3"] as const;
  let ingestionIndex = 0;
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE],
    async collectSource() {
      return collectionSuccess("record", candidates);
    },
    async ingestArticle(input) {
      const index = ingestionIndex;
      ingestionIndex += 1;
      return ingestionSuccess(input.sourceCode, input.articleUrl, actions[index], ids[index]);
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "FC Porto" });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.value.articles, [
    { id: "article-1", action: "created" },
    { id: "article-2", action: "updated" },
    { id: "article-3", action: "reused" },
  ]);
  assert.equal(result.value.attemptedArticleCount, 4);
  assert.equal(result.value.readArticleCount, 3);
  assert.equal(result.value.failedArticleCount, 0);
  assert.deepEqual(result.value.failureReasonCounts, []);
  assert.equal(result.value.createdCount, 1);
  assert.equal(result.value.updatedCount, 1);
  assert.equal(result.value.reusedCount, 1);
});

test("mantém estado parcial quando uma fonte falha e a restante não encontra candidatos", async () => {
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE],
    async collectSource(input) {
      return input.sourceCode === "record"
        ? collectionSuccess("record", [])
        : collectionFailure(input.sourceCode);
    },
    async ingestArticle(input) {
      return ingestionSuccess(input.sourceCode, input.articleUrl);
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "Liga Portugal" });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.status, "partial");
  assert.equal(result.value.selectedCount, 0);
  assert.equal(result.value.failedSourceCount, 1);
});

test("Maisfutebol e O Jogo são rejeitados antes de qualquer HTTP", async () => {
  let collectionCalls = 0;
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, MAISFUTEBOL_SOURCE, OJOGO_SOURCE],
    async collectSource() {
      collectionCalls += 1;
      return collectionSuccess("record", []);
    },
    async ingestArticle(input) {
      return ingestionSuccess(input.sourceCode, input.articleUrl);
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "Liga Portugal", sourceCode: "maisfutebol" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "source_unavailable");
  }
  const jogoResult = await search({ topic: "Liga Portugal", sourceCode: "ojogo" });
  assert.equal(jogoResult.ok, false);
  if (!jogoResult.ok) {
    assert.equal(jogoResult.error.code, "source_unavailable");
  }
  assert.equal(collectionCalls, 0);
});

test("falha controladamente quando nenhuma fonte consegue devolver a listagem", async () => {
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE],
    async collectSource(input) {
      return collectionFailure(input.sourceCode);
    },
    async ingestArticle(input) {
      return ingestionSuccess(input.sourceCode, input.articleUrl);
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "Liga Portugal" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "collection_unavailable");
  }
});

test("rejeita um tema vazio antes de recolher ou ingerir", async () => {
  let collectionCalls = 0;
  let ingestionCalls = 0;
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE],
    async collectSource() {
      collectionCalls += 1;
      return collectionSuccess("record", []);
    },
    async ingestArticle(input) {
      ingestionCalls += 1;
      return ingestionSuccess(input.sourceCode, input.articleUrl);
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "de e para" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
  }
  assert.equal(collectionCalls, 0);
  assert.equal(ingestionCalls, 0);
});

test("continua após falhas até quatro artigos realmente elegíveis", async () => {
  const recordCandidates = Array.from({ length: 4 }, (_, index) => candidate(
    "record",
    `fc-porto-record-${index + 1}`,
    `FC Porto preparação Record ${index + 1}`,
  ));
  const abolaCandidates = Array.from({ length: 4 }, (_, index) => candidate(
    "abola",
    `fc-porto-abola-${index + 1}`,
    `FC Porto preparação A Bola ${index + 1}`,
  ));
  const persistedIds: string[] = [];
  const attemptedUrls: string[] = [];
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE],
    async collectSource(input) {
      return collectionSuccess(
        input.sourceCode,
        input.sourceCode === "record" ? recordCandidates : abolaCandidates,
      );
    },
    async ingestArticle(input) {
      attemptedUrls.push(input.articleUrl);
      if (input.articleUrl.endsWith("-1") || input.articleUrl.includes("-1-123")) {
        return ingestionFailure(input.sourceCode);
      }
      const id = `read-${persistedIds.length + 1}`;
      persistedIds.push(id);
      return ingestionSuccess(input.sourceCode, input.articleUrl, "created", id);
    },
    async searchArchive() {
      return {
        ok: true,
        value: {
          articleIds: persistedIds,
          reasonsByArticleId: Object.fromEntries(
            persistedIds.map((id) => [id, "eligible" as const]),
          ),
        },
      };
    },
    async listUndatedRecoveryCandidates() {
      return { ok: true, value: [] };
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "FC Porto pré-época", periodDays: 30 });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.stopReason, "target_reached");
  assert.equal(result.value.attemptedArticleCount, 6);
  assert.equal(result.value.failedArticleCount, 2);
  assert.equal(result.value.readArticleCount, 4);
  assert.equal(result.value.finalEligibleArticleCount, 4);
  assert.deepEqual(
    attemptedUrls.slice(0, 2).map((url) => url.includes("record") ? "record" : "abola"),
    ["record", "abola"],
  );
});

test("artigos sem data, fora do período ou irrelevantes não preenchem o objetivo e o teto global é oito", async () => {
  const reasons: NewsroomTopicArchiveOutcome[] = [
    "published_at_missing",
    "outside_period",
    "entity_missing",
    "published_at_missing",
    "outside_period",
    "entity_missing",
    "eligible",
    "eligible",
  ];
  const candidatesBySource = new Map([
    ["record", Array.from({ length: 5 }, (_, index) => candidate(
      "record",
      `fc-porto-record-limit-${index}`,
      `FC Porto preparação Record ${index}`,
    ))],
    ["abola", Array.from({ length: 5 }, (_, index) => candidate(
      "abola",
      `fc-porto-abola-limit-${index}`,
      `FC Porto preparação A Bola ${index}`,
    ))],
  ]);
  const persistedIds: string[] = [];
  const reasonById: Record<string, NewsroomTopicArchiveOutcome> = {};
  let active = 0;
  let maximumActive = 0;
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE],
    async collectSource(input) {
      return collectionSuccess(input.sourceCode, candidatesBySource.get(input.sourceCode) ?? []);
    },
    async ingestArticle(input) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      const id = `limited-${persistedIds.length}`;
      reasonById[id] = reasons[persistedIds.length];
      persistedIds.push(id);
      return ingestionSuccess(input.sourceCode, input.articleUrl, "created", id);
    },
    async searchArchive() {
      return {
        ok: true,
        value: {
          articleIds: persistedIds.filter((id) => reasonById[id] === "eligible"),
          reasonsByArticleId: reasonById,
        },
      };
    },
    async listUndatedRecoveryCandidates() {
      return { ok: true, value: [] };
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "FC Porto pré-época", periodDays: 30 });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.stopReason, "attempt_limit");
  assert.equal(result.value.attemptedArticleCount, NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT);
  assert.equal(result.value.finalEligibleArticleCount, 2);
  assert.equal(result.value.attemptedExclusionCounts.published_at_missing, 2);
  assert.equal(result.value.attemptedExclusionCounts.outside_period, 2);
  assert.equal(result.value.attemptedExclusionCounts.entity_missing, 2);
  assert.equal(result.value.attemptedExclusionCounts.eligible, 2);
  assert.equal(result.value.positiveNotAttemptedByLimitCount, 2);
  assert.ok(maximumActive <= NEWSROOM_TOPIC_INGESTION_CONCURRENCY);
});

test("aplica o máximo de seis por fonte e esgota naturalmente filas menores", async () => {
  const many = Array.from({ length: 10 }, (_, index) => candidate(
    "record",
    `fc-porto-source-limit-${index}`,
    `FC Porto preparação ${index}`,
  ));
  let attempts = 0;
  const limitedSearch = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE],
    async collectSource() {
      return collectionSuccess("record", many);
    },
    async ingestArticle(input) {
      attempts += 1;
      return ingestionSuccess("record", input.articleUrl, "created", `source-${attempts}`);
    },
    async searchArchive() {
      return {
        ok: true,
        value: {
          articleIds: [],
          reasonsByArticleId: Object.fromEntries(
            Array.from({ length: attempts }, (_, index) => [
              `source-${index + 1}`,
              "published_at_missing" as const,
            ]),
          ),
        },
      };
    },
    clock: () => new Date(TIMESTAMP),
  });
  const limited = await limitedSearch({ topic: "FC Porto pré-época" });
  assert.equal(limited.ok, true);
  if (limited.ok) {
    assert.equal(limited.value.attemptedArticleCount, NEWSROOM_TOPIC_SOURCE_ATTEMPT_LIMIT);
    assert.equal(limited.value.stopReason, "attempt_limit");
  }

  const smallSearch = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE],
    async collectSource() {
      return collectionSuccess("record", many.slice(0, 3));
    },
    async ingestArticle(input) {
      return ingestionSuccess("record", input.articleUrl);
    },
    clock: () => new Date(TIMESTAMP),
  });
  const exhausted = await smallSearch({ topic: "FC Porto pré-época" });
  assert.equal(exhausted.ok, true);
  if (exhausted.ok) {
    assert.equal(exhausted.value.attemptedArticleCount, 3);
    assert.equal(exhausted.value.stopReason, "candidates_exhausted");
  }
});

test("equilibra Record e A Bola e deixa uma fonte usar o orçamento remanescente", async () => {
  const order: string[] = [];
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE],
    async collectSource(input) {
      return collectionSuccess(
        input.sourceCode,
        input.sourceCode === "record"
          ? Array.from({ length: 6 }, (_, index) => candidate(
              "record",
              `fc-porto-balanced-${index}`,
              `FC Porto preparação ${index}`,
            ))
          : [candidate("abola", "fc-porto-balanced", "FC Porto preparação")],
      );
    },
    async ingestArticle(input) {
      order.push(input.sourceCode);
      return ingestionSuccess(
        input.sourceCode,
        input.articleUrl,
        "created",
        `balanced-${order.length}`,
      );
    },
    async searchArchive() {
      return {
        ok: true,
        value: {
          articleIds: [],
          reasonsByArticleId: Object.fromEntries(
            order.map((_, index) => [`balanced-${index + 1}`, "published_at_missing" as const]),
          ),
        },
      };
    },
    clock: () => new Date(TIMESTAMP),
  });
  const result = await search({ topic: "FC Porto pré-época" });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(order.slice(0, 2), ["record", "abola"]);
  assert.equal(order.filter((sourceCode) => sourceCode === "abola").length, 1);
  assert.equal(order.filter((sourceCode) => sourceCode === "record").length, 6);
  assert.equal(result.value.attemptedArticleCount, 7);
});

test("a recuperação antiga é limitada, cumpre cooldown e partilha o orçamento progressivo", async () => {
  const current = Array.from({ length: 6 }, (_, index) => candidate(
    "record",
    `fc-porto-current-${index}`,
    `FC Porto preparação atual ${index}`,
  ));
  const attemptOrder: string[] = [];
  const ids: string[] = [];
  const reasons: Record<string, NewsroomTopicArchiveOutcome> = {};
  let recoveryInput: { limit: number; cooldownHours: number; now: Date } | null = null;
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE],
    async collectSource(input) {
      return collectionSuccess(
        input.sourceCode,
        input.sourceCode === "record"
          ? current
          : Array.from({ length: 6 }, (_, index) => candidate(
              "abola",
              `fc-porto-current-abola-${index}`,
              `FC Porto preparação atual A Bola ${index}`,
            )),
      );
    },
    async listUndatedRecoveryCandidates(input) {
      recoveryInput = input;
      return {
        ok: true,
        value: Array.from({ length: 5 }, (_, index) => ({
          id: `old-${index}`,
          sourceCode: "record",
          normalizedUrl: `https://www.record.pt/futebol/futebol-nacional/liga-betclic/detalhe/fc-porto-old-${index}`,
        })),
      };
    },
    async ingestArticle(input) {
      const isRecovery = input.articleUrl.includes("-old-");
      attemptOrder.push(isRecovery ? "recovery" : "current");
      const id = `mixed-${ids.length}`;
      ids.push(id);
      reasons[id] = isRecovery && id === "mixed-2"
        ? "eligible"
        : "published_at_missing";
      return ingestionSuccess(input.sourceCode, input.articleUrl, "updated", id);
    },
    async searchArchive() {
      return {
        ok: true,
        value: {
          articleIds: ids.filter((id) => reasons[id] === "eligible"),
          reasonsByArticleId: reasons,
        },
      };
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "FC Porto pré-época", periodDays: 30 });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(attemptOrder.slice(0, 4), ["current", "current", "recovery", "recovery"]);
  assert.equal(result.value.attemptedArticleCount, NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT);
  assert.equal(result.value.recoveryAttemptedCount, 2);
  assert.equal(result.value.attemptedExclusionCounts.published_at_missing, 7);
  assert.equal(result.value.attemptedExclusionCounts.eligible, 1);
  const capturedRecoveryInput = recoveryInput as {
    limit: number;
    cooldownHours: number;
    now: Date;
  } | null;
  assert.ok(capturedRecoveryInput);
  assert.equal(capturedRecoveryInput.limit, NEWSROOM_TOPIC_RECOVERY_LIMIT);
  assert.equal(capturedRecoveryInput.cooldownHours, 24);
  assert.equal(capturedRecoveryInput.now.toISOString(), TIMESTAMP);
});

test("não tenta mais de quatro URLs antigas e só inclui a reingestão que ganha data elegível", async () => {
  const ids: string[] = [];
  const reasons: Record<string, NewsroomTopicArchiveOutcome> = {};
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE],
    async collectSource() {
      return collectionSuccess("record", []);
    },
    async listUndatedRecoveryCandidates() {
      return {
        ok: true,
        value: Array.from({ length: 6 }, (_, index) => ({
          id: `old-${index}`,
          sourceCode: "record",
          normalizedUrl: `https://www.record.pt/futebol/futebol-nacional/liga-betclic/detalhe/fc-porto-recovery-${index}`,
        })),
      };
    },
    async ingestArticle(input) {
      const id = `recovered-${ids.length}`;
      ids.push(id);
      reasons[id] = ids.length === 1 ? "eligible" : "published_at_missing";
      return ingestionSuccess("record", input.articleUrl, "updated", id);
    },
    async searchArchive() {
      return {
        ok: true,
        value: {
          articleIds: ids.filter((id) => reasons[id] === "eligible"),
          reasonsByArticleId: reasons,
        },
      };
    },
    clock: () => new Date(TIMESTAMP),
  });
  const result = await search({ topic: "FC Porto pré-época", periodDays: 30 });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.recoveryAttemptedCount, NEWSROOM_TOPIC_RECOVERY_LIMIT);
  assert.equal(result.value.finalEligibleArticleCount, 1);
  assert.equal(result.value.attemptedExclusionCounts.eligible, 1);
  assert.equal(result.value.attemptedExclusionCounts.published_at_missing, 3);
});

test("agrega falhas por fonte, etapa, código, status e código de persistência", () => {
  const groups = aggregateNewsroomTopicFailureReasons([
    {
      sourceCode: "record",
      stage: "loading",
      code: "http_error",
      statusCode: 403,
    },
    {
      sourceCode: "record",
      stage: "loading",
      code: "http_error",
      statusCode: 403,
    },
    {
      sourceCode: "abola",
      stage: "loading",
      code: "http_error",
      statusCode: 403,
    },
    {
      sourceCode: "record",
      stage: "parsing",
      code: "parsing_failed",
    },
    {
      sourceCode: "record",
      stage: "normalization",
      code: "normalized_article_invalid",
    },
  ]);

  assert.equal(groups.reduce((total, group) => total + group.count, 0), 5);
  assert.deepEqual(groups, [
    {
      sourceCode: "abola",
      stage: "loading",
      code: "http_error",
      statusCode: 403,
      count: 1,
    },
    {
      sourceCode: "record",
      stage: "loading",
      code: "http_error",
      statusCode: 403,
      count: 2,
    },
    {
      sourceCode: "record",
      stage: "normalization",
      code: "normalized_article_invalid",
      count: 1,
    },
    {
      sourceCode: "record",
      stage: "parsing",
      code: "parsing_failed",
      count: 1,
    },
  ]);

  const stageGroups = aggregateNewsroomTopicFailureReasons([
    {
      sourceCode: "record",
      stage: "parsing",
      code: "parsing_failed",
    },
    {
      sourceCode: "record",
      stage: "normalization",
      code: "normalized_article_invalid",
    },
    {
      sourceCode: "record",
      stage: "persistence",
      code: "persistence_failed",
      persistenceCode: "persistence_conflict",
    },
  ]);
  assert.deepEqual(
    stageGroups.map((group) => [
      group.stage,
      group.code,
      group.persistenceCode ?? null,
    ]),
    [
      ["normalization", "normalized_article_invalid", null],
      ["parsing", "parsing_failed", null],
      ["persistence", "persistence_failed", "persistence_conflict"],
    ],
  );
});

test("tentativas atuais e recuperação antiga alimentam a mesma agregação segura", async () => {
  const currentBySource = new Map([
    ["record", [
      candidate(
        "record",
        "fc-porto-observability-record-1",
        "FC Porto preparação Record primeira",
      ),
      candidate(
        "record",
        "fc-porto-observability-record-2",
        "FC Porto preparação Record segunda",
      ),
    ]],
    ["abola", [
      candidate(
        "abola",
        "fc-porto-observability-abola-1",
        "FC Porto preparação A Bola primeira",
      ),
      candidate(
        "abola",
        "fc-porto-observability-abola-2",
        "FC Porto preparação A Bola segunda",
      ),
    ]],
  ]);
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE, ABOLA_SOURCE],
    async collectSource(input) {
      return collectionSuccess(input.sourceCode, currentBySource.get(input.sourceCode) ?? []);
    },
    async listUndatedRecoveryCandidates() {
      return {
        ok: true,
        value: [{
          id: "old-observability",
          sourceCode: "record",
          normalizedUrl: "https://www.record.pt/futebol/futebol-nacional/liga-betclic/detalhe/fc-porto-recovery-observability",
        }],
      };
    },
    async ingestArticle(input) {
      if (
        input.articleUrl.includes("record-1")
        || input.articleUrl.includes("recovery-observability")
      ) {
        return ingestionFailure(input.sourceCode, {
          code: "http_error",
          stage: "loading",
          statusCode: 403,
        });
      }
      if (input.articleUrl.includes("abola-1")) {
        return ingestionFailure(input.sourceCode, {
          code: "http_error",
          stage: "loading",
          statusCode: 404,
        });
      }
      if (input.articleUrl.includes("record-2")) {
        return ingestionFailure(input.sourceCode, {
          code: "parsing_failed",
          stage: "parsing",
        });
      }
      return ingestionFailure(input.sourceCode, {
        code: "persistence_failed",
        stage: "persistence",
        persistenceCode: "persistence_conflict",
      });
    },
    clock: () => new Date(TIMESTAMP),
  });

  const result = await search({ topic: "FC Porto pré-época", periodDays: 30 });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.attemptedArticleCount, 5);
  assert.equal(result.value.failedArticleCount, 5);
  assert.equal(result.value.recoveryAttemptedCount, 1);
  assert.equal(
    result.value.failureReasonCounts.reduce((total, group) => total + group.count, 0),
    result.value.failedArticleCount,
  );
  assert.deepEqual(result.value.failureReasonCounts, [
    {
      sourceCode: "abola",
      stage: "loading",
      code: "http_error",
      count: 1,
      statusCode: 404,
    },
    {
      sourceCode: "abola",
      stage: "persistence",
      code: "persistence_failed",
      count: 1,
      persistenceCode: "persistence_conflict",
    },
    {
      sourceCode: "record",
      stage: "loading",
      code: "http_error",
      count: 2,
      statusCode: 403,
    },
    {
      sourceCode: "record",
      stage: "parsing",
      code: "parsing_failed",
      count: 1,
    },
  ]);

  const externalPayload = JSON.stringify(result.value);
  assert.doesNotMatch(
    externalPayload,
    /SECRET|<html|stack|message|detail|headers|cookies|https?:\/\//i,
  );

  const compactReports = compactNewsroomExternalTopicSearchSourceReports(
    result.value.sources,
  );
  const compactPayload = JSON.stringify(compactReports);
  assert.doesNotMatch(
    compactPayload,
    /SECRET|<html|stack|message|detail|headers|cookies|url|https?:\/\/|null/i,
  );
  const parsedReports = parseNewsroomExternalTopicSearchSourceReports(compactPayload);
  assert.equal(parsedReports.length, 2);
  assert.equal(
    parsedReports.flatMap((report) => report.failures)
      .reduce((total, group) => total + group.count, 0),
    5,
  );
});

test("o payload compacto rejeita estruturas, códigos e etapas desconhecidos", async () => {
  const search = createNewsroomExternalTopicSearch({
    listSources: () => [RECORD_SOURCE],
    async collectSource() {
      return collectionSuccess("record", [
        candidate("record", "fc-porto-payload", "FC Porto preparação"),
      ]);
    },
    async ingestArticle(input) {
      return ingestionFailure(input.sourceCode, {
        code: "http_error",
        stage: "loading",
        statusCode: 403,
      });
    },
    clock: () => new Date(TIMESTAMP),
  });
  const result = await search({ topic: "FC Porto pré-época" });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const compact = compactNewsroomExternalTopicSearchSourceReports(result.value.sources);
  const invalidStructure = JSON.parse(JSON.stringify(compact)) as Array<{
    failures: unknown[][];
  }>;
  invalidStructure[0].failures[0] = ["loading", "http_error", 1, 403, null];
  assert.deepEqual(
    parseNewsroomExternalTopicSearchSourceReports(JSON.stringify(invalidStructure)),
    [],
  );

  const unknownCode = JSON.parse(JSON.stringify(compact)) as Array<{
    failures: unknown[][];
  }>;
  unknownCode[0].failures[0][1] = "body_insufficient";
  assert.deepEqual(
    parseNewsroomExternalTopicSearchSourceReports(JSON.stringify(unknownCode)),
    [],
  );

  const unknownStage = JSON.parse(JSON.stringify(compact)) as Array<{
    failures: unknown[][];
  }>;
  unknownStage[0].failures[0][0] = "network";
  assert.deepEqual(
    parseNewsroomExternalTopicSearchSourceReports(JSON.stringify(unknownStage)),
    [],
  );

  const invalidCount = JSON.parse(JSON.stringify(compact)) as Array<{
    candidateLinkCount: unknown;
  }>;
  invalidCount[0].candidateLinkCount = -1;
  assert.deepEqual(
    parseNewsroomExternalTopicSearchSourceReports(JSON.stringify(invalidCount)),
    [],
  );

  const invalidCollectionStatus = JSON.parse(JSON.stringify(compact)) as Array<{
    collectionStatus: unknown;
  }>;
  invalidCollectionStatus[0].collectionStatus = "unknown";
  assert.deepEqual(
    parseNewsroomExternalTopicSearchSourceReports(JSON.stringify(invalidCollectionStatus)),
    [],
  );
});
