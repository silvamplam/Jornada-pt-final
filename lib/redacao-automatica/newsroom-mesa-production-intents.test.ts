import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  compareMesaArticleSourceCapture,
  mesaProductionIntentAuthorityMaterial,
  parseMesaProductionIntent,
  resolveMesaIntentPublication,
  resolveMesaProductionIntent,
  type MesaArticleCaptureReceipt,
  type MesaIntentPublicationDecision,
  type MesaProductionAuthorities,
  type MesaProductionIntent,
  type MesaProductionIntentPlan,
  type MesaPublishedArticleAuthority,
  type MesaSourceAuthority,
  type MesaThemeIntent,
} from "./newsroom-mesa-production-intents";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const readAt = "2026-09-17T12:00:00.000Z";
const sourceAt = "2026-09-17T11:00:00.000Z";
const source = (n: number, version = 1): MesaSourceAuthority => ({
  newsroomArticleId: id(n), latestSnapshot: { id: id(1000 + n * 10 + version), capturedAt: sourceAt, usable: true },
});
const article = (n: number, matchdayId: string | null = id(900)): MesaPublishedArticleAuthority => ({
  editorialArticleId: id(2000 + n), slug: `noticia-${n}`, title: `Artigo ${n}`, matchdayId,
  contentFingerprint: createHash("sha256").update(`body-${n}`).digest("hex"),
});
function authorities(published = 1): MesaProductionAuthorities {
  return {
    readAt,
    themes: [{ themeId: id(500), title: "Milan / Amorim", status: "open", sources: [source(1), source(2)],
      publishedArticles: Array.from({ length: published }, (_, i) => article(i + 1)) }],
    sources: [source(3), source(4)],
  };
}
function intent(reviewPublished = true, newArticleCount = 0): MesaProductionIntent {
  return { version: 1, preparationKey: id(800), title: "Preparação",
    themes: [{ themeId: id(500), action: "prepare", reviewPublished, newArticleCount }], sources: [] };
}
function selectionIntent(reviewArticleIds: readonly string[] = [article(1).editorialArticleId], newArticleCount = 0): MesaProductionIntent {
  return { version: 1, preparationKey: id(801), title: "Seleção editorial",
    themes: [], sources: [], selection: { sourceIds: [id(3), id(4)], reviewArticleIds, newArticleCount } };
}
function plan(request: unknown = intent(), data = authorities()): MesaProductionIntentPlan {
  const result = resolveMesaProductionIntent(request, data);
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}
function fails(request: unknown, data: MesaProductionAuthorities, code: string) {
  const result = resolveMesaProductionIntent(request, data);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((item) => item.code === code), JSON.stringify(result));
}
function published(frozen: MesaProductionIntentPlan): MesaIntentPublicationDecision[] {
  return frozen.outputs.map((output, i) => output.kind === "existing"
    ? { slot: output.slot, decision: "UPDATE", publishedArticle: {
        id: output.target!.editorialArticleId, slug: output.target!.slug, matchdayId: output.target!.matchdayId,
      } }
    : { slot: output.slot, decision: "NEW", publishedArticle: { id: id(7000 + i), slug: `nova-${i}`, matchdayId: id(901) } });
}
function receipts(frozen: MesaProductionIntentPlan, decisions = published(frozen)): readonly MesaArticleCaptureReceipt[] {
  const result = resolveMesaIntentPublication(frozen, decisions);
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}
function fingerprint(frozen: MesaProductionIntentPlan): string {
  return createHash("sha256").update(mesaProductionIntentAuthorityMaterial(frozen)).digest("hex");
}


test("selection mantém N fontes num único contexto técnico e permite N→M", () => {
  const request = selectionIntent([article(1).editorialArticleId, article(2).editorialArticleId], 2);
  const data: MesaProductionAuthorities = { ...authorities(0), selectionPublishedArticles: [article(1), article(2)] };
  const frozen = plan(request, data);
  assert.deepEqual(frozen.totals, { contexts: 1, sources: 2, reviews: 2, newArticles: 2 });
  assert.equal(frozen.contexts[0].kind, "selection");
  assert.equal(frozen.contexts[0].key, `selection:${request.preparationKey}`);
  assert.deepEqual(frozen.contexts[0].sources.map((item) => item.newsroomArticleId), [id(3), id(4)]);
  assert.deepEqual(frozen.outputs.map((item) => item.kind), ["existing", "existing", "new", "new"]);
});

