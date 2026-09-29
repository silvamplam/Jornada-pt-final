import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareImageReplacement, type ReplacementInput, type ReplacementSnapshot } from "./editorial-image-replacement.server";
import { frozenImageForBytes } from "./editorial-image-freeze.server";
import { isEditorialPreviewOriginalPath } from "./editorial-image-preview";
import { publicEditorialImageSources } from "./public-editorial-image";

const id = "11111111-1111-4111-8111-111111111111", origin = "https://local.example";
async function fixture() {
  const bytes = await sharp({ create: { width: 1400, height: 900, channels: 3, background: "blue" } }).jpeg().toBuffer();
  const image = frozenImageForBytes(bytes, "jpg", origin);
  const input: ReplacementInput = { articleId: id, expectedCurrentImageUrl: "https://old.example/rejected.jpg",
    decisionKey: `replacement:${id}:new`, sourceUrl: "https://new.example/approved.jpg", sha256: image.sha256, reviewer: "Reviewer", localFile: "unused" };
  const snapshot: ReplacementSnapshot = { origin, articles: [{ id, status: "published", image_url: input.expectedCurrentImageUrl }], assets: [], objects: [], decisions: [] };
  return { bytes, input, snapshot };
}
test("new local bytes generate immutable original and four compatible WebP previews without network", async () => {
  const f = await fixture(), p = await prepareImageReplacement(f.input, f.bytes, f.snapshot);
  assert.equal(p.uploads.length, 5);
  assert.deepEqual(p.uploads[0].bytes, f.bytes);
  assert.ok(isEditorialPreviewOriginalPath(p.image.path));
  assert.match(JSON.stringify(publicEditorialImageSources(p.image.publicUrl, "article", false, origin)), /w1280/);
  for (const width of [320, 640, 960, 1280]) {
    const o = p.uploads.find(o => o.path.endsWith(`/w${width}.webp`))!;
    const m = await sharp(o.bytes).metadata(); assert.equal(m.format, "webp"); assert.equal(m.width, width);
  }
  for (const o of p.uploads) assert.deepEqual(o.headers, { "x-upsert": "false", "Cache-Control": "max-age=31536000" });
  assert.deepEqual(Object.keys(p.articlePatch), ["image_url"]);
  assert.equal(p.registration.p_source_url, f.input.sourceUrl);
  assert.equal(p.promotion.p_expected_current_image_url, f.input.expectedCurrentImageUrl);
  assert.deepEqual(await prepareImageReplacement(f.input, f.bytes, f.snapshot), p);
});
test("already registered assets associate a fresh decision without copying or regenerating", async () => {
  const f = await fixture(), p = await prepareImageReplacement(f.input, f.bytes, f.snapshot);
  f.snapshot.assets.push({ public_url: p.image.publicUrl, storage_path: p.image.path, sha256: p.image.sha256, byte_size: p.image.byteSize, content_type: p.image.contentType });
  f.snapshot.objects = p.uploads.map(o => ({ name: o.path, metadata: { size: o.bytes.byteLength, mimetype: o.contentType } }));
  assert.equal((await prepareImageReplacement(f.input, f.bytes, f.snapshot)).uploads.length, 0);
  f.snapshot.objects.pop();
  await assert.rejects(prepareImageReplacement(f.input, f.bytes, f.snapshot), /objects-incomplete/);
});
test("partial upload retry only proposes missing objects and rejects metadata conflicts", async () => {
  const f = await fixture(), p = await prepareImageReplacement(f.input, f.bytes, f.snapshot), o = p.uploads[0];
  f.snapshot.objects.push({ name: o.path, metadata: { size: o.bytes.byteLength, mimetype: o.contentType } });
  assert.equal((await prepareImageReplacement(f.input, f.bytes, f.snapshot)).uploads.length, 4);
  f.snapshot.objects[0].metadata.size++;
  await assert.rejects(prepareImageReplacement(f.input, f.bytes, f.snapshot), /object-conflict/);
});
test("changed bytes, stale CAS, rejected migration keys, source mutation and nonimages fail closed", async () => {
  const f = await fixture();
  await assert.rejects(prepareImageReplacement(f.input, Buffer.from("B"), f.snapshot), /hash-conflict/);
  await assert.rejects(prepareImageReplacement({ ...f.input, expectedCurrentImageUrl: "other" }, f.bytes, f.snapshot), /reference-conflict/);
  await assert.rejects(prepareImageReplacement({ ...f.input, decisionKey: "migration:rejected" }, f.bytes, f.snapshot), /invalid-input/);
  await assert.rejects(prepareImageReplacement({ ...f.input, sourceUrl: "file:///tmp/image" }, f.bytes, f.snapshot));
  const p = await prepareImageReplacement(f.input, f.bytes, f.snapshot);
  f.snapshot.decisions.push({ decision_key: f.input.decisionKey, state: "ready", source_url: "https://other.example/x.jpg", image: p.image });
  await assert.rejects(prepareImageReplacement(f.input, f.bytes, f.snapshot), /decision-conflict/);
});
