import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import {
  createNewsroomEditorialDraftLookup,
  createNewsroomEditorialDraftService,
  type EditorialDraftInsert,
  type LinkedEditorialArticle,
  type NewsroomDraftSource,
  type NewsroomEditorialDraftTransport,
} from "@/lib/redacao-automatica/editorial-draft-service-internal";

const NEWSROOM_ID = "00000000-0000-4000-8000-000000000201";
const EDITORIAL_ID = "00000000-0000-4000-8000-000000000202";
const CREATED_ID = "00000000-0000-4000-8000-000000000203";
const NOW = "2026-07-28T10:00:00.000Z";

const originalFetch = globalThis.fetch;
let networkCallCount = 0;

before(() => {
  globalThis.fetch = (async () => {
    networkCallCount += 1;
    throw new Error("Os testes de drafts editoriais não permitem pedidos de rede.");
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(networkCallCount, 0);
});

function validSource(): NewsroomDraftSource {
  return {
    id: NEWSROOM_ID,
    label: "ANTETÍTULO DA FONTE",
    title: "Título persistido da fonte",
    subtitle: "Subtítulo persistido",
    summary: "Resumo persistido",
    author: "Autor persistido",
    imageUrl: "https://example.test/imagem.jpg",
    processingStatus: "ready_for_review",
    body: [
      { type: "heading", text: "Enquadramento" },
      { type: "paragraph", text: "Primeiro bloco normalizado." },
      { type: "paragraph", text: "Segundo bloco normalizado." },
    ],
  };
}

class FakeDraftTransport implements NewsroomEditorialDraftTransport {
  configured = true;
  source: NewsroomDraftSource | null = validSource();
  linked: LinkedEditorialArticle | null = null;
  inserted: EditorialDraftInsert[] = [];
  insertError: Error | null = null;
  linkedAfterInsertError: LinkedEditorialArticle | null = null;
  findCalls = 0;
  readCalls = 0;

  isConfigured(): boolean {
    return this.configured;
  }

  async readSource(): Promise<NewsroomDraftSource | null> {
    this.readCalls += 1;
    return this.source;
  }

  async findLinkedArticle(): Promise<LinkedEditorialArticle | null> {
    this.findCalls += 1;
    if (this.insertError && this.inserted.length > 0 && this.linkedAfterInsertError) {
      return this.linkedAfterInsertError;
    }
    return this.linked;
  }

  async insertDraft(payload: EditorialDraftInsert): Promise<LinkedEditorialArticle> {
    this.inserted.push(payload);
    if (this.insertError) {
      throw this.insertError;
    }

    this.linked = { id: CREATED_ID, status: "draft" };
    return this.linked;
  }

  randomUuid(): string {
    return CREATED_ID;
  }

  now(): string {
    return NOW;
  }
}

test("rejeita identificador inválido antes de qualquer leitura", async () => {
  const transport = new FakeDraftTransport();
  const result = await createNewsroomEditorialDraftService(transport)("não-é-uuid");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
  }
  assert.equal(transport.findCalls, 0);
  assert.equal(transport.readCalls, 0);
  assert.equal(transport.inserted.length, 0);
});

test("rejeita serviço não configurado sem tocar na persistência", async () => {
  const transport = new FakeDraftTransport();
  transport.configured = false;

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "service_unavailable");
  }
  assert.equal(transport.findCalls, 0);
  assert.equal(transport.inserted.length, 0);
});

test("reutiliza o artigo editorial já ligado e não cria duplicado", async () => {
  const transport = new FakeDraftTransport();
  transport.linked = { id: EDITORIAL_ID, status: "draft" };

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.deepEqual(result, {
    ok: true,
    value: {
      editorialArticle: { id: EDITORIAL_ID, status: "draft" },
      action: "reused",
    },
  });
  assert.equal(transport.readCalls, 0);
  assert.equal(transport.inserted.length, 0);
});

test("reutiliza também um artigo ligado que entretanto foi publicado", async () => {
  const transport = new FakeDraftTransport();
  transport.linked = { id: EDITORIAL_ID, status: "published" };

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.action, "reused");
    assert.equal(result.value.editorialArticle.status, "published");
  }
  assert.equal(transport.inserted.length, 0);
});

test("rejeita newsroom_article inexistente", async () => {
  const transport = new FakeDraftTransport();
  transport.source = null;

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "newsroom_article_not_found");
  }
  assert.equal(transport.inserted.length, 0);
});

test("rejeita artigo que ainda não está por rever", async () => {
  const transport = new FakeDraftTransport();
  transport.source = { ...validSource(), processingStatus: "normalized" };

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "newsroom_article_not_ready");
  }
  assert.equal(transport.inserted.length, 0);
});

test("rejeita artigo sem snapshot normalizado utilizável", async () => {
  const transport = new FakeDraftTransport();
  transport.source = { ...validSource(), body: [] };

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "newsroom_snapshot_missing");
  }
  assert.equal(transport.inserted.length, 0);
});

