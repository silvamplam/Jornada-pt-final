import assert from "node:assert/strict";
import test from "node:test";
import { mesaPackageUsage, recoverMesaPackageGroups, mergeMesaSourceRefs, mesaSelectedSources,
  isMesaMaterialKey, isMesaMaterialRef, type MesaMaterialRef } from "./newsroom-mesa-editorial-groups";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = (n: number) => ({ newsroomArticleId: id(n), newsroomSnapshotId: id(n + 100) });
const entry = (n: number, articlePosition: number) => ({ ...source(n), articlePosition, position: n, status: "prepared", title: `Assunto ${articlePosition}` });
const output = (position: number, sourceArticlePosition: number, published = true) => ({ position, sourceArticlePosition, publishedArticleId: id(position + 200), usedAt: published ? "2026-09-11T12:00:00Z" : null });
const manifest = { packageId: id(900), year: "2026", month: "09", entries: [entry(1, 1), entry(2, 1), entry(3, 2)], outputs: [output(1, 1), output(2, 1), output(3, 2)] };
const published = new Set([id(201), id(202), id(203)]);
test("um lote de assuntos diferentes recupera dois grupos, nunca um Dossiê global", () => {
  const groups = recoverMesaPackageGroups(manifest, published);
  assert.equal(groups.length, 2); assert.deepEqual(groups.map((g) => g.sources.length), [2, 1]);
  assert.equal(groups[0].key, `package:${id(900)}:1`); assert.deepEqual(groups[0].articleIds, [id(201), id(202)]);
});
test("uma fonte com três saídas continua a ser uma fonte distinta", () => {
  const groups = recoverMesaPackageGroups({ ...manifest, entries: [entry(1, 1)], outputs: [1, 2, 3].map((n) => output(n, 1)) }, published);
  assert.equal(groups[0].sources.length, 1); assert.equal(groups[0].articleIds.length, 3);
});
test("duas fontes com uma só saída formam um Dossiê", () => {
  const groups = recoverMesaPackageGroups({ ...manifest, entries: [entry(1, 1), entry(2, 1)], outputs: [output(1, 1)] }, published);
  assert.equal(groups[0].sources.length, 2); assert.equal(groups[0].articleIds.length, 1);
});
test("snapshots repetidos não contam como novas fontes", () => {
  assert.equal(recoverMesaPackageGroups({ ...manifest, entries: [entry(1, 1), entry(1, 1)] }, published)[0].sources.length, 1);
});
test("revisões da mesma fonte no mesmo grupo usam a última posição e conservam todos os artigos", () => {
  const first = { ...entry(1, 1), position: 1, newsroomSnapshotId: id(101) };
  const latest = { ...entry(1, 1), position: 31, newsroomSnapshotId: id(999) };
  const groups = recoverMesaPackageGroups({ ...manifest, entries: [first, entry(2, 1), latest], outputs: [output(1, 1), output(2, 1)] }, published);
  assert.equal(groups[0].sources.length, 2);
  assert.deepEqual(groups[0].sources.find((ref) => ref.newsroomArticleId === id(1)), { newsroomArticleId: id(1), newsroomSnapshotId: id(999) });
  assert.deepEqual(groups[0].articleIds, [id(201), id(202)]);
  const usages = mesaPackageUsage({ ...manifest, entries: [first, latest], outputs: [output(1, 1)] });
  assert.equal(usages[0].newsroomSnapshotId, id(999));
});
test("posição editorial igual com snapshots diferentes continua a bloquear por ambiguidade", () => {
  const first = { ...entry(1, 1), position: 3, newsroomSnapshotId: id(101) };
  const other = { ...entry(1, 1), position: 3, newsroomSnapshotId: id(999) };
  assert.throws(() => recoverMesaPackageGroups({ ...manifest, entries: [first, other], outputs: [output(1, 1)] }, published), /version-conflict/);
});
test("publicação só no manifesto sem prova canónica não é publicação", () => {
  assert.deepEqual(recoverMesaPackageGroups(manifest, new Set()), []);
  assert.deepEqual(mesaPackageUsage({ ...manifest, outputs: [output(1, 1, false)] }), []);
});
test("grupo documental único de Mesa v2 nunca recupera um Dossiê editorial", () => {
  const mesaV2 = {
    ...manifest,
    version: 5,
    provenanceContract: "mesa-v2",
    entries: [entry(1, 1), entry(2, 1), entry(3, 1)],
    outputs: [output(1, 1), output(2, 1)],
  };
  assert.deepEqual(mesaPackageUsage(mesaV2), []);
  assert.deepEqual(recoverMesaPackageGroups(mesaV2, published), []);
});
test("v2 sem outputs recupera o grupo persistido por articlePosition", () => {
  const group = recoverMesaPackageGroups({ ...manifest, outputs: undefined, entries: [1, 2].map((n) => ({ ...entry(n, 5), usedAt: "2026-09-11", publishedArticleId: id(201) })) }, published);
  assert.equal(group[0].key, `package:${id(900)}:5`); assert.equal(group[0].sources.length, 2);
});
test("fontes de grupos diferentes não se juntam por coincidência do artigo publicado", () => {
  const groups = recoverMesaPackageGroups({ ...manifest, outputs: [output(1, 1), output(1, 2)] }, published);
  assert.equal(groups.length, 2);
});
test("registo failed não é tratado como fonte utilizada", () => {
  const groups = recoverMesaPackageGroups({ ...manifest, entries: [entry(1, 1), { ...entry(2, 1), status: "failed" }] }, published);
  assert.equal(groups[0].sources.length, 1);
});
test("chave inválida ou pacote inteiro não podem ser selecionados como Dossiê", () => {
  for (const key of [`package:${id(900)}`, `package:${id(900)}:0`, `package:${id(900)}:31`, `dossier:${id(1)}:`, "../../x"])
    assert.equal(isMesaMaterialKey(key), false, key);
  assert.equal(isMesaMaterialKey(`package:${id(900)}:30`), true);
});
test("não aceita Dossiê de fonte única nem fontes duplicadas na seleção", () => {
  assert.equal(isMesaMaterialRef({ key: `dossier:${id(10)}`, versionId: null, sources: [source(1)] }), false);
  assert.equal(isMesaMaterialRef({ key: `dossier:${id(10)}`, versionId: null, sources: [source(1), source(1)] }), false);
});
test("fontes novas mais Dossiês completos deduplicam sem absorver outro Tema", () => {
  const material: MesaMaterialRef = { key: `dossier:${id(10)}`, versionId: null, sources: [source(1), source(2)] };
  const other = { ...material, key: `dossier:${id(11)}`, sources: [source(1), source(4)] };
  assert.deepEqual(mesaSelectedSources([source(2), source(3)], [material]), [source(1), source(2), source(3)]);
  assert.deepEqual(other.sources, [source(1), source(4)]);
});
test("conflito de snapshots bloqueia a preparação, não escolhe silenciosamente", () => {
  assert.throws(() => mergeMesaSourceRefs([[source(1)], [{ ...source(1), newsroomSnapshotId: id(999) }]]), /version-conflict/);
});
test("IDs são normalizados e a ordem de entrada não muda a identidade das fontes", () => {
  assert.deepEqual(mergeMesaSourceRefs([[source(2), source(1)]]), [source(1), source(2)]);
});
