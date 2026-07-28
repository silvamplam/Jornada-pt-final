import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import {
  createNewsroomReviewService,
  type NewsroomReviewSource,
  type NewsroomReviewTransport,
  type NewsroomReviewUpdate,
} from "@/lib/redacao-automatica/newsroom-review-service-internal";

const NEWSROOM_ID = "00000000-0000-4000-8000-000000000301";

const originalFetch = globalThis.fetch;
let networkCallCount = 0;

before(() => {
  globalThis.fetch = (async () => {
    networkCallCount += 1;
    throw new Error("Os testes de validação editorial não permitem pedidos de rede.");
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(networkCallCount, 0);
});

function validSource(): NewsroomReviewSource {
  return {
    id: NEWSROOM_ID,
    processingStatus: "detected",
    body: [{ type: "paragraph", text: "Corpo normalizado persistido." }],
  };
}

class FakeReviewTransport implements NewsroomReviewTransport {
  configured = true;
  source: NewsroomReviewSource | null = validSource();
  updated: NewsroomReviewUpdate | null = null;
  updateError: Error | null = null;
  updateReturnsNull = false;
  sourceAfterUpdateFailure: NewsroomReviewSource | null = null;
  readCalls = 0;
  updateCalls = 0;

  isConfigured(): boolean {
    return this.configured;
  }

  async readSource(): Promise<NewsroomReviewSource | null> {
    this.readCalls += 1;
    if (this.updateCalls > 0 && this.sourceAfterUpdateFailure) {
      return this.sourceAfterUpdateFailure;
    }
    return this.source;
  }

  async updateReadyForReview(): Promise<NewsroomReviewUpdate | null> {
    this.updateCalls += 1;
    if (this.updateError) {
      throw this.updateError;
    }
    if (this.updateReturnsNull) {
      return null;
    }

    this.updated = { id: NEWSROOM_ID, processingStatus: "ready_for_review" };
    this.source = {
      ...validSource(),
      processingStatus: "ready_for_review",
    };
    return this.updated;
  }
}

test("rejeita identificador inválido antes de qualquer leitura", async () => {
  const transport = new FakeReviewTransport();
  const result = await createNewsroomReviewService(transport)("não-é-uuid");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
  }
  assert.equal(transport.readCalls, 0);
  assert.equal(transport.updateCalls, 0);
});

test("rejeita serviço não configurado sem tocar na persistência", async () => {
  const transport = new FakeReviewTransport();
  transport.configured = false;

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "service_unavailable");
  }
  assert.equal(transport.readCalls, 0);
  assert.equal(transport.updateCalls, 0);
});

test("rejeita artigo inexistente", async () => {
  const transport = new FakeReviewTransport();
  transport.source = null;

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "newsroom_article_not_found");
  }
  assert.equal(transport.updateCalls, 0);
});

test("reutiliza artigo já marcado como Por rever", async () => {
  const transport = new FakeReviewTransport();
  transport.source = { ...validSource(), processingStatus: "ready_for_review" };

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.deepEqual(result, {
    ok: true,
    value: {
      article: { id: NEWSROOM_ID, processingStatus: "ready_for_review" },
      action: "reused",
    },
  });
  assert.equal(transport.updateCalls, 0);
});

test("rejeita artigo sem snapshot normalizado utilizável", async () => {
  const transport = new FakeReviewTransport();
  transport.source = { ...validSource(), body: [] };

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "newsroom_snapshot_missing");
  }
  assert.equal(transport.updateCalls, 0);
});

test("rejeita estados que não podem transitar para Por rever", async () => {
  const transport = new FakeReviewTransport();
  transport.source = { ...validSource(), processingStatus: "rejected" };

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "newsroom_article_not_reviewable");
  }
  assert.equal(transport.updateCalls, 0);
});

test("marca manualmente um artigo detetado como Por rever", async () => {
  const transport = new FakeReviewTransport();

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.deepEqual(result, {
    ok: true,
    value: {
      article: { id: NEWSROOM_ID, processingStatus: "ready_for_review" },
      action: "updated",
    },
  });
  assert.equal(transport.readCalls, 1);
  assert.equal(transport.updateCalls, 1);
});

test("também permite a transição a partir de Normalizado", async () => {
  const transport = new FakeReviewTransport();
  transport.source = { ...validSource(), processingStatus: "normalized" };

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.action, "updated");
  }
  assert.equal(transport.updateCalls, 1);
});

test("uma atualização concorrente é resolvida por nova leitura idempotente", async () => {
  const transport = new FakeReviewTransport();
  transport.updateReturnsNull = true;
  transport.sourceAfterUpdateFailure = {
    ...validSource(),
    processingStatus: "ready_for_review",
  };

  const result = await createNewsroomReviewService(transport)(NEWSROOM_ID);

  assert.deepEqual(result, {
    ok: true,
    value: {
      article: { id: NEWSROOM_ID, processingStatus: "ready_for_review" },
      action: "reused",
    },
  });
  assert.equal(transport.readCalls, 2);
  assert.equal(transport.updateCalls, 1);
});

test("a UI e a rota expõem a transição manual sem recolha externa", async () => {
  const [page, route, middleware] = await Promise.all([
    readFile("app/admin/editorial/redacao-automatica/page.tsx", "utf8"),
    readFile("app/api/admin/editorial/redacao-automatica/review/route.ts", "utf8"),
    readFile("middleware.ts", "utf8"),
  ]);

  assert.match(page, /action="\/api\/admin\/editorial\/redacao-automatica\/review"/);
  assert.match(page, /Marcar como Por rever/);
  assert.match(page, /Criar rascunho editorial/);
  assert.match(route, /markNewsroomArticleReadyForReview/);
  assert.match(route, /review_state/);
  assert.doesNotMatch(route, /PageLoader|adapter|fetch\s*\(/i);
  assert.match(middleware, /pathname\.startsWith\("\/api\/admin"\)/);
});
