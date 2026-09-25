import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const deskPath = "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx";
const pagePath = "app/admin/editorial/composicao/[matchdayId]/page.tsx";
const batchPath = "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx";
const newsroomPath = "app/admin/editorial/redacao-automatica/mesa/";
const productionPath = newsroomPath + "producao/[dossierId]/_workspace-client.tsx";
const sharedPath = "app/admin/editorial/redacao-automatica/";

function source(path: string) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

type ImageNode = ts.JsxSelfClosingElement | ts.JsxOpeningElement;

function images(path: string) {
  const file = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result: ImageNode[] = [];
  function visit(node: ts.Node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
      && node.tagName.getText(file) === "img") result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}

function attribute(image: ImageNode, name: string) {
  const attr = image.attributes.properties.find(
    (prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText() === name,
  );
  return attr?.initializer?.getText();
}

function assertLazy(image: ImageNode, asyncDecode = false) {
  assert.equal(attribute(image, "loading"), '"lazy"');
  if (asyncDecode) assert.equal(attribute(image, "decoding"), '"async"');
}

const deskImages = images(deskPath);
const pageImages = images(pagePath);
const batchImages = images(batchPath);

test("composition cards defer their original image without changing the source", () => {
  assert.equal(deskImages.length, 3);
  assert.equal(attribute(deskImages[0], "src"), "{article.imageUrl}");
  assertLazy(deskImages[0], true);
});

test("the long composition bank defers its images", () => {
  assert.equal(attribute(deskImages[1], "src"), "{article.imageUrl}");
  assertLazy(deskImages[1], true);
});

test("inherited images remain lazy inside the initially closed details", () => {
  const image = deskImages[2];
  assert.equal(attribute(image, "src"), "{article.imageUrl}");
  assertLazy(image, true);
  let parent: ts.Node | undefined = image.parent;
  while (parent && !(ts.isJsxElement(parent) && parent.openingElement.tagName.getText() === "details")) {
    parent = parent.parent;
  }
  assert.ok(parent && ts.isJsxElement(parent));
  assert.match(parent.openingElement.getText(), /className="hc-desk-inherited"/);
  assert.equal(parent.openingElement.attributes.properties.some(
    (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === "open",
  ), false);
  assert.match(parent.getText(), /inheritedAvailableArticles\.map/);
});

test("compact ItemCard/BankNewsListItem and article/video bank previews are lazy", () => {
  assert.equal(pageImages.length, 3);
  assert.deepEqual(pageImages.map((image) => attribute(image, "src")), [
    "{imageUrl}", "{thumbnail}", "{thumbnail}",
  ]);
  pageImages.forEach((image) => assertLazy(image, true));
});

test("the secondary remote batch production preview is lazy", () => {
  assert.equal(batchImages.length, 2);
  assert.equal(attribute(batchImages[0], "src"), "{productionImage.imageUrl}");
  assertLazy(batchImages[0], true);
});

test("the immediate mixed local/Blob preview keeps its original attributes and lifecycle", () => {
  const image = batchImages[1];
  assert.equal(attribute(image, "src"), "{previewUrl}");
  assert.deepEqual(image.attributes.properties.map((prop) => prop.name?.getText()), ["src", "alt"]);
  const batch = source(batchPath);
  assert.match(batch, /const previewUrl = imageResult\?\.file\s*\? imagePreviewUrls\.get\(imageResult\.file\)\s*: imageResult\?\.imageUrl/);
  assert.match(batch, /URL\.createObjectURL\(file\)/);
  assert.match(batch, /URL\.revokeObjectURL\(previewUrl\)/);
});

test("newsroom and archive retain their existing lazy images", () => {
  for (const path of ["_mesa-source-item.tsx", "_mesa-archive-source-item.tsx"]) {
    const entries = images(newsroomPath + path);
    assert.equal(entries.length, 1);
    assert.equal(attribute(entries[0], "src"), "{item.imageCandidateUrl}");
    assertLazy(entries[0]);
  }
});

test("production retains lazy loading for the bank and output identity", () => {
  const entries = images(productionPath);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((image) => attribute(image, "src")), ["{image.frozenUrl}", "{imageUrl}"]);
  entries.forEach((image) => assertLazy(image));
});

test("shared dossier image selectors retain their existing lazy loading", () => {
  for (const path of ["_dossierImageBank.tsx", "_dossierImageChoiceGrid.tsx"]) {
    const entries = images(sharedPath + path);
    assert.ok(entries.length > 0);
    entries.forEach((image) => assertLazy(image));
  }
});

test("existing CSS reserves space before composition and batch images load", () => {
  const desk = source(deskPath);
  for (const selector of ["hc-desk-card-media", "hc-desk-row-image"]) {
    assert.match(desk, new RegExp("\\." + selector + "\\s*\\{[^}]*width: 100%;[^}]*aspect-ratio: 16 / 9;"));
  }
  assert.match(desk, /\.hc-desk-inherited-row img,[^{]*\{[^}]*width: 56px;[^}]*height: 42px;/);
  const page = source(pagePath);
  assert.match(page, /\.composition-admin-image\s*\{[^}]*width: 100%;[^}]*aspect-ratio: 1;/);
  assert.match(page, /\.composition-admin-desk-thumbnail,[^{]*\{[^}]*width: 56px;[^}]*height: 42px;/);
  assert.match(source(sharedPath + "publicacao-lote/publicacao-lote.module.css"),
    /\.imageAssociation img,[^{]*\{[^}]*width: 76px;[^}]*height: 56px;/);
});

// The release-only guards are opt-in so later editorial work is not frozen to
// this batch. Run with JORNADA_EGRESS_A1_BASE set to the reviewed base commit.
const base = process.env.JORNADA_EGRESS_A1_BASE;
const auditOptions = { skip: base ? false : "Set JORNADA_EGRESS_A1_BASE to audit the A1 patch" };
function git(...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}
function changedPaths() {
  assert.ok(base && /^[a-f0-9]{40}$/.test(base), "Use a full base commit SHA");
  git("merge-base", "--is-ancestor", base, "HEAD");
  return [...new Set([
    ...git("diff", "--name-only", base, "--").trim().split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").trim().split("\n"),
  ].filter(Boolean))];
}

test("A1 creates no SQL/migrations and changes no persistence, public or shared runtime files", auditOptions, () => {
  const paths = changedPaths();
  assert.equal(paths.some((path) => /\.sql$|(^|\/)migrations\//i.test(path)), false);
  const allowed = new Set([
    deskPath, pagePath, batchPath, "lib/backoffice-image-egress-a1.test.ts",
    "docs/egress-imagens-backoffice-a1-20260925.md",
  ]);
  assert.deepEqual(paths.filter((path) => !allowed.has(path)), []);
});

test("A1 adds only loading/decoding: zero URL rewrites, Storage calls, transformations or editorial changes", auditOptions, () => {
  const stripHints = (value: string) => value.replace(/\r\n/g, "\n")
    .replace(/\s+(?:loading="lazy"|decoding="async")/g, "");
  for (const path of [deskPath, pagePath, batchPath]) {
    const before = git("show", base + ":" + path);
    const after = source(path);
    assert.equal(stripHints(after), stripHints(before), path);
    const addedHints = (after.match(/loading="lazy"/g) ?? []).length
      - (before.match(/loading="lazy"/g) ?? []).length;
    assert.equal(addedHints, path === batchPath ? 1 : 3, path);
  }
});
