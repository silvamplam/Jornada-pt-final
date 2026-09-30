import assert from "node:assert/strict";
import test from "node:test";
import { createBatchImagePreparer, createBatchImageSelector, type BatchImagePreparation } from "./editorial-batch-image-preparation";
import { editorialBatchDossierImages, editorialBatchImageChoicesReady, editorialBatchInitialImageChoice, editorialBatchOutputImage, withEditorialBatchOutputImageChoice } from "./editorial-batch-image-selection";
import { parseEditorialBatchTransferSourcePackage, type EditorialBatchTransferSourcePackage } from "./editorial-batch-transfer";

const origin = "https://local-project.supabase.co";
const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const local = (n: number) => `${origin}/storage/v1/object/public/editorial-images/editorial/sha256/${n.toString(16).padStart(64, "0")}.jpg`;
const choice = (n: number) => `dossier_image:${id(n)}`;
function fixture(): EditorialBatchTransferSourcePackage {
  return {
    year: "2026", month: "09", packageId: id(1), dossierId: id(2),
    batchContract: { manifestVersion: 5, provenanceContract: "mesa-v2", workspaceContractVersion: 2,
      outputIds: [id(10), id(11)], sourceIds: [id(20), id(21)], sourceIdsByOutput: { [id(10)]: [id(20)], [id(11)]: [id(21)] } },
    dossierImages: [30, 31, 32].map(n => ({ id: id(n), imageUrl: n === 32 ? "https://source.example/external.jpg" : local(n), label: `Imagem ${n}`, newsroomArticleId: id(n === 30 ? 20 : 21) })),
    outputImages: [10, 11].map((n, i) => ({ position: i + 1, outputId: id(n), dossierImageId: id(n + 20), imageUrl: local(n + 20), label: `Imagem ${n + 20}` })),
  };
}
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(prepare: Parameters<typeof createBatchImageSelector>[0]["prepare"] = async () => local(32)) {
  let source: EditorialBatchTransferSourcePackage = fixture();
  let saved = "";
  const states = new Map<string, BatchImagePreparation>();
  const selector = createBatchImageSelector({ origin, read: () => source,
    write(next) { source = next; saved = JSON.stringify(next); },
    state(output, state) { if (state) states.set(output, state); else states.delete(output); }, prepare });
  return { selector, states, read: () => source, write: (next: EditorialBatchTransferSourcePackage) => { source = next; },
    reload: () => parseEditorialBatchTransferSourcePackage(saved)!, url: (output: number) => editorialBatchOutputImage(source, id(output))?.imageUrl };
}
const articles = [10, 11].map((n, index) => ({ outputId: id(n), index: index + 1 }));

test("A–E: original, cruzada, partilhada e independente; locais nunca fazem preparação", async () => {
  const f = setup(async () => { throw Error("não deve preparar local"); });
  await f.selector.select(id(10), choice(30)); assert.equal(f.url(10), local(30));
  await f.selector.select(id(10), choice(31)); assert.equal(f.url(10), local(31));
  assert.equal(f.url(11), local(31)); // same image, no exclusivity
  await f.selector.select(id(11), choice(30)); assert.equal(f.url(10), local(31));
  assert.equal(f.url(11), local(30));
  assert.equal(editorialBatchDossierImages(f.read()).length, 3);
  assert.equal(editorialBatchImageChoicesReady(f.read(), articles, origin), true);
  assert.equal(f.read().dossierImages?.find(image => image.id === id(31))?.newsroomArticleId, id(21));
});

