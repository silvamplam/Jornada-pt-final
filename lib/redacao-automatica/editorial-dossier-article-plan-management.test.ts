import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  saveEditorialDossierArticlePlanService,
  type EditorialDossierArticlePlanDossierState,
  type EditorialDossierArticlePlanRpcInput,
  type EditorialDossierArticlePlanTransport,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service-internal";

const dossierId = "00000000-0000-4000-8000-000000000001";
const planId = "00000000-0000-4000-8000-000000000011";
const sourceOneId = "00000000-0000-4000-8000-000000000021";
const sourceTwoId = "00000000-0000-4000-8000-000000000022";
const sourceThreeId = "00000000-0000-4000-8000-000000000023";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function dossierState(
  overrides: Partial<EditorialDossierArticlePlanDossierState> = {},
): EditorialDossierArticlePlanDossierState {
  return {
    dossierId,
    sources: [
      { id: sourceOneId, included: true },
      { id: sourceTwoId, included: false },
      { id: sourceThreeId, included: true },
    ],
    plans: [],
    ...overrides,
  };
}

function fakeTransport(
  state: EditorialDossierArticlePlanDossierState | null,
  savedId = planId,
) {
  const payloads: EditorialDossierArticlePlanRpcInput[] = [];
  const transport: EditorialDossierArticlePlanTransport = {
    isConfigured: () => true,
    readDossierState: async () => state,
    saveArticlePlan: async (payload) => {
      payloads.push(payload);
      return savedId;
    },
  };

  return { transport, payloads };
}

function baseInput() {
  return {
    dossierId,
    articlePlanId: null,
    workingTitle: "Artigo planeado",
    status: "planned" as const,
    priority: 1,
    articleKind: "news" as const,
    lengthMode: "standard" as const,
    editorialInstructions: "",
    sources: [{ dossierSourceId: sourceOneId, priority: 1 }],
  };
}

