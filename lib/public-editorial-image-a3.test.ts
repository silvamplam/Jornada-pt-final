import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";
import { editorialPreviewPath, EDITORIAL_PREVIEW_WIDTHS, PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "./editorial-image-preview";
import { publicEditorialImageSources, PUBLIC_EDITORIAL_IMAGE_SIZES, type PublicEditorialImageSize } from "./public-editorial-image";
import PublicEditorialImage from "../components/public/PublicEditorialImage";
import { generateEditorialImagePreviews } from "./editorial-image-preview-generator.server";
import { ensureEditorialImagePreviews } from "./editorial-image-preview-generation.server";
import { createEditorialPreviewStorage, type EditorialPreviewStorage } from "./editorial-image-preview-storage.server";
import { parsePreviewBackfillArgs, backfillEditorialImagePreviews } from "./editorial-image-preview-backfill.server";
import { syntheticEditorialImage } from "../scripts/benchmark-editorial-image-previews";
import { benchmarkPublicEditorialPreviews } from "../scripts/benchmark-public-editorial-previews";

const origin = "https://fixture.supabase.co";
const path = "editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-synthetic.jpg";
const original = `${origin}/storage/v1/object/public/editorial-images/${path}`;
const base = "2d6628f432d659fa7c4c0314730cd5ed0f183348";
const source = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const baseSource = (file: string) => execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", maxBuffer: 10_000_000 }).replace(/\r\n/g, "\n");
const renderers = [
  "components/public/PublicEditorialLayout.tsx", "components/public/PublicHierarchicalComposition.tsx",
  "components/public/PublicFourNewsGrid.tsx", "components/public/PublicHorizontalNewsStrip.tsx",
  "components/public/PublicLatestNewsBlock.tsx", "components/public/PublicBeyondMatchdayNews.tsx",
  "app/noticias/[slug]/page.tsx", "app/conteudos/[slug]/page.tsx",
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx",
];

test("A2 keys/defaults remain identical; public widths are deterministic under the same v1 recipe", () => {
  assert.deepEqual(EDITORIAL_PREVIEW_WIDTHS, [320, 640]);
  assert.deepEqual(PUBLIC_EDITORIAL_PREVIEW_WIDTHS, [320, 640, 960, 1280]);
  for (const width of PUBLIC_EDITORIAL_PREVIEW_WIDTHS) {
    assert.equal(editorialPreviewPath(path, width), `previews/v1/${path}/w${width}.webp`);
    assert.notEqual(editorialPreviewPath(path, width), editorialPreviewPath(path.replace("synthetic", "other"), width));
  }
});

test("public responsive candidates are own static URLs; small previews exclude large candidates", () => {
  for (const size of Object.keys(PUBLIC_EDITORIAL_IMAGE_SIZES) as PublicEditorialImageSize[]) {
    const sources = publicEditorialImageSources(original, size, false, origin);
    assert.ok(sources.src.endsWith(`/w${PUBLIC_EDITORIAL_IMAGE_SIZES[size].max}.webp`));
    assert.equal(sources.sizes, PUBLIC_EDITORIAL_IMAGE_SIZES[size].sizes);
    assert.ok(sources.srcSet?.includes("/w320.webp 320w"));
    assert.equal(sources.srcSet?.includes("/w1280.webp"), PUBLIC_EDITORIAL_IMAGE_SIZES[size].max === 1280);
  }
  assert.equal(publicEditorialImageSources(original, "thumbnail", false, origin).srcSet?.split(", ").length, 1);
  assert.match(publicEditorialImageSources(original, "half", true, origin).sizes!, /^auto, /);
  assert.doesNotMatch(publicEditorialImageSources(original, "article", false, origin).sizes!, /auto/);
});

test("external/mutable/ambiguous/non-raster URLs remain byte-for-byte unchanged without srcset", () => {
  for (const url of [original + "?x=1", original + "#hash", original.replace(origin, "https://other.supabase.co"),
    original.replace("editorial-images", "team-logos"), original.replace("editorial-images", "other"),
    original.replace("/public/", "/sign/"), original.replace("https://", "https://user:pass@"),
    original.replace("/editorial/", "/../editorial/"), original.replace("/editorial/", "/%2e%2e/editorial/"),
    original.replace("synthetic", "%73ynthetic"), original.replace("synthetic", "%252f"), original.replace("synthetic", "a\\b"),
    original.replace(path, "editorial/2026/09/mutable.jpg"), original.replace(".jpg", ".svg"),
    "https://upload.wikimedia.org/fixture.svg", "blob:http://localhost/id", "data:image/png;base64,xyz", "invalid",
  ]) assert.deepEqual(publicEditorialImageSources(url, "article", false, origin), { src: url, srcSet: undefined, sizes: undefined }, url);
});

test("SSR emits an img without wrappers and preserves alt, framing, CSS, dimensions, loading and canonical input", () => {
  Object.assign(globalThis, { React });
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
  try {
    const props = Object.freeze({ src: original, imageSize: "article" as const, alt: "Editorial title", className: "original-class",
      width: 780, height: 520, "data-editorial-image-framing": "wide", style: { objectPosition: "center 38%" }, loading: "lazy" as const, decoding: "async" as const });
    const html = renderToStaticMarkup(React.createElement(PublicEditorialImage, props));
    assert.ok(html.startsWith("<img "));
    for (const value of ['class="original-class"', 'width="780"', 'height="520"', 'alt="Editorial title"',
      'data-editorial-image-framing="wide"', 'object-position:center 38%', 'loading="lazy"', 'decoding="async"', 'sizes="auto, ']) assert.ok(html.includes(value), value);
    assert.equal(props.src, original);
    const main = renderToStaticMarkup(React.createElement(PublicEditorialImage, { src: original, imageSize: "article", alt: "" }));
    assert.doesNotMatch(main, /loading=|fetchPriority=/);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous; }
});

test("four generated widths preserve ratio, orientation and alpha, never upscale or modify original", async () => {
  const bytes = await syntheticEditorialImage(1800, 1200);
  const copy = Buffer.from(bytes);
  const variants = await generateEditorialImagePreviews(bytes, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
  assert.deepEqual(bytes, copy);
  assert.deepEqual(await Promise.all(variants.map(async (v) => {
    const m = await sharp(v.bytes).metadata(); return [m.width, m.height, m.format];
  })), [[320, 213, "webp"], [640, 427, "webp"], [960, 640, "webp"], [1280, 853, "webp"]]);
  const alpha = await sharp({ create: { width: 48, height: 24, channels: 4, background: { r: 80, g: 100, b: 150, alpha: 0.4 } } }).png().toBuffer();
  for (const v of await generateEditorialImagePreviews(alpha, PUBLIC_EDITORIAL_PREVIEW_WIDTHS)) {
    const m = await sharp(v.bytes).metadata(); assert.deepEqual([m.width, m.height, m.hasAlpha], [48, 24, true]);
    assert.ok((await sharp(v.bytes).raw().toBuffer())[3] > 90);
  }
  const oriented = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#489875" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  for (const v of await generateEditorialImagePreviews(oriented, PUBLIC_EDITORIAL_PREVIEW_WIDTHS)) {
    const m = await sharp(v.bytes).metadata(); assert.deepEqual([m.width, m.height, m.orientation], [40, 80, undefined]);
  }
});

function memoryStorage(bytes: Buffer) {
  const objects = new Map<string, Uint8Array>([[path, bytes]]);
  const calls: string[] = [];
  const storage: EditorialPreviewStorage = {
    async exists(key) { calls.push("HEAD " + key); return objects.has(key); },
    async readOriginal(key) { calls.push("GET " + key); assert.equal(key, path); return bytes; },
    async writePreview(key, value) { calls.push("POST " + key); assert.notEqual(key, path); if (objects.has(key)) return "exists"; objects.set(key, value); return "created"; },
    async list(prefix, limit, offset) { assert.equal(prefix, "editorial/2026/09"); assert.equal(limit, 20); assert.equal(offset, 0);
      return [{ name: path.split("/").pop()!, id: "fixture", metadata: { size: bytes.length, mimetype: "image/jpeg" } }]; },
  };
  return { storage, objects, calls };
}

test("public generation reuses supplied bytes and preserves A2 companions on a later failure", async () => {
  const bytes = await syntheticEditorialImage(800, 600);
  const { storage, objects, calls } = memoryStorage(bytes);
  const result = await ensureEditorialImagePreviews(path, { ...storage, writePreview: async (key, value) => {
    if (key.endsWith("/w960.webp")) throw new Error("synthetic upload failure"); return storage.writePreview(key, value);
  } }, bytes, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
  assert.deepEqual([result.ok, result.created], [false, 2]);
  assert.equal(objects.get(path), bytes);
  assert.ok(objects.has(editorialPreviewPath(path, 320)!));
  assert.ok(objects.has(editorialPreviewPath(path, 640)!));
  assert.ok(calls.every((call) => !call.startsWith("GET")));
  const retry = await ensureEditorialImagePreviews(path, storage, bytes, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
  assert.deepEqual([retry.ok, retry.created, retry.existing], [true, 2, 2]);
});

test("new widths are static uploads with long cache, no upsert, no original mutation", async () => {
  const requests: RequestInit[] = [];
  const storage = createEditorialPreviewStorage({ url: origin, serviceRoleKey: "fixture" }, (async (url, init) => {
    assert.match(String(url), /\/previews\/v1\//); requests.push(init!); return new Response(null, { status: 200 });
  }) as typeof fetch);
  for (const width of [960, 1280] as const) await storage.writePreview(editorialPreviewPath(path, width)!, Buffer.from("fixture"));
  for (const request of requests) {
    assert.equal(request.method, "POST");
    const headers = new Headers(request.headers);
    assert.equal(headers.get("cache-control"), "max-age=31536000");
    assert.equal(headers.get("x-upsert"), "false");
    assert.equal(headers.get("content-type"), "image/webp");
  }
  await assert.rejects(storage.writePreview(path, Buffer.from("x")));
  assert.equal(requests.length, 2);
});

test("public backfill plans only missing widths; default stays dry-run, controlled execute is idempotent", async () => {
  const bytes = await syntheticEditorialImage(800, 600);
  const { storage, objects, calls } = memoryStorage(bytes);
  const existing = Buffer.from("existing A2 asset");
  for (const width of EDITORIAL_PREVIEW_WIDTHS) objects.set(editorialPreviewPath(path, width)!, existing);
  const options = parsePreviewBackfillArgs(["--prefix", "editorial/2026/09", "--widths", "1280,320,960,640,320"]);
  assert.equal(options.execute, false);
  assert.deepEqual(options.widths, [320, 640, 960, 1280]);
  const rows: Record<string, unknown>[] = [];
  const planned = await backfillEditorialImagePreviews(storage, options, (row) => rows.push(row));
  assert.equal(planned.planned, 1);
  assert.deepEqual(rows[0].missing, [editorialPreviewPath(path, 960), editorialPreviewPath(path, 1280)]);
  assert.ok(calls.every((call) => call.startsWith("HEAD")));
  const result = await backfillEditorialImagePreviews(storage, { ...options, execute: true }, () => {});
  assert.equal(result.previewsCreated, 2);
  assert.equal(objects.get(editorialPreviewPath(path, 320)!), existing);
  calls.length = 0;
  const second = await backfillEditorialImagePreviews(storage, { ...options, execute: true }, () => {});
  assert.deepEqual([second.alreadyExisting, second.originalBytesProcessed], [1, 0]);
  assert.ok(calls.every((call) => call.startsWith("HEAD")));
  assert.equal(objects.get(path), bytes);
  assert.throws(() => parsePreviewBackfillArgs(["--prefix", "editorial/2026/09", "--widths", "1920"]));
});

test("public render has no generation, fetch, upload, transformation, or next/image pipeline", () => {
  const code = source("components/public/PublicEditorialImage.tsx") + source("lib/public-editorial-image.ts");
  assert.doesNotMatch(code, /fetch\(|sharp|\.server|image-previews\/complete|\/render\/image|next\/image|serviceRole/);
  assert.match(code, /removeAttribute\("srcset"\)/);
  assert.match(code, /failedOriginal === src/);
  assert.match(code, /element\?\.complete && element.currentSrc && element.naturalWidth === 0/);
});

function normalizedRenderer(text: string) {
  const file = ts.createSourceFile("renderer.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = ts.transform(file, [(context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node) && node.importClause?.name?.text === "PublicEditorialImage") return undefined;
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "PublicEditorialImage") {
        return ts.factory.updateJsxSelfClosingElement(node, ts.factory.createIdentifier("img"), node.typeArguments,
          ts.factory.updateJsxAttributes(node.attributes, node.attributes.properties.filter((p) => !(ts.isJsxAttribute(p) && p.name.getText(file) === "imageSize"))));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit) as ts.SourceFile;
  }]);
  const normalized = ts.createPrinter({ removeComments: true }).printFile(result.transformed[0] as ts.SourceFile);
  result.dispose(); return normalized;
}

for (const file of renderers) test(`base equivalence (all logic, CSS, framing, markup, posters, canonical source): ${file}`, () => {
  assert.equal(normalizedRenderer(source(file)), normalizedRenderer(baseSource(file)));
});

test("logos, A2 client flows, article persistence, B1/B2, main Jornada, Home and framing remain exactly at base", () => {
  for (const file of ["components/public/PublicTeamBadge.tsx", "components/public/PublicTeamBadge.module.css",
    "components/public/BroadcastChannelLogo.tsx", "components/public/BroadcastChannelLogo.module.css",
    "components/public/PublicMatchStrip.tsx",
    "lib/public-matchday.ts", "lib/public-matchday-structural-context.ts", "lib/public-article-matchday-context.ts",
    "lib/editorial-image-framing.ts", "lib/editorial-image-preview-upload.ts", "lib/editorial-image-preview-ticket.server.ts",
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx", "app/page.tsx",
    "components/admin/BackofficeImage.tsx", "app/api/admin/editorial/artigos/route.ts",
    "app/admin/editorial/artigos/_articleForm.tsx", "app/admin/editorial/conteudos/_contentForm.tsx",
    "app/admin/editorial/redacao-automatica/_dossierImageBank.tsx", "app/admin/editorial/redacao-automatica/_sourcePackageOutputPlanner.tsx",
    "app/admin/editorial/redacao-automatica/_manualNewsEntryForm.tsx", "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx",
  ]) assert.equal(source(file), baseSource(file), file);
});

test("synthetic public page byte comparisons demonstrate savings without claiming production traffic", async () => {
  const result = await benchmarkPublicEditorialPreviews();
  assert.equal(result.assets.length, 5);
  for (const asset of result.assets.slice(1)) assert.ok(asset.reductionPercent > 70);
  for (const page of result.pages) assert.ok(page.after < page.before / 4);
  assert.equal(result.unchangedLogos.stripBefore, result.unchangedLogos.stripAfter);
});

test("A3 release contains no SQL, persistence, PostgREST/cache, logo, admin or B3 changes", (t) => {
  const releaseBase = process.env.JORNADA_EGRESS_A3_BASE;
  if (!releaseBase) return t.skip("Set JORNADA_EGRESS_A3_BASE for the branch scope audit");
  assert.equal(releaseBase, base);
  const changed = execFileSync("git", ["diff", "--name-only", releaseBase], { encoding: "utf8" }).trim().split("\n");
  for (const file of changed) {
    assert.doesNotMatch(file, /^(supabase\/|app\/admin\/|lib\/(?:public-matchday|public-article-matchday-context|classification|supabase))|\.sql$|[Bb]3|PublicTeamBadge|BroadcastChannelLogo|\.module\.css$/);
    if (file.startsWith("app/api/")) assert.ok([
      "app/api/admin/editorial/artigos/import-source-image/route.ts", "app/api/admin/editorial/image-previews/complete/route.ts",
    ].includes(file), file);
  }
});
