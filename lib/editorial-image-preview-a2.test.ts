import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import sharp from "sharp";
import { editorialPreviewPath, editorialImagePreviewUrl, isEditorialPreviewOriginalPath } from "./editorial-image-preview";
import { generateEditorialImagePreviews, EDITORIAL_PREVIEW_MAX_BYTES } from "./editorial-image-preview-generator.server";
import { createEditorialPreviewStorage, type EditorialPreviewStorage } from "./editorial-image-preview-storage.server";
import { ensureEditorialImagePreviews } from "./editorial-image-preview-generation.server";
import { issueEditorialPreviewTicket, verifyEditorialPreviewTicket } from "./editorial-image-preview-ticket.server";
import { completeEditorialImagePreviews } from "./editorial-image-preview-upload";
import { parsePreviewBackfillArgs, assertPreviewBackfillWriteGuard, backfillEditorialImagePreviews } from "./editorial-image-preview-backfill.server";
import { syntheticEditorialImage } from "../scripts/benchmark-editorial-image-previews";
import { NextRequest } from "next/server";
import { createAdminSession, ADMIN_SESSION_COOKIE } from "./admin-session";
import { POST as completeUpload } from "../app/api/admin/editorial/image-previews/complete/route";

const origin = "https://fixture.supabase.co";
const path = "editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-synthetic.jpg";
const original = origin + "/storage/v1/object/public/editorial-images/" + path;
const otherPath = path.replace("123456789012", "123456789013");
const source = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const preview320 = editorialPreviewPath(path, 320)!;
const preview640 = editorialPreviewPath(path, 640)!;
const clientUploadFiles = [
  "app/admin/editorial/artigos/_articleForm.tsx",
  "app/admin/editorial/conteudos/_contentForm.tsx",
  "app/admin/editorial/redacao-automatica/_dossierImageBank.tsx",
  "app/admin/editorial/redacao-automatica/_sourcePackageOutputPlanner.tsx",
  "app/admin/editorial/redacao-automatica/_manualNewsEntryForm.tsx",
  "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx",
];

test("paths are deterministic, versioned, injective and have two separate variants", () => {
  assert.equal(editorialPreviewPath(path, 320), preview320);
  assert.equal(preview320, "previews/v1/" + path + "/w320.webp");
  assert.notEqual(preview320, preview640);
  assert.notEqual(preview320, editorialPreviewPath(otherPath, 320));
  assert.notEqual(preview320, editorialPreviewPath(path.replace(".jpg", ".png"), 320));
  assert.equal(editorialPreviewPath(path, 128 as 320), null);
});

test("only a public original in this exact project/bucket/versioned prefix resolves", () => {
  assert.equal(editorialImagePreviewUrl(original, 320, origin), origin + "/storage/v1/object/public/editorial-images/" + preview320);
  assert.equal(original.endsWith(path), true);
  for (const value of [
    original.replace(origin, "https://external.example"),
    original.replace(origin, "https://another.supabase.co"),
    original.replace(origin, "https://fixture.supabase.co.evil.example"),
    original.replace("editorial-images", "other-bucket"),
    original.replace("/editorial/2026", "/ads/2026"),
    original.replace("/public/", "/sign/"),
    original + "?width=100", original + "#fragment",
    original.replace("https://", "https://user:password@"),
    original.replace("/editorial/", "/../editorial/"),
    original.replace("/editorial/", "/%2e%2e/editorial/"),
    original.replace("/editorial/", "/editorial/%2f"),
    original.replace("synthetic", ".."), original.replace(".jpg", ".svg"),
    original.replace(path, "editorial/2026/09/mutable.jpg"),
    "blob:http://localhost/123", "data:image/png;base64,abc", "/relative.jpg", "not a URL",
    original.replace("https://", "http://"), original.replace("editorial/", "editorial\\"),
  ]) assert.equal(editorialImagePreviewUrl(value, 320, origin), value, value);
  assert.equal(editorialImagePreviewUrl(original, 320, undefined), original);
});

