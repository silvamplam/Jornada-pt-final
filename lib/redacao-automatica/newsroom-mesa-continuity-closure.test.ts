import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_MESA_PREPARATION_BUFFER, selectMesaMaterial, selectMesaPublishedArticle, mesaExplicitArticleIds,
  observeMesaMaterial, readMesaPreparationBuffer, writeMesaPreparationBuffer, type MesaMaterialSelection
} from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";
import { historicalTargetsForBatch, historicalDecisionGroups, applyHistoricalDecisionGroups,
  editorialBatchHistoricalChoiceIdentity, readPendingHistoricalDecisions, type HistoricalDecisionGroup
} from "./editorial-batch-historical-decision";
import { readMesaWithTransientRetry } from "./newsroom-mesa-read-retry";
import { createMesaPageReadModel, MesaPageRelationInvalidError } from "./newsroom-mesa-page-read-model-internal";
import type { EditorialBatchArticle } from "./editorial-batch-parser";
const id = (n: number) => "10000000-0000-4000-8000-" + String(n).padStart(12, "0");
const material: MesaMaterialSelection = { kind: "source", lifecycle: "published", newsroomArticleId: id(1),
  newsroomSnapshotId: id(2), classificationKey: "benfica", title: "Fonte publicada", sourceLabel: "Fonte", imageUrl: null };
const article = (n: number): EditorialBatchArticle => ({ index: n, key: String(n), outputId: id(n + 10),
  sourceIds: [], label: "Artigo", title: "Artigo " + n, subtitle: "Subtítulo", body: "Corpo" });
const first = article(1), second = article(2);
const slots = [first, second].map((a, i) => ({ outputId: a.outputId!, kind: "existing" as const,
  targetEditorialArticleId: id(101 + i), targetMatchdayId: id(201 + i) }));
const completed = [first, second].map((a, i) => ({ key: a.key, outputId: a.outputId, articleId: id(101 + i), status: "published" as const }));
const choices = Object.fromEntries([first, second].map((a) => [editorialBatchHistoricalChoiceIdentity(a), true]));

test("seleção da fonte não infere artigos; escolhas individuais sobrevivem a storage e snapshots novos", () => {
  const sourceOnly = selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER, material, () => id(50));
  assert.deepEqual(mesaExplicitArticleIds(sourceOnly), []);
  let selection = selectMesaPublishedArticle(sourceOnly, material, id(101), true, () => id(51));
  selection = selectMesaPublishedArticle(selection, material, id(102), true, () => id(52));
  selection = selectMesaPublishedArticle(selection, material, id(101), false, () => id(53));
  selection = observeMesaMaterial(selection, { ...material, newsroomSnapshotId: id(3) });
  selection = readMesaPreparationBuffer(writeMesaPreparationBuffer(selection));
  assert.deepEqual(mesaExplicitArticleIds(selection), [id(102)]);
  assert.equal(selection.sources[0].newsroomSnapshotId, id(2));
  selection = selectMesaMaterial(selection, { ...material, newsroomSnapshotId: id(3) }, () => id(54));
  assert.deepEqual(mesaExplicitArticleIds(selection), [id(102)]);
});

test("o mesmo artigo em várias fontes tem uma escolha canónica, removível a partir de qualquer linha", () => {
  const otherSource = { ...material, newsroomArticleId: id(4), newsroomSnapshotId: id(5) };
  let selection = selectMesaPublishedArticle(EMPTY_MESA_PREPARATION_BUFFER, material, id(101), true, () => id(51));
  selection = selectMesaPublishedArticle(selection, otherSource, id(101), true, () => id(52));
  assert.deepEqual(mesaExplicitArticleIds(selection), [id(101)]);
  selection = selectMesaPublishedArticle(selection, otherSource, id(101), false, () => id(53));
  assert.deepEqual(mesaExplicitArticleIds(selection), []);
  assert.equal(selection.sources.length, 2);
});

test("C: UPDATE com 0 NEW usa a Jornada congelada mesmo com seletor vazio", () => {
  const targets = historicalTargetsForBatch([first], slots, "");
  assert.deepEqual(historicalDecisionGroups([first], choices, completed, targets), [
    { matchdayId: id(201), articleIds: [id(101)], decision: "selected" },
  ]);
});