test("selection não revê candidatos que o editor não escolheu", () => {
  const frozen = plan(selectionIntent([article(2).editorialArticleId], 1),
    { ...authorities(0), selectionPublishedArticles: [article(1), article(2)] });
  assert.deepEqual(frozen.contexts[0].publishedArticles.map((item) => item.editorialArticleId), [article(2).editorialArticleId]);
  assert.deepEqual(frozen.outputs.map((item) => item.kind), ["existing", "new"]);
});

test("selection pode produzir só NEW mesmo havendo candidatos globais", () => {
  const frozen = plan(selectionIntent([], 4), { ...authorities(0), selectionPublishedArticles: [article(1), article(2)] });
  assert.equal(frozen.contexts[0].publishedArticles.length, 0);
  assert.equal(frozen.totals.reviews, 0);
  assert.equal(frozen.totals.newArticles, 4);
});

test("selection não depende de a fonte estar ou não organizada num Tema", () => {
  const request: MesaProductionIntent = { ...selectionIntent(), selection: {
    sourceIds: [id(1), id(3)], reviewArticleIds: [article(1).editorialArticleId], newArticleCount: 0 } };
  const data: MesaProductionAuthorities = { ...authorities(0), sources: [source(1), source(3)], selectionPublishedArticles: [article(1)] };
  const frozen = plan(request, data);
  assert.equal(frozen.contexts[0].kind, "selection");
  assert.deepEqual(frozen.contexts[0].sources.map((item) => item.newsroomArticleId), [id(1), id(3)]);
});

test("selection rejeita alvo que deixou de ser candidato e duplicação com destino antigo", () => {
  fails(selectionIntent([article(1).editorialArticleId],0), authorities(0), "selection_target_unavailable");
  assert.equal(parseMesaProductionIntent({ ...selectionIntent(), sources: [{ sourceId: id(3), destination: "independent", newArticleCount: 1 }] }).ok, false);
  assert.equal(parseMesaProductionIntent({ ...selectionIntent(), selection: { sourceIds: [id(3), id(3)],
    reviewArticleIds: [], newArticleCount: 1 } }).ok, false);
  assert.equal(parseMesaProductionIntent({ ...selectionIntent(), selection: { sourceIds: [id(3)],
    reviewArticleIds: [], newArticleCount: 0 } }).ok, false);
});

test("selection com Tema infere focos sem cortar o contexto quando a proveniência o demonstra", () => {
  const request: MesaProductionIntent={version:1,preparationKey:id(802),title:"Seleção completa",themes:[],sources:[],
    selection:{sourceIds:[id(3)],themeIds:[id(500)],candidateArticleIds:[article(1).editorialArticleId],
      reviewArticleIds:[article(1).editorialArticleId],newArticleCount:1}};
  const candidate: MesaPublishedArticleAuthority={...article(1),evidence:{sourceIds:[id(1),id(2)],themeIds:[id(500)]}};
  const data: MesaProductionAuthorities={...authorities(0),selectionPublishedArticles:[candidate],
    selectionSources:[source(1),source(2),source(3)]};
  const frozen=plan(request,data);
  assert.equal(frozen.contexts.length,1);assert.equal(frozen.contexts[0].kind,"selection");
  assert.deepEqual(frozen.contexts[0].sources.map(s=>s.newsroomArticleId),[id(1),id(2),id(3)]);
  assert.deepEqual(frozen.outputs.map(o=>o.kind),["existing","new"]);
  assert.deepEqual(frozen.outputs[0].focusSourceIds,[id(1),id(2)]);
  assert.deepEqual(frozen.outputs[1].focusSourceIds,[id(3)]);
  assert.deepEqual(frozen.contexts[0].sources.map(s=>s.newsroomArticleId),[id(1),id(2),id(3)]);
});

