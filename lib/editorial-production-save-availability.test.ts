import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import type { ReactElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { editorialImageOriginalPath } from "./editorial-image-authority";
import {
  createProductionImagePreparer, productionImageError, productionSaveDisabled,
} from "./editorial-production-image-choice";

const clientPath = "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx";
const client = readFileSync(clientPath, "utf8");
const hookPath = clientPath.replace("_workspace-client.tsx", "_production-image-preparation.ts");
const origin = "https://production.test";
const localImage = `${origin}/storage/v1/object/public/editorial-images/editorial/sha256/${"a".repeat(64)}.jpg`;
const cards = [{ key: "article-a" }, { key: "article-b" }];

function execute(source: string, globals: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    fileName: "production-save-test.tsx",
  }).outputText, { exports, Error, ...globals });
  return exports;
}

// Drive the existing hook with deferred requests and isolated hook state.
// There is no browser, network, Storage or database access in these tests.
function preparation() {
  const state: unknown[] = [];
  const effects: (() => void)[] = [];
  let cursor = 0;
  let mounted = false;
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const request = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  const dependencies: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const index = cursor++;
        if (index === state.length) state.push(initial);
        return [state[index], (value: unknown) => {
          state[index] = typeof value === "function" ? value(state[index]) : value;
        }];
      },
      useEffect(effect: () => void) { if (!mounted) effects.push(effect); },
    },
    "@/lib/editorial-image-authority": {
      editorialImageOriginalPath: (url: string) => editorialImageOriginalPath(url, origin),
    },
    "@/lib/editorial-production-image-choice": { createProductionImagePreparer, productionImageError },
  };
  const module = execute(readFileSync(hookPath, "utf8"), {
    fetch: () => request,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  const hook = module.useProductionImagePreparation as (
    dossierId: string, image: { id: string; frozenUrl: string }, enabled: boolean,
  ) => { busy: boolean; error: string };
  function read() {
    cursor = 0;
    return hook("dossier", { id: "image", frozenUrl: "https://source.test/image.jpg" }, true);
  }
  read();
  mounted = true;
  effects.forEach(effect => effect());
  return {
    read,
    async ready() {
      resolve(Response.json({ ok: true, image: { publicUrl: localImage, decisionKey: "prepared", sha256: "a".repeat(64) } }));
      await setImmediate();
      return read();
    },
    async fail() {
      reject(new Error("image-download-failed"));
      await setImmediate();
      return read();
    },
  };
}

const buttonSource = client.match(/<button className=\{styles\.primaryAction\} type="submit" form=\{PRODUCTION_FORM_ID\}[\s\S]*?<\/button>/)?.[0];
assert.ok(buttonSource);
const button = execute(`exports.render = (saveDisabled) => (${buttonSource});`, {
  styles: { primaryAction: "primaryAction" }, PRODUCTION_FORM_ID: "production",
  require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
}).render as (disabled: boolean) => ReactElement;

function assertButton(saving: boolean, busy: Readonly<Record<string, boolean>>, disabled: boolean) {
  const html = renderToStaticMarkup(button(productionSaveDisabled(saving, cards, busy)));
  assert.equal(html.includes('disabled=""'), disabled);
  assert.equal(html.replace(/<[^>]+>/g, "").trim(), "Guardar artigos e imagens");
}

test("uma imagem pending desativa o botão sem alterar o texto", () => {
  const image = preparation();
  assert.equal(image.read().busy, true);
  assertButton(false, { "article-a": image.read().busy }, true);
  assert.match(client, /onImagePreparationChange\(cardKey, preparation\.busy\)/);
  assert.match(client, /\[cardKey, preparation\.busy, onImagePreparationChange\]/);
  assert.match(client, /onImagePreparationChange=\{handleImagePreparationChange\}/);
  assert.match(client, /saveDisabled=\{productionSaveDisabled\(savingProduction, visibleCards, imagePreparationByCard\)\}/);
});

test("várias imagens pending mantêm o botão desativado; artigos ocultos não bloqueiam", () => {
  const first = preparation(), second = preparation();
  assertButton(false, { "article-a": first.read().busy, "article-b": second.read().busy }, true);
  assertButton(false, { "hidden-article": true }, false);
});

test("a última preparação ready reativa automaticamente o botão", async () => {
  const first = preparation(), second = preparation();
  const firstReady = await first.ready();
  assert.equal(firstReady.busy, false);
  assertButton(false, { "article-a": firstReady.busy, "article-b": second.read().busy }, true);
  const secondReady = await second.ready();
  assert.equal(secondReady.busy, false);
  assertButton(false, { "article-a": firstReady.busy, "article-b": secondReady.busy }, false);
});

test("erro termina preparing e não deixa o botão bloqueado", async () => {
  const first = preparation(), second = preparation();
  const failed = await first.fail();
  assert.equal(failed.busy, false);
  assert.ok(failed.error);
  assertButton(false, { "article-a": failed.busy, "article-b": second.read().busy }, true);
  assertButton(false, { "article-a": failed.busy, "article-b": (await second.ready()).busy }, false);
});

test("savingProduction mantém o botão desativado com o mesmo texto", () => {
  assertButton(true, { "article-a": false, "article-b": false }, true);
  assertButton(true, { "article-a": true }, true);
  assertButton(false, { "article-a": false, "article-b": false }, false);
});

test("submit forçado durante preparação continua recusado antes de qualquer save", async () => {
  const ast = ts.createSourceFile(clientPath, client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function findSave(node: ts.Node): ts.FunctionDeclaration | undefined {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "saveProduction") return node;
    return ts.forEachChild(node, findSave);
  }
  const save = findSave(ast);
  assert.ok(save);
  let message = "", prevented = false, writes = 0;
  const module = execute(`${save.getText(ast)}\nexports.save = saveProduction;`, {
    savingProductionRef: { current: false }, effectiveOutputCount: 2, MAX_OUTPUT_COUNT: 30,
    visibleCards: cards, planField: (key: string, name: string) => `${key}:${name}`,
    FormData: class { get(name: string) { return name === "article-b:image_preparing" ? "true" : "false"; } },
    setProductionMessage: (value: string) => { message = value; },
    fetch: () => { writes++; throw new Error("Save must not be attempted"); },
  });
  await (module.save as (event: unknown) => Promise<void>)({ preventDefault() { prevented = true; }, currentTarget: {} });
  assert.equal(prevented, true);
  assert.match(message, /As imagens ainda estão a ser preparadas/);
  assert.equal(writes, 0);
  assert.match(client, /name=\{planField\(cardKey, "image_preparing"\)\} value=\{preparation\.busy \? "true" : "false"\}/);
});
