import assert from "node:assert/strict";
import test from "node:test";

import {
  analyseEditorialBatchForPublication,
  editorialBatchPublicationFingerprint,
  editorialBatchPublicationUiState,
  isEditorialBatchPreflightResponseCurrent,
  requestEditorialBatchPublicationPreflight,
  shouldRequestAutomaticEditorialBatchPreflight,
  type EditorialBatchPublicationPlanLike,
} from "./editorial-batch-publication-client";

function article(title: string) {
  return `[JORNADA_ARTIGO_V1]
ANTETÍTULO
Liga Portugal

TÍTULO
${title}

PÓS-TÍTULO
Pós-título ${title}

CORPO
Corpo de ${title}.
[/JORNADA_ARTIGO_V1]`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

test("a análise válida inicia e conclui o preflight servidor sem publicar nem carregar imagens", async () => {
  const server = deferred<readonly EditorialBatchPublicationPlanLike[]>();
  const events: string[] = [];
  let receivedArticleTitle = "";

  const run = analyseEditorialBatchForPublication<EditorialBatchPublicationPlanLike>({
    articleText: article("Título inteiramente novo"),
    contextComplete: true,
    imagesReady: true,
    matchdayId: "matchday-1",
    author: "Autor",
    callbacks: {
      onLocalPreflight: () => events.push("local"),
      onServerPreflightSkipped: () => events.push("skipped"),
      onServerPreflightStarted: () => events.push("checking"),
      requestServerPreflight: (preflight) => {
        events.push("server-request");
        receivedArticleTitle = preflight.articles[0]?.title ?? "";
        return server.promise;
      },
      onServerPreflightSucceeded: () => events.push("planned"),
      onServerPreflightFailed: () => events.push("failed"),
      onServerPreflightFinished: () => events.push("finished"),
    },
  });

  assert.deepEqual(events, ["local", "checking", "server-request"]);
  assert.equal(receivedArticleTitle, "Título inteiramente novo");

  server.resolve([{
    key: "01",
    mode: "update_required",
    articleId: "published-article-original",
  }]);
  const result = await run;

  assert.equal(result.serverPreflightRequested, true);
  assert.deepEqual(events, [
    "local",
    "checking",
    "server-request",
    "planned",
    "finished",
  ]);
  assert.equal(result.plan?.[0]?.articleId, "published-article-original");
});

test("o pedido HTTP de análise envia apenas preflight e preserva o localizador do Dossiê", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sourcePackage = {
    year: 2026,
    month: 8,
    packageId: "package-reused",
  };

  const plan = await requestEditorialBatchPublicationPreflight<
    EditorialBatchPublicationPlanLike
  >({
    route: "/api/admin/editorial/redacao-automatica/publicacao-lote",
    matchdayId: "matchday-1",
    author: " Autor ",
    articles: [{ key: "01", title: "Título novo" }],
    sourcePackage,
    confirmedUpdates: {},
    fetcher: async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({
        ok: true,
        items: [{
          key: "01",
          mode: "update_required",
          articleId: "published-article-original",
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    "/api/admin/editorial/redacao-automatica/publicacao-lote",
  );
  assert.equal(requests[0]?.body.action, "preflight");
  assert.equal(requests[0]?.body.author, "Autor");
  assert.deepEqual(requests[0]?.body.sourcePackage, sourcePackage);
  assert.notEqual(requests[0]?.body.action, "publish_item");
  assert.equal(plan[0]?.articleId, "published-article-original");
});

test("um erro do preflight servidor é devolvido ao estado visível e termina a verificação", async () => {
  const events: string[] = [];
  let visibleError = "";

  const result = await analyseEditorialBatchForPublication({
    articleText: article("Artigo"),
    contextComplete: true,
    imagesReady: true,
    matchdayId: "matchday-1",
    author: "Autor",
    callbacks: {
      onLocalPreflight: () => events.push("local"),
      onServerPreflightSkipped: () => events.push("skipped"),
      onServerPreflightStarted: () => events.push("checking"),
      requestServerPreflight: async () => {
        throw new Error("Target de atualização inválido.");
      },
      onServerPreflightSucceeded: () => events.push("planned"),
      onServerPreflightFailed: (message) => {
        visibleError = message;
        events.push("visible-error");
      },
      onServerPreflightFinished: () => events.push("finished"),
    },
  });

  assert.equal(result.serverPreflightRequested, true);
  assert.equal(visibleError, "Target de atualização inválido.");
  assert.deepEqual(events, [
    "local",
    "checking",
    "visible-error",
    "finished",
  ]);
});

test("a análise incompleta não chama o servidor e explica o pré-requisito em falta", async () => {
  let serverCalls = 0;
  let feedback = "";

  const result = await analyseEditorialBatchForPublication({
    articleText: article("Artigo"),
    contextComplete: false,
    imagesReady: true,
    matchdayId: "",
    author: "Autor",
    callbacks: {
      onLocalPreflight: () => undefined,
      onServerPreflightSkipped: (message) => {
        feedback = message;
      },
      onServerPreflightStarted: () => undefined,
      requestServerPreflight: async () => {
        serverCalls += 1;
        return [];
      },
      onServerPreflightSucceeded: () => undefined,
      onServerPreflightFailed: () => undefined,
      onServerPreflightFinished: () => undefined,
    },
  });

  assert.equal(result.serverPreflightRequested, false);
  assert.equal(serverCalls, 0);
  assert.match(feedback, /Competição, Época e Jornada/);
});

test("o preflight automático espera por imagens válidas e não chama upload nem publicação", async () => {
  let serverCalls = 0;
  let feedback = "";

  const result = await analyseEditorialBatchForPublication({
    articleText: article("Artigo"),
    contextComplete: true,
    imagesReady: false,
    matchdayId: "matchday-1",
    author: "Autor",
    callbacks: {
      onLocalPreflight: () => undefined,
      onServerPreflightSkipped: (message) => {
        feedback = message;
      },
      onServerPreflightStarted: () => undefined,
      requestServerPreflight: async () => {
        serverCalls += 1;
        return [];
      },
      onServerPreflightSucceeded: () => undefined,
      onServerPreflightFailed: () => undefined,
      onServerPreflightFinished: () => undefined,
    },
  });

  assert.equal(result.serverPreflightRequested, false);
  assert.equal(serverCalls, 0);
  assert.match(feedback, /imagem válida por artigo/);
});

test("a fingerprint invalida o plano quando texto, contexto, autoria ou imagens mudam", () => {
  const base = {
    articleText: article("Artigo"),
    competitionId: "competition-1",
    seasonId: "season-1",
    matchdayId: "matchday-1",
    author: "Autor",
    images: [{
      name: "01-artigo.jpg",
      size: 123,
      type: "image/jpeg",
      lastModified: 456,
    }],
    sourcePackage: { packageId: "package-1" },
  } as const;
  const fingerprint = editorialBatchPublicationFingerprint(base);

  assert.equal(editorialBatchPublicationFingerprint(base), fingerprint);
  assert.notEqual(
    editorialBatchPublicationFingerprint({ ...base, articleText: article("Outro") }),
    fingerprint,
  );
  assert.notEqual(
    editorialBatchPublicationFingerprint({ ...base, matchdayId: "matchday-2" }),
    fingerprint,
  );
  assert.notEqual(
    editorialBatchPublicationFingerprint({ ...base, author: "Outra autora" }),
    fingerprint,
  );
  assert.notEqual(
    editorialBatchPublicationFingerprint({
      ...base,
      images: [{ ...base.images[0], name: "01-outra.jpg" }],
    }),
    fingerprint,
  );
});

test("a guarda automática impede pedidos duplicados e rejeita respostas stale", () => {
  assert.equal(shouldRequestAutomaticEditorialBatchPreflight({
    ready: true,
    fingerprint: "fingerprint-1",
    lastRequestedFingerprint: null,
    activeFingerprint: null,
  }), true);
  assert.equal(shouldRequestAutomaticEditorialBatchPreflight({
    ready: true,
    fingerprint: "fingerprint-1",
    lastRequestedFingerprint: "fingerprint-1",
    activeFingerprint: null,
  }), false);
  assert.equal(shouldRequestAutomaticEditorialBatchPreflight({
    ready: true,
    fingerprint: "fingerprint-1",
    lastRequestedFingerprint: null,
    activeFingerprint: "fingerprint-1",
  }), false);
  assert.equal(shouldRequestAutomaticEditorialBatchPreflight({
    ready: false,
    fingerprint: "fingerprint-2",
    lastRequestedFingerprint: null,
    activeFingerprint: null,
  }), false);

  assert.equal(isEditorialBatchPreflightResponseCurrent({
    requestId: 2,
    fingerprint: "fingerprint-2",
    currentRequestId: 2,
    currentFingerprint: "fingerprint-2",
  }), true);
  assert.equal(isEditorialBatchPreflightResponseCurrent({
    requestId: 1,
    fingerprint: "fingerprint-1",
    currentRequestId: 2,
    currentFingerprint: "fingerprint-2",
  }), false);
});

test("os estados finais oferecem um único CTA editorial e nunca um pseudo-botão", () => {
  const base = {
    confirmedUpdates: {},
    canPublish: false,
    isChecking: false,
    isPublishing: false,
    allPublished: false,
    hasIncompleteRun: false,
    hasError: false,
  } as const;

  assert.equal(
    editorialBatchPublicationUiState({ ...base, plan: null }).statusLabel,
    "A verificar destino editorial…",
  );
  assert.equal(
    editorialBatchPublicationUiState({ ...base, plan: null }).actionLabel,
    null,
  );
  assert.equal(
    editorialBatchPublicationUiState({
      ...base,
      plan: null,
      isChecking: true,
    }).statusLabel,
    "A verificar destino editorial…",
  );

  const failedCheck = editorialBatchPublicationUiState({
    ...base,
    plan: null,
    hasError: true,
  });
  assert.equal(failedCheck.actionLabel, null);
  assert.equal(failedCheck.showRetry, true);

  const updatePlan = [{
    key: "01",
    mode: "update_required" as const,
    articleId: "article-original",
  }];
  const awaitingConfirmation = editorialBatchPublicationUiState({
    ...base,
    plan: updatePlan,
    canPublish: true,
  });
  assert.equal(awaitingConfirmation.statusLabel, "ATUALIZAÇÃO DETETADA");
  assert.equal(awaitingConfirmation.actionLabel, null);
  assert.equal(awaitingConfirmation.ready, false);

  const missingUpdateTarget = editorialBatchPublicationUiState({
    ...base,
    plan: [{ key: "01", mode: "update_required" }],
    canPublish: true,
  });
  assert.equal(missingUpdateTarget.statusLabel, "ATUALIZAÇÃO DETETADA");
  assert.equal(missingUpdateTarget.actionLabel, null);
  assert.equal(missingUpdateTarget.ready, false);

  const confirmedUpdate = editorialBatchPublicationUiState({
    ...base,
    plan: updatePlan,
    confirmedUpdates: { "01": "article-original" },
    canPublish: true,
  });
  assert.equal(confirmedUpdate.statusLabel, "ATUALIZAÇÃO CONFIRMADA");
  assert.equal(confirmedUpdate.actionLabel, "ATUALIZAR ARTIGO");
  assert.equal(confirmedUpdate.ready, true);

  for (const mode of ["create", "resume"] as const) {
    const normalPlan = editorialBatchPublicationUiState({
      ...base,
      plan: [{ key: "01", mode }],
      canPublish: true,
    });
    assert.equal(normalPlan.statusLabel, "NOVO ARTIGO");
    assert.equal(normalPlan.actionLabel, "PUBLICAR EM ÚLTIMAS");
    assert.equal(normalPlan.ready, true);
  }

  const published = editorialBatchPublicationUiState({
    ...base,
    plan: [{ key: "01", mode: "create" }],
    canPublish: true,
    allPublished: true,
  });
  assert.equal(published.statusLabel, "LOTE PUBLICADO");
  assert.equal(published.actionLabel, null);
});

test("um lote misto preserva todos os destinos e a confirmação individual", () => {
  const plan = [
    { key: "01", mode: "create" as const },
    {
      key: "02",
      mode: "update_required" as const,
      articleId: "article-2",
    },
    {
      key: "03",
      mode: "update_required" as const,
      articleId: "article-3",
    },
  ];
  const partiallyConfirmed = editorialBatchPublicationUiState({
    plan,
    confirmedUpdates: { "02": "article-2" },
    canPublish: false,
    isChecking: false,
    isPublishing: false,
    allPublished: false,
    hasIncompleteRun: false,
    hasError: false,
  });
  assert.equal(partiallyConfirmed.updateCandidates.length, 2);
  assert.equal(partiallyConfirmed.updatesConfirmed, false);
  assert.equal(partiallyConfirmed.actionLabel, null);

  const allConfirmed = editorialBatchPublicationUiState({
    plan,
    confirmedUpdates: {
      "02": "article-2",
      "03": "article-3",
    },
    canPublish: true,
    isChecking: false,
    isPublishing: false,
    allPublished: false,
    hasIncompleteRun: false,
    hasError: false,
  });
  assert.equal(allConfirmed.updatesConfirmed, true);
  assert.equal(allConfirmed.actionLabel, "PUBLICAR E ATUALIZAR");
});