test("selection conserva contexto inteiro quando não há prova segura para segmentar", () => {
  const request: MesaProductionIntent={version:1,preparationKey:id(804),title:"Seleção ambígua",themes:[],sources:[],
    selection:{sourceIds:[id(3)],themeIds:[id(500)],candidateArticleIds:[article(1).editorialArticleId],
      reviewArticleIds:[article(1).editorialArticleId],newArticleCount:1}};
  const frozen=plan(request,{...authorities(0),selectionPublishedArticles:[article(1)],
    selectionSources:[source(1),source(2),source(3)]});
  assert.equal(frozen.outputs[0].focusSourceIds,undefined);
  assert.equal(frozen.outputs[1].focusSourceIds,undefined);
  assert.deepEqual(frozen.contexts[0].sources.map(s=>s.newsroomArticleId),[id(1),id(2),id(3)]);
});

test("selection com vários NEW não inventa distribuição do material residual", () => {
  const request: MesaProductionIntent={version:1,preparationKey:id(805),title:"Seleção com dois novos",themes:[],sources:[],
    selection:{sourceIds:[id(3)],themeIds:[id(500)],candidateArticleIds:[article(1).editorialArticleId],
      reviewArticleIds:[article(1).editorialArticleId],newArticleCount:2}};
  const candidate: MesaPublishedArticleAuthority={...article(1),evidence:{sourceIds:[id(1),id(2)],themeIds:[id(500)]}};
  const frozen=plan(request,{...authorities(0),selectionPublishedArticles:[candidate],
    selectionSources:[source(1),source(2),source(3)]});
  assert.deepEqual(frozen.outputs[0].focusSourceIds,[id(1),id(2)]);
  assert.equal(frozen.outputs[1].focusSourceIds,undefined);
  assert.equal(frozen.outputs[2].focusSourceIds,undefined);
});


test("candidate set alterado fica stale antes de NEW", () => {
  const request: MesaProductionIntent={version:1,preparationKey:id(803),title:"Seleção",themes:[],sources:[],
    selection:{sourceIds:[id(3)],candidateArticleIds:[article(1).editorialArticleId],reviewArticleIds:[],newArticleCount:1}};
  fails(request,{...authorities(0),selectionPublishedArticles:[article(1),article(2)],selectionSources:[source(3)]},"selection_candidates_stale");
});

for (const [name, review, fresh, reviews, newArticles] of [
  ["Tema publicado sozinho: só revisão", true, 0, 2, 0],
  ["Tema publicado: revisão e novos", true, 3, 2, 3],
  ["Tema publicado: só novos sem UPDATE", false, 3, 0, 3],
] as const) test(name, () => {
  const frozen = plan(intent(review, fresh), authorities(2));
  assert.deepEqual(frozen.totals, { contexts: 1, sources: 2, reviews, newArticles });
  assert.equal(frozen.contexts[0].publishedArticles.length, 2);
  assert.equal(frozen.outputs.filter((output) => output.kind === "existing").length, reviews);
});

test("Tema sem publicados segue só novos; não inventa alvos de revisão", () => {
  const frozen = plan(intent(false, 2), authorities(0));
  assert.equal(frozen.totals.reviews, 0);
  assert.equal(frozen.totals.newArticles, 2);
  fails(intent(true, 1), authorities(0), "nothing_to_review");
});

test("rascunhos e produções não são contados como artigos publicados", () => {
  // Only canonical published articles supplied by the authority are review targets.
  assert.deepEqual(plan(intent(false, 1), authorities(0)).outputs.map((output) => output.target), [null]);
});

test("não rever + zero novos exige deixar para depois, nunca ignora o Tema", () => {
  fails(intent(false, 0), authorities(), "theme_work_missing");
});

test("selecionar um Tema não obriga a criar um artigo novo", () => {
  assert.equal(plan().outputs.some((output) => output.kind === "new"), false);
});