test("D: dois UPDATEs agrupam por Jornada; NEW usa a Jornada escolhida", () => {
  const fresh = article(3);
  const targets = historicalTargetsForBatch([first, second, fresh], slots, id(299));
  const groups = historicalDecisionGroups([first, second, fresh], { ...choices, [editorialBatchHistoricalChoiceIdentity(fresh)]: true },
    [...completed, { key: fresh.key, outputId: fresh.outputId, articleId: id(103), status: "published" }], targets);
  assert.deepEqual(groups.map((g) => g.matchdayId), [id(201), id(202), id(299)]);
  assert.deepEqual(groups.flatMap((g) => g.articleIds), [id(101), id(102), id(103)]);
});

test("target sem Jornada não usa o seletor NEW e nunca envia uma falsa decisão", () => {
  const targets = historicalTargetsForBatch([first], [{ ...slots[0], targetMatchdayId: null }], id(299));
  assert.equal(targets[editorialBatchHistoricalChoiceIdentity(first)].matchdayId, null);
  assert.throws(() => historicalDecisionGroups([first], choices, completed, targets), /Jornada válida/);
});

test("E: falha da segunda Jornada guarda apenas a pendência; retry/refresh não publicam artigos", async () => {
  const groups = historicalDecisionGroups([first, second], choices, completed, historicalTargetsForBatch([first, second], slots, ""));
  let pending: readonly HistoricalDecisionGroup[] = [];
  const calls: string[] = [];
  let fail = true;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/admin/editorial/composicao");
    const body = init!.body as FormData;
    assert.equal(body.get("action_type"), "set_historical_article_decision");
    const matchday = String(body.get("matchday_id")); calls.push(matchday);
    if (fail && matchday === id(202)) return Response.json({ ok: false, message: "Falha transitória" }, { status: 503 });
    return Response.json({ ok: true, updatedCount: 1 });
  };
  await assert.rejects(applyHistoricalDecisionGroups(groups, (value) => { pending = value; }, fetcher), /Falha transitória/);
  assert.deepEqual(pending, [groups[1]]);
  const restored = readPendingHistoricalDecisions(JSON.stringify({ fingerprint: "lote", complete: true, groups: pending }));
  assert.ok(restored); fail = false;
  await applyHistoricalDecisionGroups(restored.groups, (value) => { pending = value; }, fetcher);
  assert.deepEqual(calls, [id(201), id(202), id(202)]);
  assert.deepEqual(pending, []);
});

test("desmarcar uma decisão persistida grava undecided na mesma Jornada", () => {
  const groups = historicalDecisionGroups([first], { [editorialBatchHistoricalChoiceIdentity(first)]: false }, completed,
    historicalTargetsForBatch([first], slots, ""));
  assert.equal(groups[0].decision, "undecided");
});

test("F: primeiro carregamento após publicação recupera um timeout conhecido, com uma única pausa curta", async () => {
  const group = { total: 0, benfica: 0, sporting: 0, fc_porto: 0, other_liga_clubs: 0, outside_liga_other: 0, unclassified: 0 };
  const counts = { novas: { ...group, total: 33, benfica: 33 }, publicadas: group };
  let reads = 0; const waits: number[] = []; const events: unknown[] = [];
  const load = createMesaPageReadModel({ isConfigured: () => true,
    readCounts: () => readMesaWithTransientRetry("rpc/newsroom_mesa_source_counts_v1", async () => {
      if (++reads === 1) throw new Error(JSON.stringify({ code: "57014", message: "statement timeout" }));
      return counts;
    }, { wait: async (ms) => { waits.push(ms); }, report: (event) => events.push(event) }),
    readPageIdentities: async () => [], hydrateSources: async () => [],
  });
  const result = await load({ lifecycle: "new", classification: { mode: "all" }, sourceCode: null, pagination: { limit: 50, offset: 0 } });
  assert.ok(result.ok); assert.equal(result.value.counts.novas.total, 33);
  assert.equal(reads, 2); assert.deepEqual(waits, [250]); assert.equal(events.length, 1);
});

test("erros estruturais e relação inválida não são repetidos nem convertidos em coleção vazia", async () => {
  for (const error of [new MesaPageRelationInvalidError(), new Error('{"code":"42P01"}'), new Error("unknown")]) {
    let reads = 0;
    await assert.rejects(readMesaWithTransientRetry("read", async () => { reads++; throw error; }, {
      wait: async () => { assert.fail("must not retry"); }, report: () => {},
    })); assert.equal(reads, 1);
  }
  let reads = 0;
  await assert.rejects(readMesaWithTransientRetry("read", async () => { reads++; throw new Error('{"code":"57014"}'); }, {
    wait: async () => {}, report: () => {},
  })); assert.equal(reads, 2);
});