test("generation preserves original bytes, aspect ratio and does not enlarge", async () => {
  const input = await syntheticEditorialImage(900, 600);
  const before = Buffer.from(input);
  const previews = await generateEditorialImagePreviews(input);
  assert.deepEqual(input, before);
  assert.deepEqual(await Promise.all(previews.map(async (p) => {
    const m = await sharp(p.bytes).metadata();
    return [p.width, m.format, m.width, m.height];
  })), [[320, "webp", 320, 213], [640, "webp", 640, 427]]);
  const small = await sharp({ create: { width: 24, height: 16, channels: 4, background: { r: 12, g: 80, b: 40, alpha: 0.4 } } }).png().toBuffer();
  for (const preview of await generateEditorialImagePreviews(small)) {
    const m = await sharp(preview.bytes).metadata();
    assert.deepEqual([m.width, m.height, m.hasAlpha], [24, 16, true]);
    const rgba = await sharp(preview.bytes).raw().toBuffer();
    assert.ok(rgba[3] > 90 && rgba[3] < 115);
  }
});

test("generation applies EXIF orientation and supports JPEG/PNG/WebP/AVIF", async () => {
  const rotated = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#448855" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const [preview] = await generateEditorialImagePreviews(rotated);
  const m = await sharp(preview.bytes).metadata();
  assert.deepEqual([m.width, m.height, m.orientation], [40, 80, undefined]);
  for (const format of ["jpeg", "png", "webp", "avif"] as const) {
    const input = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#558866" } }).toFormat(format).toBuffer();
    assert.equal((await generateEditorialImagePreviews(input)).length, 2);
  }
});

