import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseMesaProductionIntents } from "./newsroom-mesa-production-intents-contract";
import { mesaProductionIntentsService, type MesaIntentPublicationArticle } from "./newsroom-mesa-production-intents-service-internal";

const fixture = JSON.parse(readFileSync(".ci/mesa-intents-sql/intent-plan.fixture.json", "utf8"));
const plan = parseMesaProductionIntents(fixture.plan)!;
assert.ok(plan);
const packageId = fixture.manifest.packageId as string;
const sourceId = "a0000000-0000-4000-8000-000000000010";
function publication(kind: "new" | "existing") {
  const output = plan.outputs.find((item) => item.kind === kind)!;
  const article: MesaIntentPublicationArticle = {
    id: output.target?.editorialArticleId ?? output.outputId,
    slug: output.target?.slug ?? "novo-artigo", label: "Liga", title: "Artigo de teste",
    subtitle: "Contexto", body: "Texto", imageUrl: null, author: "Editor",
    publishedAt: "2026-09-24T12:00:00Z",
    matchdayId: output.target ? output.target.matchdayId : "a0000000-0000-4000-8000-000000000011",
    mode: kind === "new" ? "create" : "update", classificationKey: "fc_porto",
  };
  return { plan, packageId, outputId: output.outputId, dossierSourceIds: [sourceId], article };
}

for (const kind of ["new", "existing"] as const) {
  test(`${kind === "new" ? "NEW" : "UPDATE"} envia exatamente a decisão final e o ID canónico pela RPC existente`, async () => {
    const input = publication(kind);
    const calls: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
    const service = mesaProductionIntentsService({ get: async () => [], post: async (name, args) => {
      calls.push({ name, args });
      return [{ editorial_article_id: input.article.id, article_slug: input.article.slug,
        publication_action: kind === "new" ? "created" : "updated", consolidated: false }];
    } });
    const result = await service.publish(input);
    assert.equal(result.articleId, input.article.id);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "newsroom_publish_mesa_intent_output_v2");
    assert.equal(calls[0].args.p_output_id, input.outputId);
    assert.equal(calls[0].args.p_classification_key, "fc_porto");
    assert.deepEqual(calls[0].args.p_article, input.article);
    assert.deepEqual(calls[0].args.p_dossier_source_ids, [sourceId]);
    if (kind === "existing") assert.notEqual(input.outputId, result.articleId);
  });
}

test("publicar sem classificação é recusado antes da RPC, em NEW e UPDATE", async () => {
  let calls = 0;
  const service = mesaProductionIntentsService({ get: async () => [], post: async () => { calls++; return []; } });
  for (const kind of ["new", "existing"] as const) {
    const input = publication(kind);
    await assert.rejects(service.publish({ ...input, article: { ...input.article, classificationKey: null as never } }), /publication-input-invalid/);
  }
  assert.equal(calls, 0);
});

test("retry conserva o payload final e propaga conflito da autoridade SQL sem fallback", async () => {
  const input = publication("existing");
  const calls: Readonly<Record<string, unknown>>[] = [];
  let conflict = false;
  const service = mesaProductionIntentsService({ get: async () => [], post: async (_name, args) => {
    calls.push(args);
    if (conflict) throw new Error("mesa-publication-provenance-conflict");
    return [{ editorial_article_id: input.article.id, article_slug: input.article.slug,
      publication_action: "reused", consolidated: true }];
  } });
  assert.equal((await service.publish(input)).action, "reused");
  assert.equal((await service.publish(input)).action, "reused");
  assert.deepEqual(calls[0], calls[1]);
  conflict = true;
  await assert.rejects(service.publish({ ...input, article: { ...input.article, classificationKey: "sporting" } }), /mesa-publication-provenance-conflict/);
  assert.equal(calls.length, 3, "não tenta reclassificar por uma segunda via");
});

test("SEM ALTERAÇÃO apenas finaliza a resolução; não envia classificação nem chama publicação", async () => {
  const existing = plan.outputs.find((output) => output.kind === "existing")!;
  const calls: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
  const service = mesaProductionIntentsService({ get: async () => [], post: async (name, args) => {
    calls.push({ name, args });
    return [{ result: { action: "consolidated", publicationEventId: "a0000000-0000-4000-8000-000000000012",
      noChangeCount: 1, newCount: plan.totals.newArticles, updatedCount: plan.totals.reviews - 1 } }];
  } });
  const result = await service.finalize({ plan, packageId, noChangeOutputIds: [existing.outputId] });
  assert.equal(result.noChangeCount, 1);
  assert.deepEqual(calls, [{ name: "newsroom_finalize_mesa_intents_v1",
    args: { p_dossier_id: plan.dossierId, p_package_id: packageId, p_no_change_output_ids: [existing.outputId] } }]);
});

test("migration mantém a autoridade transacional e restringe a persistência da decisão ao plano", () => {
  const sql = readFileSync("supabase/migrations/20260924213644_newsroom_article_plan_classification_decision.sql", "utf8");
  assert.match(sql, /classification_key is null and classification_mode = 'cleared'/);
  assert.match(sql, /classification_key is not null and classification_mode in \('suggested', 'manual'\)/);
  assert.match(sql, /newsroom_save_dossier_article_plan_state_v1\(/);
  assert.match(sql, /before update of classification_key, classification_mode/);
  assert.match(sql, /set classification_key = v_classification_key,\s*classification_mode = 'manual'/);
  assert.match(sql, /new\.classification_fingerprint := v_fingerprint/);
  assert.doesNotMatch(sql, /alter table public\.editorial_articles|update public\.editorial_articles|delete from|drop column/i);
  assert.match(sql, /grant execute on function public\.newsroom_save_dossier_article_plan_state_v3\([\s\S]*?to service_role/);
});