test("cria apenas um draft geral, sem publicação nem contexto competitivo", async () => {
  const transport = new FakeDraftTransport();

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.action, "created");
    assert.deepEqual(result.value.editorialArticle, { id: CREATED_ID, status: "draft" });
  }
  assert.equal(transport.inserted.length, 1);
  assert.deepEqual(transport.inserted[0], {
    id: CREATED_ID,
    newsroom_article_id: NEWSROOM_ID,
    title: "Título persistido da fonte",
    slug: "newsroom-00000000000040008000000000000201",
    status: "draft",
    scope: "general",
    label: "ANTETÍTULO DA FONTE",
    author: "Autor persistido",
    subtitle: "Subtítulo persistido",
    body: "Enquadramento\n\nPrimeiro bloco normalizado.\n\nSegundo bloco normalizado.",
    image_url: "https://example.test/imagem.jpg",
    published_at: null,
    competition_id: null,
    season_id: null,
    matchday_id: null,
    created_at: NOW,
    updated_at: NOW,
  });
});

test("usa o resumo como pós-título quando a fonte não tem subtítulo", async () => {
  const transport = new FakeDraftTransport();
  transport.source = { ...validSource(), subtitle: null, summary: "Resumo como pós-título" };

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.equal(result.ok, true);
  assert.equal(transport.inserted[0]?.subtitle, "Resumo como pós-título");
  assert.equal(transport.inserted[0]?.label, "ANTETÍTULO DA FONTE");
  assert.equal(transport.inserted[0]?.author, "Autor persistido");
});

test("a segunda invocação é idempotente e devolve o mesmo artigo", async () => {
  const transport = new FakeDraftTransport();
  const createDraft = createNewsroomEditorialDraftService(transport);

  const first = await createDraft(NEWSROOM_ID);
  const second = await createDraft(NEWSROOM_ID);

  assert.equal(first.ok, true);
  assert.deepEqual(second, {
    ok: true,
    value: {
      editorialArticle: { id: CREATED_ID, status: "draft" },
      action: "reused",
    },
  });
  assert.equal(transport.inserted.length, 1);
});

test("uma corrida protegida pelo índice único é resolvida por nova leitura", async () => {
  const transport = new FakeDraftTransport();
  transport.insertError = new Error("duplicate key value violates unique constraint");
  transport.linkedAfterInsertError = { id: EDITORIAL_ID, status: "draft" };

  const result = await createNewsroomEditorialDraftService(transport)(NEWSROOM_ID);

  assert.deepEqual(result, {
    ok: true,
    value: {
      editorialArticle: { id: EDITORIAL_ID, status: "draft" },
      action: "reused",
    },
  });
  assert.equal(transport.inserted.length, 1);
  assert.equal(transport.findCalls, 2);
});

test("a consulta do estado ligado é read-only e controlada", async () => {
  const transport = new FakeDraftTransport();
  transport.linked = { id: EDITORIAL_ID, status: "draft" };

  const result = await createNewsroomEditorialDraftLookup(transport)(NEWSROOM_ID);

  assert.deepEqual(result, {
    ok: true,
    value: { id: EDITORIAL_ID, status: "draft" },
  });
  assert.equal(transport.readCalls, 0);
  assert.equal(transport.inserted.length, 0);
});

test("a rota de rascunho legacy permanece protegida, mas o fluxo principal abre Artigos manualmente", async () => {
  const [page, route, middleware, schemaSql] = await Promise.all([
    readFile("app/admin/editorial/redacao-automatica/page.tsx", "utf8"),
    readFile("app/api/admin/editorial/redacao-automatica/drafts/route.ts", "utf8"),
    readFile("middleware.ts", "utf8"),
    readFile(
      "supabase/sql/jornada-backoffice-redacao-automatica-relacao-newsroom-editorial-schema-1-aplicar.sql",
      "utf8",
    ),
  ]);

  assert.doesNotMatch(page, /action="\/api\/admin\/editorial\/redacao-automatica\/drafts"/);
  assert.doesNotMatch(page, /Criar rascunho editorial/);
  assert.doesNotMatch(page, /Abrir rascunho editorial/);
  assert.match(page, /href="\/admin\/editorial\/artigos"/);
  assert.match(route, /createNewsroomEditorialDraft/);
  assert.match(route, /newsroom_draft/);
  assert.doesNotMatch(route, /PageLoader|adapter|fetch\s*\(|published\s*:/i);
  assert.match(middleware, /pathname\.startsWith\("\/api\/admin"\)/);
  assert.match(schemaSql, /add column newsroom_article_id uuid/i);
  assert.match(schemaSql, /references public\.newsroom_articles\(id\)/i);
  assert.match(schemaSql, /create unique index editorial_articles_newsroom_article_id_uidx/i);
});