test("generation rejects SVG, animated input, garbage and byte/pixel/dimension bombs", async () => {
  await assert.rejects(generateEditorialImagePreviews(Buffer.from('<svg width="30" height="20"></svg>')), /unsupported-format/);
  await assert.rejects(generateEditorialImagePreviews(Buffer.from("not an image")));
  await assert.rejects(generateEditorialImagePreviews(Buffer.alloc(EDITORIAL_PREVIEW_MAX_BYTES + 1)), /byte-size/);
  const large = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await assert.rejects(generateEditorialImagePreviews(large), /pixel limit/);
  const long = await sharp({ create: { width: 12001, height: 1, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await assert.rejects(generateEditorialImagePreviews(long), /dimensions/);
  const frames = Buffer.alloc(8 * 16 * 3, 25);
  frames.fill(220, 8 * 8 * 3);
  const animated = await sharp(frames, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).webp({ loop: 0 }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(generateEditorialImagePreviews(animated), /unsupported-format/);
});

function memoryStorage(input: Uint8Array) {
  const objects = new Map<string, Uint8Array>([[path, input]]);
  const calls: string[] = [];
  const storage: EditorialPreviewStorage = {
    async exists(key) { calls.push("exists:" + key); return objects.has(key); },
    async readOriginal(key) { calls.push("read:" + key); assert.equal(key, path); return objects.get(key)!; },
    async writePreview(key, bytes) {
      calls.push("write:" + key);
      assert.ok(key.startsWith("previews/v1/"));
      if (objects.has(key)) return "exists";
      objects.set(key, bytes);
      return "created";
    },
    async list() { return [{ name: path.split("/").pop()!, id: "object-id", metadata: { size: input.byteLength, mimetype: "image/jpeg" } }]; },
  };
  return { objects, calls, storage };
}

test("generation writes only companions and a second run does not read or encode the original", async () => {
  const bytes = await syntheticEditorialImage(800, 600);
  const { storage, calls, objects } = memoryStorage(bytes);
  const first = await ensureEditorialImagePreviews(path, storage);
  assert.deepEqual([first.ok, first.created, first.existing], [true, 2, 0]);
  assert.equal(objects.get(path), bytes);
  calls.length = 0;
  const second = await ensureEditorialImagePreviews(path, storage);
  assert.deepEqual([second.ok, second.created, second.existing, second.originalBytes], [true, 0, 2, 0]);
  assert.ok(calls.every((call) => call.startsWith("exists:")));
});

test("partial generation and concurrent creation never overwrite an existing preview", async () => {
  const bytes = await syntheticEditorialImage(600, 400);
  const { storage, objects } = memoryStorage(bytes);
  const existing = Buffer.from("existing preview");
  objects.set(preview320, existing);
  const result = await ensureEditorialImagePreviews(path, storage);
  assert.deepEqual([result.created, result.existing, result.ok], [1, 1, true]);
  assert.equal(objects.get(preview320), existing);
  const racing = { ...storage, exists: async () => false, writePreview: async () => "exists" as const };
  const raced = await ensureEditorialImagePreviews(path, racing, bytes);
  assert.deepEqual([raced.ok, raced.created, raced.existing], [true, 0, 2]);
});

test("preview failures return a best-effort result and leave original valid", async () => {
  const bytes = await syntheticEditorialImage(100, 80);
  const { storage, objects } = memoryStorage(bytes);
  const result = await ensureEditorialImagePreviews(path, { ...storage, writePreview: async () => { throw new Error("synthetic failure"); } });
  assert.equal(result.ok, false);
  assert.equal(result.error, "synthetic failure");
  assert.equal(objects.get(path), bytes);
  const supplied = await ensureEditorialImagePreviews(path, { ...storage, readOriginal: async () => { throw new Error("must not download twice"); } }, bytes);
  assert.equal(supplied.ok, true);
});

test("storage is bounded, restricts object paths, has no redirects, writes WebP with long cache and no upsert", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init! });
    return new Response(null, { status: init?.method === "HEAD" ? 404 : 200 });
  };
  const storage = createEditorialPreviewStorage({ url: origin, serviceRoleKey: "fixture-key" }, fetcher as typeof fetch);
  await assert.rejects(storage.readOriginal("https://evil.example/image.jpg"));
  await assert.rejects(storage.readOriginal("../secret"));
  await assert.rejects(storage.writePreview(path, Buffer.from("x")));
  assert.equal(seen.length, 0);
  assert.equal(await storage.exists(preview320), false);
  assert.equal(await storage.writePreview(preview320, Buffer.from("fixture")), "created");
  const upload = seen[1];
  assert.equal(upload.url, origin + "/storage/v1/object/editorial-images/" + preview320);
  assert.equal(upload.init.method, "POST");
  assert.equal(upload.init.redirect, "error");
  assert.equal(upload.init.cache, "no-store");
  const h = new Headers(upload.init.headers);
  assert.equal(h.get("cache-control"), "max-age=31536000");
  assert.equal(h.get("x-upsert"), "false");
  assert.equal(h.get("content-type"), "image/webp");
  assert.ok(seen.every(({ init }) => init.method !== "DELETE"));
});

test("storage rejects excessive streamed/download lengths, wrong MIME and handles upload conflicts", async () => {
  function transport(response: () => Response) {
    return createEditorialPreviewStorage({ url: origin, serviceRoleKey: "fixture-key" }, (async () => response()) as typeof fetch);
  }
  await assert.rejects(transport(() => new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(EDITORIAL_PREVIEW_MAX_BYTES + 1) } })).readOriginal(path), /byte-size/);
  await assert.rejects(transport(() => new Response("x", { headers: { "content-type": "image/svg+xml" } })).readOriginal(path), /content-type/);
  await assert.rejects(transport(() => new Response(Buffer.alloc(EDITORIAL_PREVIEW_MAX_BYTES + 1), { headers: { "content-type": "image/jpeg" } })).readOriginal(path), /byte-size/);
  assert.equal(await transport(() => Response.json({ error: "Duplicate" }, { status: 409 })).writePreview(preview320, Buffer.from("x")), "exists");
  await assert.rejects(transport(() => new Response(null, { status: 403 })).exists(preview320), /403/);
});