test("Tema + fonte independente: contextos e fontes nunca se misturam", () => {
  const frozen = plan({ ...intent(), sources: [{ sourceId: id(3), destination: "independent", newArticleCount: 1 }] });
  const theme = frozen.contexts.find((item) => item.kind === "theme")!;
  const independent = frozen.contexts.find((item) => item.kind === "source")!;
  assert.deepEqual(theme.sources.map((item) => item.newsroomArticleId), [id(1), id(2)]);
  assert.deepEqual(independent.sources.map((item) => item.newsroomArticleId), [id(3)]);
  assert.equal(independent.themeId, null);
  assert.deepEqual(independent.publishedArticles, []);
  assert.deepEqual(frozen.incorporations, []);
  assert.deepEqual(frozen.outputs.map((output) => [output.kind, output.contextKey]), [
    ["existing", `theme:${id(500)}`], ["new", `source:${id(3)}`],
  ]);
});

test("incorporar junta material ao Tema sem criar um artigo por fonte", () => {
  const frozen = plan({ ...intent(), sources: [{ sourceId: id(3), destination: "theme", themeId: id(500) }] });
  assert.deepEqual(frozen.incorporations, [{ sourceId: id(3), themeId: id(500) }]);
  assert.equal(frozen.contexts.length, 1);
  assert.equal(frozen.contexts[0].sources.length, 3);
  assert.equal(frozen.totals.newArticles, 0);
});

test("incorporar algumas fontes e manter outras independentes", () => {
  const frozen = plan({ ...intent(true, 1), sources: [
    { sourceId: id(3), destination: "theme", themeId: id(500) },
    { sourceId: id(4), destination: "independent", newArticleCount: 2 },
  ] });
  assert.equal(frozen.totals.reviews, 1);
  assert.equal(frozen.totals.newArticles, 3);
  assert.equal(frozen.totals.sources, 4);
  assert.deepEqual(frozen.incorporations.map((item) => item.sourceId), [id(3)]);
});

test("deixar o Tema para depois permite trabalhar apenas a fonte independente", () => {
  const frozen = plan({ ...intent(), themes: [{ themeId: id(500), action: "defer" }],
    sources: [{ sourceId: id(3), destination: "independent", newArticleCount: 1 }] }, { ...authorities(), themes: [] });
  assert.deepEqual(frozen.deferred.themeIds, [id(500)]);
  assert.equal(frozen.contexts.length, 1);
  assert.equal(frozen.contexts[0].themeId, null);
  assert.equal(frozen.totals.reviews, 0);
});

test("fontes deixadas para depois não precisam de leitura nem desaparecem", () => {
  const frozen = plan({ ...intent(), sources: [{ sourceId: id(999), destination: "defer" }] });
  assert.deepEqual(frozen.deferred.sourceIds, [id(999)]);
  assert.equal(frozen.totals.sources, 2);
});

test("sem incorporar nem fontes novas, o Tema usa snapshots antigos atualizados", () => {
  const data = authorities();
  const frozen = plan(intent(), { ...data, themes: [{ ...data.themes[0], sources: [source(1, 2), source(2)] }] });
  assert.equal(frozen.contexts[0].sources[0].newsroomSnapshotId, source(1, 2).latestSnapshot!.id);
  assert.equal(frozen.incorporations.length, 0);
});

test("novos sem revisão conservam todos os antigos apenas como referência", () => {
  const frozen = plan(intent(false, 1), authorities(50));
  assert.equal(frozen.contexts[0].publishedArticles.length, 50);
  assert.deepEqual(frozen.outputs.map((output) => output.kind), ["new"]);
});

test("vários Temas têm decisões independentes", () => {
  const data = authorities();
  const request = { ...intent(), themes: [
    ...intent().themes,
    { themeId: id(501), action: "prepare", reviewPublished: false, newArticleCount: 2 },
  ] };
  const frozen = plan(request, { ...data, themes: [...data.themes, {
    ...data.themes[0], themeId: id(501), title: "Outro Tema", sources: [source(4)], publishedArticles: [article(10)],
  }] });
  assert.equal(frozen.totals.reviews, 1);
  assert.equal(frozen.totals.newArticles, 2);
  assert.equal(frozen.outputs.some((output) => output.target?.editorialArticleId === article(10).editorialArticleId), false);
});