test("cria um plano em preparação e envia fontes ordenadas à RPC", async () => {
  const { transport, payloads } = fakeTransport(dossierState());
  const save = saveEditorialDossierArticlePlanService(transport);
  const result = await save({
    ...baseInput(),
    sources: [
      { dossierSourceId: sourceThreeId, priority: 2 },
      { dossierSourceId: sourceOneId, priority: 1 },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(payloads[0]?.p_dossier_source_ids, [sourceOneId, sourceThreeId]);
  assert.equal(payloads[0]?.p_sort_order, 10);
  assert.equal(payloads[0]?.p_status, "planned");
});

test("um plano pronto exige orientação e pelo menos uma fonte", async () => {
  const { transport, payloads } = fakeTransport(dossierState());
  const save = saveEditorialDossierArticlePlanService(transport);
  const result = await save({
    ...baseInput(),
    status: "ready",
    editorialInstructions: "",
    sources: [],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "article_plan_ready_incomplete");
  }
  assert.equal(payloads.length, 0);
});

test("uma fonte excluída não pode ser atribuída a um novo plano", async () => {
  const { transport, payloads } = fakeTransport(dossierState());
  const save = saveEditorialDossierArticlePlanService(transport);
  const result = await save({
    ...baseInput(),
    sources: [{ dossierSourceId: sourceTwoId, priority: 1 }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "article_plan_source_unavailable");
  }
  assert.equal(payloads.length, 0);
});

test("uma fonte depois excluída pode permanecer num plano onde já estava atribuída", async () => {
  const state = dossierState({
    plans: [{
      id: planId,
      status: "planned",
      editorialArticleId: null,
      sources: [{ dossierSourceId: sourceTwoId, sortOrder: 10 }],
    }],
  });
  const { transport, payloads } = fakeTransport(state);
  const save = saveEditorialDossierArticlePlanService(transport);
  const result = await save({
    ...baseInput(),
    articlePlanId: planId,
    sources: [{ dossierSourceId: sourceTwoId, priority: 1 }],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(payloads[0]?.p_dossier_source_ids, [sourceTwoId]);
});

test("um plano já convertido fica imutável", async () => {
  const state = dossierState({
    plans: [{
      id: planId,
      status: "ready",
      editorialArticleId: "00000000-0000-4000-8000-000000000099",
      sources: [{ dossierSourceId: sourceOneId, sortOrder: 10 }],
    }],
  });
  const { transport, payloads } = fakeTransport(state);
  const save = saveEditorialDossierArticlePlanService(transport);
  const result = await save({
    ...baseInput(),
    articlePlanId: planId,
    status: "ready",
    editorialInstructions: "Orientação já congelada.",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "article_plan_already_converted");
  }
  assert.equal(payloads.length, 0);
});

test("cancelar preserva no payload as atribuições existentes", async () => {
  const state = dossierState({
    plans: [{
      id: planId,
      status: "ready",
      editorialArticleId: null,
      sources: [
        { dossierSourceId: sourceThreeId, sortOrder: 20 },
        { dossierSourceId: sourceOneId, sortOrder: 10 },
      ],
    }],
  });
  const { transport, payloads } = fakeTransport(state);
  const save = saveEditorialDossierArticlePlanService(transport);
  const result = await save({
    ...baseInput(),
    articlePlanId: planId,
    status: "cancelled",
    sources: [],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(payloads[0]?.p_dossier_source_ids, [sourceOneId, sourceThreeId]);
  assert.equal(payloads[0]?.p_status, "cancelled");
});

test("não permite criar ou reativar um quinto plano ativo", async () => {
  const state = dossierState({
    plans: [1, 2, 3, 4].map((index) => ({
      id: `00000000-0000-4000-8000-00000000010${index}`,
      status: "planned" as const,
      editorialArticleId: null,
      sources: [],
    })),
  });
  const { transport, payloads } = fakeTransport(state);
  const save = saveEditorialDossierArticlePlanService(transport);
  const result = await save(baseInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "article_plan_limit_exceeded");
  }
  assert.equal(payloads.length, 0);
});

test("a página apresenta criação, edição, estados e atribuição de fontes", () => {
  const page = read("app/admin/editorial/redacao-automatica/dossies/[id]/page.tsx");

  assert.match(page, /listEditorialDossierArticlePlans/);
  assert.match(page, /Artigos planeados/);
  assert.match(page, /name="action" value="save_article_plan"/);
  assert.match(page, /name="article_plan_status"/);
  assert.match(page, /name="article_plan_source_id"/);
  assert.match(page, /article_plan_source_priority_/);
  assert.match(page, /Planeado/);
  assert.match(page, /Pronto/);
  assert.match(page, /Cancelado/);
  assert.match(page, /activeArticlePlanCount < 4/);
  assert.doesNotMatch(page, /<option value="5">5<\/option>/);
});

test("a rota preserva redirect relativo e distingue a gravação dos planos", () => {
  const route = read("app/api/admin/editorial/redacao-automatica/dossies/route.ts");

  assert.match(route, /action === "save_article_plan"/);
  assert.match(route, /saveEditorialDossierArticlePlan/);
  assert.match(route, /article_plan_created/);
  assert.match(route, /article_plan_cancelled/);
  assert.match(route, /headers: \{ Location: `\$\{url\.pathname\}\$\{url\.search\}` \}/);
  assert.doesNotMatch(route, /NextResponse\.redirect\(/);
  assert.match(route, /Math\.min\(Math\.max\(Math\.trunc\(requestedOutputCount\), 2\), 4\)/);
  assert.match(
    read("lib/redacao-automatica/editorial-dossier-service-internal.ts"),
    /outputCount >= 2 && outputCount <= 4/,
  );
});

test("a aplicação usa uma RPC transacional e não escreve diretamente nos planos", () => {
  const service = read("lib/redacao-automatica/editorial-dossier-article-plan-service.ts");
  const apply = read(
    "supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigos-planeados-ux-1-aplicar.sql",
  );

  assert.match(service, /rpc\/newsroom_save_editorial_dossier_article_plan/);
  assert.match(apply, /create function public\.newsroom_save_editorial_dossier_article_plan/);
  assert.match(apply, /returns table\(article_plan_id uuid\)/);
  assert.match(apply, /security invoker/);
  assert.match(apply, /for update/);
  assert.match(
    apply,
    /on conflict on constraint newsroom_editorial_dossier_article_plan_sources_plan_source_key/,
  );
  assert.doesNotMatch(apply, /on conflict \(article_plan_id, dossier_source_id\)/);
  assert.match(apply, /if p_status <> 'cancelled'/);
  assert.doesNotMatch(service, /newsroom_editorial_dossier_article_plans\?on_conflict/);
});

test("a gestão do plano continua sem chamar IA, publicar ou escrever artigos", () => {
  const source = [
    read("lib/redacao-automatica/editorial-dossier-article-plan-service.ts"),
    read("lib/redacao-automatica/editorial-dossier-article-plan-service-internal.ts"),
  ].join("\n");

  assert.doesNotMatch(source, /openai|anthropic|gemini|generateContent|responses\.create/i);
  assert.doesNotMatch(source, /editorial_articles\?select|insert into public\.editorial_articles|status\s*:\s*"published"/i);
  assert.doesNotMatch(source, /cron|worker|webhook|http_post|net\./i);
});

test("preflight, postflight e smoke protegem a aplicação manual da RPC", () => {
  const root = "supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigos-planeados-ux-1";
  const preflight = read(`${root}-preflight.sql`);
  const postflight = read(`${root}-postflight.sql`);
  const smoke = read(`${root}-smoke-rollback.sql`);

  assert.match(preflight, /set local transaction_read_only = on/i);
  assert.match(preflight, /preflight_target_function_exists/i);
  assert.match(preflight, /ready_for_apply', true/i);
  assert.match(preflight, /rollback;/i);
  assert.doesNotMatch(preflight, /create function|insert into|update public|delete from/i);

  assert.match(postflight, /postflight_function_must_use_security_invoker/i);
  assert.match(postflight, /postflight_service_role_execute_missing/i);
  assert.match(postflight, /postflight_unexpected_client_execute_privilege/i);
  assert.match(postflight, /postflight_ok', true/i);
  assert.match(postflight, /rollback;/i);

  assert.match(smoke, /smoke_cancelled_plan_did_not_preserve_assignments/i);
  assert.match(smoke, /smoke_excluded_source_was_not_blocked/i);
  assert.match(smoke, /smoke_active_plan_limit_was_not_blocked/i);
  assert.match(smoke, /persistent_writes', false/i);
  assert.match(smoke, /rollback;/i);
});