test("upload tickets are path-bound, signed, expiring, and not usable for arbitrary objects", () => {
  const now = 1790323200000;
  const ticket = issueEditorialPreviewTicket(path, "fixture-secret", now);
  assert.equal(verifyEditorialPreviewTicket(path, ticket, "fixture-secret", now), true);
  assert.equal(verifyEditorialPreviewTicket(otherPath, ticket, "fixture-secret", now), false);
  assert.equal(verifyEditorialPreviewTicket(path, ticket, "wrong", now), false);
  assert.equal(verifyEditorialPreviewTicket(path, ticket, "fixture-secret", now + 7200001), false);
  assert.equal(verifyEditorialPreviewTicket(path, ticket + "0", "fixture-secret", now), false);
  assert.equal(verifyEditorialPreviewTicket("../secret", ticket, "fixture-secret", now), false);
});

test("upload completion is best effort, does not return a replacement image URL, and supports legacy inline forms", async () => {
  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new Error("fixture network failure"); }) as typeof fetch;
    assert.equal(await completeEditorialImagePreviews({ path, previewTicket: "fixture" }), undefined);
    const serialized = (0, eval)("(" + completeEditorialImagePreviews.toString() + ")") as typeof completeEditorialImagePreviews;
    assert.equal(await serialized({ path, previewTicket: "fixture" }), undefined);
    globalThis.fetch = (async () => Response.json({ ok: false })) as typeof fetch;
    assert.equal(await completeEditorialImagePreviews({ path, previewTicket: "fixture" }), undefined);
  } finally { globalThis.fetch = savedFetch; }
});

test("all seven client upload continuations expose the original while keepalive completion is pending", async () => {
  const savedFetch = globalThis.fetch;
  const release: (() => void)[] = [];
  const completions: Promise<void>[] = [];
  const signed = { path, previewTicket: issueEditorialPreviewTicket(path, "fixture-key"), publicUrl: original };
  try {
    globalThis.fetch = ((url, init) => {
      assert.equal(url, "/api/admin/editorial/image-previews/complete");
      assert.equal(init?.method, "POST");
      assert.equal(init?.keepalive, true);
      assert.deepEqual(JSON.parse(String(init?.body)), { path, ticket: signed.previewTicket });
      assert.ok(Buffer.byteLength(String(init?.body)) < 2048);
      return new Promise<Response>((resolve) => {
        // Remain pending until every editorial continuation has finished, then fail.
        release.push(() => resolve(Response.json({ ok: false }, { status: 503 })));
      });
    }) as typeof fetch;
    for (const file of clientUploadFiles) {
      const text = source(file);
      const lines = text.split("\n").filter((line) => /completeEditorialImagePreviews/.test(line) && !line.startsWith("import "));
      assert.equal(lines.length, 1, file);
      assert.match(lines[0], /^\s*void /, file);
      // Execute the actual call statement, including the two legacy inline forms.
      const statement = lines[0].replace("${completeEditorialImagePreviews.toString()}", "completeEditorialImagePreviews");
      const continueUpload = new Function("completeEditorialImagePreviews", "signPayload", "signed",
        "return (async () => { " + statement + " return signPayload.publicUrl; })();");
      const flow: Promise<string> = continueUpload((payload: typeof signed) => {
        const completion = completeEditorialImagePreviews(payload);
        completions.push(completion);
        return completion;
      }, signed, signed);
      const value = await Promise.race([flow, new Promise<null>((resolve) => setImmediate(() => resolve(null)))]);
      assert.equal(value, original, file + " must not wait for the preview response");
    }
    assert.equal(release.length, 7);
  } finally {
    release.forEach((resolve) => resolve());
    await Promise.all(completions); // HTTP failure must also be contained, with no rejected promise.
    globalThis.fetch = savedFetch;
  }
});