test("incorporação exige destino selecionado e ativo", () => {
  fails({ ...intent(), sources: [{ sourceId: id(3), destination: "theme", themeId: id(999) }] }, authorities(), "incorporation_target_inactive");
  fails({ ...intent(), themes: [{ themeId: id(500), action: "defer" }],
    sources: [{ sourceId: id(3), destination: "theme", themeId: id(500) }] }, authorities(), "incorporation_target_inactive");
});

test("fonte que já pertence ao Tema não duplica a associação", () => {
  const data = { ...authorities(), sources: [source(1)] };
  const frozen = plan({ ...intent(), sources: [{ sourceId: id(1), destination: "theme", themeId: id(500) }] }, data);
  assert.equal(frozen.incorporations.length, 0);
  assert.equal(frozen.contexts[0].sources.length, 2);
});

test("Tema indisponível dá erro contextual, não é descartado silenciosamente", () => {
  const result = resolveMesaProductionIntent(intent(), { ...authorities(), themes: [] });
  assert.ok(!result.ok);
  assert.ok(result.issues.some((item) => item.contextKey === `theme:${id(500)}`));
});

test("Tema arquivado não entra na preparação", () => {
  const data = authorities();
  fails(intent(), { ...data, themes: [{ ...data.themes[0], status: "archived" }] }, "theme_unavailable");
});

test("sem fontes utilizáveis, não há preparação fictícia", () => {
  const data = authorities();
  for (const sources of [[], [{ newsroomArticleId: id(1), latestSnapshot: null }],
    [{ ...source(1), latestSnapshot: { ...source(1).latestSnapshot!, usable: false } }]]) {
    const result = resolveMesaProductionIntent(intent(), { ...data, themes: [{ ...data.themes[0], sources }] });
    assert.equal(result.ok, false);
  }
});

test("mesmo snapshot em dois Temas conta uma fonte física, mantendo contextos distintos", () => {
  const data = authorities(0);
  const frozen = plan({ ...intent(false, 1), themes: [...intent(false, 1).themes,
    { themeId: id(501), action: "prepare", reviewPublished: false, newArticleCount: 1 }] },
  { ...data, themes: [...data.themes, { ...data.themes[0], themeId: id(501) }] });
  assert.equal(frozen.totals.sources, 2);
  assert.equal(frozen.contexts.length, 2);
});

test("versões diferentes da mesma fonte não são reconciliadas em silêncio", () => {
  const data = authorities(0);
  fails({ ...intent(false, 1), themes: [...intent(false, 1).themes,
    { themeId: id(501), action: "prepare", reviewPublished: false, newArticleCount: 1 }] },
  { ...data, themes: [...data.themes, { ...data.themes[0], themeId: id(501), sources: [source(1, 2)] }] }, "source_version_conflict");
});

test("dois Temas não podem atualizar o mesmo artigo no mesmo ciclo", () => {
  const data = authorities();
  fails({ ...intent(), themes: [...intent().themes,
    { themeId: id(501), action: "prepare", reviewPublished: true, newArticleCount: 0 }] },
  { ...data, themes: [...data.themes, { ...data.themes[0], themeId: id(501) }] }, "review_target_conflict");
});

test("artigo sem jornada mantém o contexto nulo", () => {
  const data = authorities();
  const frozen = plan(intent(), { ...data, themes: [{ ...data.themes[0], publishedArticles: [article(1, null)] }] });
  assert.equal(frozen.outputs[0].target?.matchdayId, null);
  assert.equal(receipts(frozen).length, 1);
});

test("histórico sem identidade ou fingerprint completo não é aceite", () => {
  const data = authorities();
  for (const broken of [{ ...article(1), slug: "" }, { ...article(1), contentFingerprint: "abc" },
    { ...article(1), matchdayId: "inventada" }]) {
    fails(intent(false, 1), { ...data, themes: [{ ...data.themes[0], publishedArticles: [broken] }] }, "published_history_invalid");
  }
});

test("datas impossíveis ou futuras não entram numa captura", () => {
  fails(intent(), { ...authorities(), readAt: "2026-02-31T12:00:00.000Z" }, "authority_invalid");
  const data = authorities();
  fails(intent(), { ...data, themes: [{ ...data.themes[0], sources: [{ ...source(1),
    latestSnapshot: { ...source(1).latestSnapshot!, capturedAt: "2026-09-18T12:00:00.000Z" } }] }] }, "source_snapshot_unavailable");
});

