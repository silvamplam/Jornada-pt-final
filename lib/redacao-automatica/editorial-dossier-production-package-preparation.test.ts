import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  loadProductionPackage,
  ProductionPackagePreparation,
} from "../../app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_production-package-preparation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("prepara source package e texto antes de disponibilizar a cópia", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const sourcePackage = { marker: "source-package-v1" };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (calls.length === 1) return new Response(JSON.stringify({
      ok: true,
      contentUrl: "/api/pacote-v1.md",
      imagesUrl: "/api/imagens-v1.zip",
      imagesFileName: "imagens-v1.zip",
      imageSourceCount: 2,
      articleCount: 3,
      genreLabel: "Notícia",
      sourcePackage,
    }), { status: 200 });
    return new Response("TEXTO EXATO DO PACOTE V1", { status: 200 });
  }) as typeof fetch;

  const preparation = new ProductionPackagePreparation(() => loadProductionPackage("dossier-1", fetcher));
  preparation.start();
  assert.equal(preparation.snapshot().kind, "preparing");
  assert.equal(preparation.copy(async () => {}), null);
  const ready = await preparation.ensure();

  assert.equal(preparation.snapshot().kind, "ready");
  assert.equal(ready.text, "TEXTO EXATO DO PACOTE V1");
  assert.deepEqual(ready.sourcePackage.sourcePackage, sourcePackage);
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/admin/editorial/redacao-automatica/mesa/workspace",
    "/api/pacote-v1.md",
  ]);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    action: "prepare_source_package", dossierId: "dossier-1",
  });
  assert.deepEqual(calls[1].init, { cache: "no-store", credentials: "same-origin" });
});

test("o clique inicia writeText no mesmo turno, com o texto pronto e sem nova preparação", async () => {
  const events: string[] = [];
  const sourcePackage = { imagesUrl: "/api/imagens-v1.zip", imageSourceCount: 2 };
  const preparation = new ProductionPackagePreparation(async () => {
    events.push("prepare");
    return { sourcePackage, text: "PACOTE PRONTO" };
  });
  preparation.start();
  await preparation.ensure();
  events.push("click");
  const write = preparation.copy((text) => {
    events.push(`writeText:${text}`);
    return Promise.resolve();
  });
  events.push("after-click");
  await write;

  assert.deepEqual(events, ["prepare", "click", "writeText:PACOTE PRONTO", "after-click"]);
  assert.strictEqual(preparation.ready()?.sourcePackage, sourcePackage,
    "o download usa o mesmo manifesto já preparado");
});

test("uma mudança de versão descarta imediatamente o texto antigo e ignora a resposta atrasada", async () => {
  const oldLoad = deferred<{ sourcePackage: string; text: string }>();
  const oldVersion = new ProductionPackagePreparation(() => oldLoad.promise);
  oldVersion.start();
  const oldPending = oldVersion.ensure();
  oldVersion.invalidate();
  assert.equal(oldVersion.ready(), null);
  assert.equal(oldVersion.copy(async () => {}), null);

  const newVersion = new ProductionPackagePreparation(async () => ({
    sourcePackage: "package-v2", text: "TEXTO V2",
  }));
  newVersion.start();
  await newVersion.ensure();
  oldLoad.resolve({ sourcePackage: "package-v1", text: "TEXTO V1" });
  await assert.rejects(oldPending, /package_stale/);
  assert.equal(oldVersion.copy(async () => {}), null);
  const copied: string[] = [];
  await newVersion.copy(async (text) => { copied.push(text); });
  assert.deepEqual(copied, ["TEXTO V2"]);
});

test("a falha bloqueia a cópia; só o retry explícito recupera", async () => {
  let attempts = 0;
  const preparation = new ProductionPackagePreparation(async () => {
    attempts += 1;
    if (attempts === 2) throw new Error("Falha ao obter o texto");
    return { sourcePackage: `package-${attempts}`, text: `TEXTO ${attempts}` };
  });
  preparation.start();
  await preparation.ensure();
  preparation.invalidate();
  preparation.start();
  await assert.rejects(preparation.ensure(), /Falha ao obter o texto/);
  assert.deepEqual(preparation.snapshot(), { kind: "error", message: "Falha ao obter o texto" });
  assert.equal(preparation.copy(async () => {}), null);
  assert.equal(preparation.ready(), null);
  await assert.rejects(preparation.ensure(), /Falha ao obter o texto/);
  assert.equal(attempts, 2, "a falha não inicia tentativas automáticas");

  preparation.retry();
  const ready = await preparation.ensure();
  assert.equal(attempts, 3);
  assert.equal(ready.text, "TEXTO 3");
});

test("o componente liga a pré-preparação, a invalidação e o fallback do clipboard ao botão", () => {
  const client = readFileSync(join(process.cwd(),
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx"), "utf8");
  const clipboard = readFileSync(join(process.cwd(),
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_clipboard-copy.ts"), "utf8");
  const copyHandler = client.split("async function copyPackage() {")[1]?.split("function downloadImages() {")[0];
  const downloadHandler = client.split("function downloadImages() {")[1]?.split("async function importText(")[0];
  assert.ok(copyHandler);
  assert.ok(downloadHandler);
  assert.match(client, /if \(!disabled\) preparation\.start\(\)/);
  assert.match(client, /\[dossierId, packageVersion, disabled\]/);
  assert.match(client, /key=\{packageVersion\}/);
  assert.match(client, /preparation\.invalidate\(\)/);
  assert.match(client, /disabled=\{disabled \|\| preparationState\.kind !== "ready"\}/);
  assert.match(client, /A preparar pacote…/);
  assert.match(client, /preparation\.retry\(\)/);
  assert.match(clipboard, /document\.execCommand\("copy"\)/);
  assert.match(clipboard, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(copyHandler, /const write = preparation\.copy\(copyText\);\s*if \(!write\) return;\s*await write/);
  assert.doesNotMatch(copyHandler, /fetch\(|loadProductionPackage\(|preparation\.ensure\(/);
  assert.match(downloadHandler, /preparation\.ready\(\)\?\.sourcePackage/);
  assert.doesNotMatch(downloadHandler, /fetch\(|loadProductionPackage\(/);
});