test("backfill is dry-run by default and requires explicit write option plus environment guard", () => {
  const options = parsePreviewBackfillArgs(["--prefix", "editorial/2026/09"]);
  assert.deepEqual(options, { prefix: "editorial/2026/09", limit: 20, offset: 0, execute: false });
  assert.doesNotThrow(() => assertPreviewBackfillWriteGuard(options, "fixture.supabase.co"));
  const execute = parsePreviewBackfillArgs(["--prefix", options.prefix, "--execute"]);
  assert.throws(() => assertPreviewBackfillWriteGuard(execute, "fixture.supabase.co"), /not-confirmed/);
  assert.throws(() => assertPreviewBackfillWriteGuard(execute, "fixture.supabase.co", "allow:other.supabase.co"));
  assert.doesNotThrow(() => assertPreviewBackfillWriteGuard(execute, "fixture.supabase.co", "allow:fixture.supabase.co"));
  for (const args of [[], ["--prefix", "editorial"], ["--prefix", options.prefix, "--limit", "101"], ["--prefix", options.prefix, "--offset", "-1"], ["--force"]]) {
    assert.throws(() => parsePreviewBackfillArgs(args));
  }
});

test("completion endpoint enforces auth/ticket/origin and uses only this project's storage", async () => {
  const names = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  let requests = 0;
  try {
    process.env.ADMIN_PASSWORD = "synthetic-password";
    process.env.ADMIN_SESSION_SECRET = "synthetic-session-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-key";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests++;
      assert.ok(String(url).startsWith(origin + "/storage/v1/object/editorial-images/previews/v1/"));
      assert.equal(init?.method, "HEAD");
      return new Response(null, { status: 200 }); // Existing previews: zero download/encode.
    }) as typeof fetch;
    const cookie = ADMIN_SESSION_COOKIE + "=" + await createAdminSession();
    const ticket = issueEditorialPreviewTicket(path, "synthetic-key");
    function request(body: unknown, authenticated = true, requestOrigin = "http://localhost:3101") {
      return new NextRequest("http://localhost:3101/api/admin/editorial/image-previews/complete", {
        method: "POST", body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: requestOrigin, ...(authenticated ? { cookie } : {}) },
      });
    }
    assert.equal((await completeUpload(request({ path, ticket }, false))).status, 401);
    assert.equal((await completeUpload(request({ path, ticket }, true, "https://evil.example"))).status, 403);
    assert.equal((await completeUpload(request({ path: otherPath, ticket }))).status, 400);
    assert.equal(requests, 0);
    const response = await completeUpload(request({ path, ticket }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, created: 0, existing: 4, originalBytes: 0, previewBytes: 0 });
    assert.equal(requests, 4);
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test("dry-run lists bounded candidates without reading bytes or writing; execute is idempotent", async () => {
  const bytes = await syntheticEditorialImage(800, 600);
  const { storage, calls, objects } = memoryStorage(bytes);
  const rows: Record<string, unknown>[] = [];
  const options = parsePreviewBackfillArgs(["--prefix", "editorial/2026/09"]);
  const dry = await backfillEditorialImagePreviews(storage, options, (row) => rows.push(row));
  assert.deepEqual([dry.found, dry.planned, dry.created, dry.originalBytesProcessed], [1, 1, 0, 0]);
  assert.equal(calls.some((c) => /^(read|write):/.test(c)), false);
  assert.deepEqual(rows[0].missing, [preview320, preview640]);
  const first = await backfillEditorialImagePreviews(storage, { ...options, execute: true }, () => {});
  assert.deepEqual([first.created, first.previewsCreated, first.originalBytesProcessed], [1, 2, bytes.length]);
  assert.ok(first.previewBytesGenerated > 0 && first.previewBytesGenerated < bytes.length);
  calls.length = 0;
  const second = await backfillEditorialImagePreviews(storage, { ...options, execute: true }, () => {});
  assert.deepEqual([second.alreadyExisting, second.created, second.originalBytesProcessed], [1, 0, 0]);
  assert.equal(objects.get(path), bytes);
  assert.equal(calls.some((c) => /^(read|write):/.test(c)), false);
});