test("limite de saídas inclui revisões mas não artigos só de referência", () => {
  assert.equal(plan(intent(true, 28), authorities(2)).outputs.length, 30);
  fails(intent(true, 29), authorities(2), "output_limit");
  assert.equal(plan(intent(false, 30), authorities(50)).outputs.length, 30);
});

test("mais de 20 fontes não são truncadas", () => {
  const data = authorities();
  const twenty = { ...data, themes: [{ ...data.themes[0], sources: Array.from({ length: 20 }, (_, i) => source(i + 1)) }] };
  assert.equal(plan(intent(), twenty).totals.sources, 20);
  fails(intent(), { ...twenty, themes: [{ ...twenty.themes[0], sources: [...twenty.themes[0].sources, source(21)] }] }, "source_limit");
});

test("nenhuma operação altera os objetos fornecidos", () => {
  const request = intent(), data = authorities(), before = JSON.stringify([request, data]);
  plan(request, data);
  assert.equal(JSON.stringify([request, data]), before);
});

test("ordem da seleção não troca identidades nem a autoridade", () => {
  const request = { ...intent(true, 1), sources: [
    { sourceId: id(3), destination: "independent", newArticleCount: 1 },
    { sourceId: id(4), destination: "theme", themeId: id(500) },
  ] };
  const data = authorities(2);
  const first = plan(request, data);
  const second = plan({ ...request, sources: [...request.sources].reverse() }, { ...data,
    themes: [{ ...data.themes[0], sources: [...data.themes[0].sources].reverse(),
      publishedArticles: [...data.themes[0].publishedArticles].reverse() }] });
  assert.equal(fingerprint(first), fingerprint(second));
});

test("reler a mesma matéria não altera a autoridade só porque passou tempo", () => {
  assert.equal(fingerprint(plan()), fingerprint(plan(intent(), { ...authorities(), readAt: "2026-09-17T13:00:00.000Z" })));
});

test("mudar decisão, corpo publicado, associação ou snapshot invalida a captura", () => {
  const initial = fingerprint(plan());
  const data = authorities();
  assert.notEqual(initial, fingerprint(plan(intent(false, 1))));
  assert.notEqual(initial, fingerprint(plan(intent(), { ...data, themes: [{ ...data.themes[0],
    publishedArticles: [{ ...article(1), contentFingerprint: "f".repeat(64) }] }] })));
  assert.notEqual(initial, fingerprint(plan(intent(), { ...data, themes: [{ ...data.themes[0], sources: [source(1, 2), source(2)] }] })));
  assert.notEqual(initial, fingerprint(plan(intent(), { ...data, themes: [{ ...data.themes[0], sources: [...data.themes[0].sources, source(3)] }] })));
});

for (const [name, patch] of [
  ["versão desconhecida", { version: 2 }],
  ["chave inválida", { preparationKey: "x" }],
  ["título vazio", { title: " " }],
  ["título longo", { title: "x".repeat(181) }],
  ["flag antiga não é decisão", { incorporateSources: true }],
  ["Temas repetidos", { themes: [...intent().themes, ...intent().themes] }],
  ["decisão ausente", { themes: [{ themeId: id(500), action: "prepare", newArticleCount: 1 }] }],
  ["contador em texto", { themes: [{ themeId: id(500), action: "prepare", reviewPublished: true, newArticleCount: "1" }] }],
  ["contador negativo", { themes: [{ themeId: id(500), action: "prepare", reviewPublished: true, newArticleCount: -1 }] }],
  ["contador fracionário", { themes: [{ themeId: id(500), action: "prepare", reviewPublished: true, newArticleCount: 0.5 }] }],
  ["fonte com dois destinos", { sources: [{ sourceId: id(3), destination: "independent", newArticleCount: 1, themeId: id(500) }] }],
  ["fonte independente sem trabalho", { sources: [{ sourceId: id(3), destination: "independent", newArticleCount: 0 }] }],
  ["Tema adiado com revisão escondida", { themes: [{ themeId: id(500), action: "defer", reviewPublished: true }] }],
] as const) test(`pedido rejeita ${name}`, () => {
  assert.equal(parseMesaProductionIntent({ ...intent(), ...patch }).ok, false);
});