test("F/G: duas escolhas externas simultâneas partilham uma aquisição; sucesso sincroniza banco, outputs e reload", async () => {
  const done = deferred(); let calls = 0;
  const f = setup(async () => { calls++; return done.promise; });
  const a = f.selector.select(id(10), choice(32));
  const b = f.selector.select(id(11), choice(32));
  await f.selector.select(id(10), choice(999)); // A missing option must not cancel the valid pending choice.
  assert.equal(calls, 1); assert.equal(f.selector.isPreparing([id(10), id(11)]), true);
  assert.equal(f.url(10), local(30)); assert.equal(f.url(11), local(31));
  done.resolve(local(32)); await Promise.all([a, b]);
  assert.equal(f.selector.isPreparing([id(10), id(11)]), false);
  assert.equal(f.url(10), local(32)); assert.equal(f.url(11), local(32));
  assert.equal(f.read().dossierImages?.[2].imageUrl, local(32));
  assert.equal(editorialBatchInitialImageChoice(f.reload(), id(11), false), choice(32));
  await f.selector.select(id(10), choice(30)); await f.selector.select(id(10), choice(32));
  assert.equal(calls, 1);
});

test("H/I: falha conserva a escolha válida; não bloqueia eternamente e retry fica pronto", async () => {
  let attempt = 0;
  const f = setup(async (_image, retry) => { attempt++; if (attempt === 1) throw Error("preview-failed"); assert.equal(retry, true); return local(32); });
  await f.selector.select(id(10), choice(32));
  assert.equal(f.url(10), local(30)); assert.equal(f.states.get(id(10))?.status, "error");
  assert.equal(f.selector.isPreparing([id(10)]), false);
  assert.equal(editorialBatchImageChoicesReady(f.read(), articles, origin), true);
  await f.selector.select(id(10), choice(32)); assert.equal(f.url(10), local(32)); assert.equal(f.states.size, 0);
});

test("H: falha sem recurso local prévio nunca permite preflight de URL externa", async () => {
  const f = setup(async () => { throw Error("failed"); });
  f.write(withEditorialBatchOutputImageChoice(f.read(), id(10), id(32)));
  await f.selector.select(id(10), choice(32));
  assert.equal(editorialBatchImageChoicesReady(f.read(), articles, origin), false);
});

test("J: resposta tardia, erro tardio e escolha Sem imagem nunca anulam o último gesto", async () => {
  for (const fail of [false, true]) {
    const done = deferred(); const f = setup(() => done.promise);
    const old = f.selector.select(id(10), choice(32));
    await f.selector.select(id(10), choice(31));
    if (fail) done.reject(Error("failed")); else done.resolve(local(32));
    await old; assert.equal(f.url(10), local(31)); assert.equal(f.states.size, 0);
  }
  const done = deferred(); const f = setup(() => done.promise);
  const old = f.selector.select(id(10), choice(32));
  await f.selector.select(id(10), "unselected"); done.resolve(local(32)); await old;
  assert.equal(f.url(10), undefined);
});

test("K/L: preserve_published retira só o override; qualquer imagem local substitui-o", async () => {
  const f = setup(); await f.selector.select(id(10), "preserve_published");
  assert.equal(editorialBatchInitialImageChoice(f.read(), id(10), true), "preserve_published");
  assert.equal(f.url(11), local(31));
  await f.selector.select(id(10), choice(31)); assert.equal(f.url(10), local(31));
});

test("M/N: upload entra no banco de todos; escolha sobrevive ao contrato serializado", async () => {
  const f = setup(); f.write({ ...f.read(), dossierImages: [...f.read().dossierImages!, { id: id(33), imageUrl: local(33), label: "UPLOAD" }] });
  for (const output of [10, 11]) await f.selector.select(id(output), choice(33));
  const reloaded = f.reload(); assert.ok(reloaded);
  assert.equal(reloaded.dossierImages?.length, 4);
  assert.deepEqual(reloaded.outputImages?.map(image => image.imageUrl), [local(33), local(33)]);
});

