import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createEditorialDossierArticlePlanDraftService,
  type EditorialDossierArticlePlanDraftRpcResult,
  type EditorialDossierArticlePlanDraftState,
  type EditorialDossierArticlePlanDraftTransport,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-draft-service-internal";

const dossierId = "00000000-0000-4000-8000-000000000001";
const planId = "00000000-0000-4000-8000-000000000011";
const editorialArticleId = "00000000-0000-4000-8000-000000000021";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readyPlan(
  overrides: Partial<EditorialDossierArticlePlanDraftState> = {},
): EditorialDossierArticlePlanDraftState {
  return {
    id: planId,
    dossierId,
    status: "ready",
    workingTitle: "Vitória fecha estágio; FC Porto prepara a nova época",
    editorialInstructions: "Distinguir claramente os dois contextos e usar apenas as fontes atribuídas.",
    sourceCount: 2,
    editorialArticleId: null,
    ...overrides,
  };
}

function fakeTransport(
  plan: EditorialDossierArticlePlanDraftState | null,
  rpcResult: EditorialDossierArticlePlanDraftRpcResult | null = {
    editorialArticleId,
    action: "created",
  },
) {
  let readCount = 0;
  let createCount = 0;
  const transport: EditorialDossierArticlePlanDraftTransport = {
    isConfigured: () => true,
    readPlan: async () => {
      readCount += 1;
      return plan;
    },
    createDraft: async () => {
      createCount += 1;
      return rpcResult;
    },
  };

  return {
    transport,
    counts: () => ({ readCount, createCount }),
  };
}

test("rejeita identificadores inválidos antes da persistência", async () => {
  const { transport, counts } = fakeTransport(readyPlan());
  const createDraft = createEditorialDossierArticlePlanDraftService(transport);
  const result = await createDraft("inválido", planId);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "input_invalid");
  }
  assert.deepEqual(counts(), { readCount: 0, createCount: 0 });
});

test("rejeita plano inexistente, não pronto ou incompleto", async () => {
  const missing = fakeTransport(null);
  const missingResult = await createEditorialDossierArticlePlanDraftService(
    missing.transport,
  )(dossierId, planId);
  assert.equal(missingResult.ok, false);
  if (!missingResult.ok) {
    assert.equal(missingResult.error.code, "article_plan_not_found");
  }

  const planned = fakeTransport(readyPlan({ status: "planned" }));
  const plannedResult = await createEditorialDossierArticlePlanDraftService(
    planned.transport,
  )(dossierId, planId);
  assert.equal(plannedResult.ok, false);
  if (!plannedResult.ok) {
    assert.equal(plannedResult.error.code, "article_plan_not_ready");
  }

  const incomplete = fakeTransport(readyPlan({
    editorialInstructions: "",
    sourceCount: 0,
  }));
  const incompleteResult = await createEditorialDossierArticlePlanDraftService(
    incomplete.transport,
  )(dossierId, planId);
  assert.equal(incompleteResult.ok, false);
  if (!incompleteResult.ok) {
    assert.equal(incompleteResult.error.code, "article_plan_incomplete");
  }
});

test("reutiliza a ligação persistente sem voltar a chamar a RPC", async () => {
  const { transport, counts } = fakeTransport(readyPlan({ editorialArticleId }));
  const result = await createEditorialDossierArticlePlanDraftService(
    transport,
  )(dossierId, planId);

  assert.deepEqual(result, {
    ok: true,
    value: {
      editorialArticleId,
      action: "reused",
    },
  });
  assert.deepEqual(counts(), { readCount: 1, createCount: 0 });
});

test("cria o rascunho através da RPC e devolve a ação controlada", async () => {
  const { transport, counts } = fakeTransport(readyPlan());
  const result = await createEditorialDossierArticlePlanDraftService(
    transport,
  )(dossierId, planId);

  assert.deepEqual(result, {
    ok: true,
    value: {
      editorialArticleId,
      action: "created",
    },
  });
  assert.deepEqual(counts(), { readCount: 1, createCount: 1 });
});

test("a UI, a rota e o SQL mantêm a conversão manual, idempotente e sem IA", () => {
  const page = read("app/admin/editorial/redacao-automatica/dossies/[id]/page.tsx");
  const route = read("app/api/admin/editorial/redacao-automatica/dossies/route.ts");
  const apply = read(
    "supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigo-planeado-rascunho-controlado-1-aplicar.sql",
  );

  assert.match(page, /name="action" value="create_article_plan_draft"/);
  assert.match(page, /Criar rascunho editorial/);
  assert.match(page, /Abrir rascunho editorial/);
  assert.match(page, /plan\.editorialArticleId/);
  assert.match(route, /createEditorialDossierArticlePlanDraft/);
  assert.match(route, /dossier_plan_draft/);
  assert.match(route, /headers: \{ Location: `\$\{url\.pathname\}\$\{url\.search\}` \}/);
  assert.doesNotMatch(route, /NextResponse\.redirect\(/);

  assert.match(
    apply,
    /add column editorial_article_id uuid/i,
  );
  assert.match(
    apply,
    /create function public\.newsroom_create_editorial_dossier_article_plan_draft/i,
  );
  assert.match(apply, /for update/i);
  assert.match(apply, /draft_action text/i);
  assert.match(apply, /'reused'/i);
  assert.match(apply, /body,\s*image_url/i);
  assert.match(apply, /'',\s*null,/i);
  assert.match(apply, /editorial_dossier_article_plan_already_converted/i);
  assert.doesNotMatch(
    [page, route, apply].join("\n"),
    /openai|anthropic|gemini|generateContent|translation_run|prompt_version|status\s*=\s*'published'/i,
  );
});