test("normaliza UUIDs, sem confundir sim/não com truthiness", () => {
  const result = parseMesaProductionIntent({ ...intent(), preparationKey: id(800).toUpperCase() });
  assert.ok(result.ok);
  assert.equal(result.value.preparationKey, id(800));
  assert.equal(parseMesaProductionIntent({ ...intent(), themes: [{ ...(intent().themes[0] as Extract<MesaThemeIntent, { action: "prepare" }>), reviewPublished: "false" }] }).ok, false);
});

test("UPDATE / SEM ALTERAÇÃO e NEW resolvem apenas slots autorizados", () => {
  const frozen = plan(intent(true, 1), authorities(2));
  const decisions = published(frozen);
  decisions[1] = { slot: decisions[1].slot, decision: "SEM_ALTERAÇÃO", publishedArticle: null };
  assert.deepEqual(receipts(frozen, decisions).map((item) => item.decision), ["UPDATE", "SEM_ALTERAÇÃO", "NEW"]);
});

test("publicação parcial nunca produz recibos de revisão concluída", () => {
  const frozen = plan(intent(true, 1));
  assert.equal(resolveMesaIntentPublication(frozen, published(frozen).slice(0, 1)).ok, false);
});

test("só SEM ALTERAÇÃO resolve sem materializar artigos", () => {
  const frozen = plan(intent(), authorities(2));
  assert.equal(receipts(frozen, frozen.outputs.map((output) => ({
    slot: output.slot, decision: "SEM_ALTERAÇÃO", publishedArticle: null,
  }))).length, 2);
});

test("novo sem revisão não pode devolver SEM ALTERAÇÃO nem UPDATE", () => {
  const frozen = plan(intent(false, 1));
  for (const decision of ["UPDATE", "SEM_ALTERAÇÃO"] as const) {
    assert.equal(resolveMesaIntentPublication(frozen, [{ ...published(frozen)[0], decision }]).ok, false);
  }
});

test("UPDATE mantém artigo, endereço e jornada; NEW não reaproveita um antigo", () => {
  const frozen = plan();
  for (const patch of [{ id: id(9999) }, { slug: "endereco-alterado" }, { matchdayId: id(999) }]) {
    const decision = published(frozen)[0];
    assert.equal(resolveMesaIntentPublication(frozen, [{ ...decision, publishedArticle: { ...decision.publishedArticle!, ...patch } }]).ok, false);
  }
  const fresh = plan(intent(false, 1));
  assert.equal(resolveMesaIntentPublication(fresh, [{ ...published(fresh)[0], publishedArticle: {
    id: article(1).editorialArticleId, slug: article(1).slug, matchdayId: article(1).matchdayId,
  } }]).ok, false);
});

test("novo independente ganha memória própria sem ser associado ao Tema", () => {
  const frozen = plan({ ...intent(), sources: [{ sourceId: id(3), destination: "independent", newArticleCount: 1 }] });
  const resolved = receipts(frozen);
  assert.equal(resolved.length, 2);
  const themeReceipt=resolved.find((item) => item.themeId===id(500))!;
  const sourceReceipt=resolved.find((item) => item.themeId===null)!;
  assert.equal(themeReceipt.decision, "UPDATE");
  assert.equal(themeReceipt.sources.some((item) => item.newsroomArticleId === id(3)), false);
  assert.equal(sourceReceipt.decision, "NEW");
  assert.equal(sourceReceipt.contextKey, `source:${id(3)}`);
  assert.deepEqual(sourceReceipt.sources.map((item) => item.newsroomArticleId), [id(3)]);
});

test("selection produz receipts por artigo sem Theme", () => {
  const frozen=plan(selectionIntent([article(1).editorialArticleId],1),
    { ...authorities(0), selectionPublishedArticles:[article(1)] });
  const saved=receipts(frozen);
  assert.equal(saved.length,2);
  assert.ok(saved.every((item) => item.themeId===null && item.contextKey===`selection:${id(801)}`));
});