test("legacy: trocar imagem conserva o banco e não transforma um outputId num dossierImageId", async () => {
  const f = setup(async image => { assert.equal(image.dossierImageId, null); return local(32); });
  const initial = fixture();
  f.write({ ...initial, dossierImages: undefined, outputImages: initial.outputImages?.map(image => ({ ...image, dossierImageId: undefined,
    imageUrl: image.position === 2 ? "https://source.example/legacy.jpg" : image.imageUrl })) });
  await f.selector.select(id(10), "unselected");
  assert.equal(editorialBatchDossierImages(f.read()).length, 2);
  f.write(f.reload());
  assert.equal(f.read().dossierImages?.[1].freezeDossierImageId, null);
  await f.selector.select(id(10), `dossier_image:${id(11)}`); assert.equal(f.url(10), local(32));
  assert.equal(f.url(11), local(32));
});

test("SEM_ALTERAÇÃO sem artigos não materializa nem valida imagens inexistentes", () => {
  assert.equal(editorialBatchImageChoicesReady(fixture(), [], origin), true);
});

function transportFixture(results: { status?: number; body: unknown }[]) {
  const calls: Record<string, unknown>[] = []; const storage = new Map<string, string>(); let sequence = 0;
  const transport = { origin, uuid: () => id(700 + sequence++),
    storage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } },
    fetch: (async (_url, init) => {
      calls.push(JSON.parse(String(init?.body))); const next = results.shift(); assert.ok(next);
      return Response.json(next.body, { status: next.status ?? 200 });
    }) as typeof fetch,
  };
  return { transport, calls, storage };
}
const external = { id: id(32), imageUrl: "https://source.example/external.jpg", dossierId: id(2), dossierImageId: id(32) };
const ready = { body: { ok: true, image: { publicUrl: local(32) } } };

test("clique externo pede confirmação explícita ao freeze existente; local zero fetch/decisão", async () => {
  const f = transportFixture([ready]); const prepare = createBatchImagePreparer(f.transport);
  assert.equal(await prepare({ ...external, imageUrl: local(32) }, false), local(32));
  assert.equal(f.calls.length, 0); assert.equal(f.storage.size, 0);
  assert.equal(await prepare(external, false), local(32));
  assert.deepEqual(f.calls[0], { select: true, confirm: true, sourceUrl: external.imageUrl, dossierId: id(2), dossierImageId: id(32) });
});

test("retry de preview/confirm reutiliza decisão legacy inclusive após navegação", async () => {
  const f = transportFixture([{ status: 422, body: { error: "image-previews-incomplete" } }, ready]);
  await assert.rejects(createBatchImagePreparer(f.transport)({ ...external, dossierImageId: null }, false));
  await createBatchImagePreparer(f.transport)({ ...external, dossierImageId: null }, true);
  assert.equal(f.calls[0].decisionKey, f.calls[1].decisionKey);
});

test("seleção com dossierImageId transporta a decisão já adquirida pelo painel antigo", async () => {
  const f = transportFixture([ready]);
  f.storage.set(`jornada:image-decision:${id(32)}`, id(800));
  await createBatchImagePreparer(f.transport)(external, false);
  assert.equal(f.calls[0].decisionKey, id(800));
  assert.equal(f.calls[0].confirm, true);
});

test("retry só inicia revisão quando servidor confirma aquisição sem bytes duráveis", async () => {
  const f = transportFixture([{ status: 422, body: { error: "image-acquisition-incomplete" } }, ready]);
  await createBatchImagePreparer(f.transport)(external, true);
  assert.equal(f.calls[0].revisionKey, undefined); assert.equal(f.calls[1].revisionKey, id(700));
  const normal = transportFixture([{ status: 422, body: { error: "image-acquisition-incomplete" } }]);
  await assert.rejects(createBatchImagePreparer(normal.transport)(external, false)); assert.equal(normal.calls.length, 1);
});

test("resposta incompleta/externa nunca é aceite como imagem preparada", async () => {
  const f = transportFixture([{ body: { ok: true, image: { publicUrl: external.imageUrl } } }]);
  await assert.rejects(createBatchImagePreparer(f.transport)(external, false));
});