test("backfill reports skipped and failed objects and a bounded continuation offset", async () => {
  const { storage } = memoryStorage(Buffer.from("not a raster"));
  const entries = [
    { name: path.split("/").pop()!, id: "eligible" },
    { name: "mutable.jpg", id: "legacy" },
    { name: "folder", id: null },
  ];
  const options = { prefix: "editorial/2026/09", limit: 3, offset: 7, execute: true };
  const report = await backfillEditorialImagePreviews({ ...storage, list: async () => entries }, options, () => {});
  assert.deepEqual([report.found, report.failed, report.skipped, report.nextOffset], [3, 1, 2, 10]);
});

test("a synthetic large fixture demonstrates smaller persistent previews", async () => {
  const input = await syntheticEditorialImage();
  for (const preview of await generateEditorialImagePreviews(input)) assert.ok(preview.bytes.length < input.length / 4);
});

test("rendering is static URL selection only, with one-way original fallback and no srcSet", () => {
  const component = source("components/admin/BackofficeImage.tsx");
  assert.match(component, /editorialImagePreviewUrl\(src, previewWidth\)/);
  assert.match(component, /failedPreview === preview \? src : preview/);
  assert.match(component, /if \(displayed !== src\)/);
  assert.match(component, /setFailedPreview\(preview\)/);
  assert.doesNotMatch(component, /fetch\(|useEffect|\.server|sharp|<source|srcSet=/);
  assert.doesNotMatch(source("lib/editorial-image-preview.ts"), /fetch\(|\.server|serviceRole|sharp/);
});

test("upload pipelines all request completion after success and continue persisting canonical URLs", () => {
  for (const file of clientUploadFiles) {
    const text = source(file);
    const index = Math.max(text.indexOf("void completeEditorialImagePreviews("), text.indexOf("void (${completeEditorialImagePreviews.toString()}"));
    assert.ok(index > text.indexOf("if (!uploadResponse.ok)"), file);
    assert.match(text, /publicUrl/);
    assert.doesNotMatch(text, /image_?url[^\n]*= [^\n]*(?:previewUrl|editorialImagePreviewUrl)/i);
  }
  for (const kind of ["artigos", "conteudos"]) {
    const text = source("app/api/admin/editorial/" + kind + "/upload-image/sign/route.ts");
    assert.match(text, /previewTicket: issueEditorialPreviewTicket\(path, config.serviceRoleKey\)/);
    assert.match(text, /"x-upsert": "false"/);
  }
  const importer = source("app/api/admin/editorial/artigos/import-source-image/route.ts");
  assert.match(importer, /try \{\s+await ensureEditorialImagePreviews\([^;]+;\s+\} catch \{\s+console.warn\([^;]+;\s+\}\s+return NextResponse.json/);
  assert.match(importer, /ensureEditorialImagePreviews\(path, createEditorialPreviewStorage\(config\), downloaded.bytes, PUBLIC_EDITORIAL_PREVIEW_WIDTHS\)/);
  assert.match(importer, /publicUrl: publicStorageUrl\(config.url, path\)/);
  assert.ok(importer.indexOf("ensureEditorialImagePreviews(path") > importer.indexOf("if (uploadError)"));
  const endpoint = source("app/api/admin/editorial/image-previews/complete/route.ts");
  assert.match(endpoint, /verifyAdminSession/);
  assert.match(endpoint, /verifyEditorialPreviewTicket/);
  assert.doesNotMatch(endpoint, /export async function GET/);
});

test("compact components use 320; only the two fluid composition cards use 640", () => {
  const files = [
    "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
    "app/admin/editorial/composicao/[matchdayId]/page.tsx",
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
    "app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx",
    "app/admin/editorial/redacao-automatica/mesa/_mesa-archive-source-item.tsx",
    "app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx",
    "app/admin/editorial/redacao-automatica/_dossierImageBank.tsx",
    "app/admin/editorial/redacao-automatica/_dossierImageChoiceGrid.tsx",
    "app/admin/editorial/redacao-automatica/_sourcePackageOutputPlanner.tsx",
  ];
  assert.equal((source(files[0]).match(/previewWidth=\{640\}/g) ?? []).length, 2);
  assert.equal((source(files[0]).match(/previewWidth=\{320\}/g) ?? []).length, 1);
  for (const file of files.slice(1)) {
    assert.match(source(file), /BackofficeImage previewWidth=\{320\}/);
    assert.doesNotMatch(source(file), /previewWidth=\{640\}/);
  }
});

// Optional A2 release audit: protects all persistence/public/SQL code outside
// the explicitly reviewed preview and upload completion changes.
const base = process.env.JORNADA_EGRESS_A2_BASE;
test("A2 changes no SQL, public renderers, Mesa Viva, logos, snapshots or Article Plans", {
  skip: base ? false : "Set JORNADA_EGRESS_A2_BASE for the release diff audit",
}, () => {
  assert.match(base!, /^[a-f0-9]{40}$/);
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });
  git("merge-base", "--is-ancestor", base!, "HEAD");
  const files = [
    ...git("diff", "--name-only", base!, "--").trim().split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").trim().split("\n"),
  ].filter(Boolean);
  for (const file of files) {
    assert.doesNotMatch(file, /\.sql$|^supabase\/|^components\/public\/|^app\/\(public\)|^app\/page.tsx$|^app\/noticias\/|\/jornada\/|Logo|Badge/);
  }
  const stripPreviewAdditions = (value: string) => value.replace(/\r\n/g, "\n")
    .replace(/^import BackofficeImage[^\n]*\n/gm, "")
    .replace(/^import \{ (?:completeEditorialImagePreviews|issueEditorialPreviewTicket|createEditorialPreviewStorage|ensureEditorialImagePreviews) \}[^\n]*\n/gm, "")
    .replace(/<BackofficeImage previewWidth=\{(?:320|640)\}/g, "<img")
    .replace(/^ +void (?:completeEditorialImagePreviews\((?:signed|signPayload)\)|\(\$\{completeEditorialImagePreviews.toString\(\)\}\)\(signPayload\));\n\n/gm, "")
    .replace(/^  (?:previewTicket|path)\?: string;\n/gm, "")
    .replace(/^    previewTicket: issueEditorialPreviewTicket\(path, config.serviceRoleKey\),\n/gm, "")
    .replace(/  \/\/ Reuse bytes already downloaded for the original; preview failure is non-fatal\.\n  try \{\n    await ensureEditorialImagePreviews\(path, createEditorialPreviewStorage\(config\), downloaded.bytes\);\n  \} catch \{\n    console.warn\("\[editorial-preview\] import completion unavailable", \{ path \}\);\n  \}\n/g, "");
  const existingAppFiles = git("diff", "--name-only", "--diff-filter=M", base!, "--", "app").trim().split("\n").filter(Boolean);
  for (const file of existingAppFiles) {
    assert.equal(stripPreviewAdditions(source(file)), stripPreviewAdditions(git("show", base! + ":" + file)), file);
  }
  const protectedPaths = [
    "lib/redacao-automatica/editorial-dossier-production-workspace-service-internal.ts",
    "lib/redacao-automatica/editorial-batch-publication-client.ts",
    "app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts",
    "app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts",
    "app/api/admin/editorial/composicao/route.ts",
    "lib/supabase.ts",
  ];
  for (const file of protectedPaths) assert.equal(source(file), git("show", base! + ":" + file).replace(/\r\n/g, "\n"), file);
});