test("sequência crítica: NEW hoje não apaga a necessidade de rever os antigos amanhã", () => {
  const oldPlan = plan(), oldReceipts = receipts(oldPlan);
  const data = authorities();
  const updated = { ...data, readAt: "2026-09-17T14:00:00.000Z",
    themes: [{ ...data.themes[0], sources: [source(1, 2), source(2)] }] };
  const newOnly = plan(intent(false, 1), updated);
  const newReceipts = receipts(newOnly);
  assert.equal(newReceipts.some((receipt) => receipt.articleId === article(1).editorialArticleId), false);
  const all = [...oldReceipts, ...newReceipts];
  assert.deepEqual(compareMesaArticleSourceCapture(id(500), article(1).editorialArticleId,
    newOnly.contexts[0].sources, all).map((item) => item.change), ["UPDATED_SOURCE", "UNCHANGED_SOURCE"]);
  const reviewed = plan(intent(), { ...updated, readAt: "2026-09-17T15:00:00.000Z" });
  assert.deepEqual(compareMesaArticleSourceCapture(id(500), article(1).editorialArticleId,
    reviewed.contexts[0].sources, [...all, ...receipts(reviewed)]).map((item) => item.change), ["UNCHANGED_SOURCE", "UNCHANGED_SOURCE"]);
});

test("baseline do artigo novo nasce sem mexer no baseline dos anteriores", () => {
  const frozen = plan(intent(false, 1)), saved = receipts(frozen);
  assert.deepEqual(compareMesaArticleSourceCapture(id(500), saved[0].articleId, frozen.contexts[0].sources, saved)
    .map((item) => item.change), ["UNCHANGED_SOURCE", "UNCHANGED_SOURCE"]);
  assert.deepEqual(compareMesaArticleSourceCapture(id(500), article(1).editorialArticleId, frozen.contexts[0].sources, saved)
    .map((item) => item.change), ["UNKNOWN", "UNKNOWN"]);
});

test("produção antiga finalizada mais tarde não faz recuar a revisão", () => {
  const data = authorities();
  const newer = plan(intent(), { ...data, readAt: "2026-09-17T14:00:00.000Z", themes: [{ ...data.themes[0], sources: [source(1, 2), source(2)] }] });
  assert.equal(compareMesaArticleSourceCapture(id(500), article(1).editorialArticleId, newer.contexts[0].sources,
    [...receipts(newer), ...receipts(plan())])[0].change, "UNCHANGED_SOURCE");
});

test("duas capturas divergentes com a mesma data nunca produzem falso SEM ALTERAÇÃO", () => {
  const data = authorities(), previous = plan();
  const newer = plan(intent(), { ...data, themes: [{ ...data.themes[0], sources: [source(1, 2), source(2)] }] });
  assert.equal(compareMesaArticleSourceCapture(id(500), article(1).editorialArticleId, newer.contexts[0].sources,
    [...receipts(newer), ...receipts(previous)])[0].change, "UNKNOWN");
});

test("matriz de contagens e destinos mantém as três decisões separadas", () => {
  for (const publishedCount of [0, 1, 2, 5]) for (const review of [false, true])
    for (const fresh of [0, 1, 3]) for (const destination of ["theme", "independent", "defer"] as const) {
      const request = { ...intent(review, fresh), sources: [destination === "theme"
        ? { sourceId: id(3), destination, themeId: id(500) }
        : destination === "independent" ? { sourceId: id(3), destination, newArticleCount: 1 }
          : { sourceId: id(3), destination }] };
      const result = resolveMesaProductionIntent(request, authorities(publishedCount));
      const valid = !(review && publishedCount === 0) && (review || fresh > 0);
      assert.equal(result.ok, valid, JSON.stringify(request));
      if (!result.ok) continue;
      assert.equal(result.value.totals.reviews, review ? publishedCount : 0);
      assert.equal(result.value.totals.newArticles, fresh + Number(destination === "independent"));
      assert.equal(result.value.incorporations.length, Number(destination === "theme"));
      assert.equal(result.value.contexts.find((context) => context.kind === "theme")!.sources.length,
        2 + Number(destination === "theme"));
    }
});
