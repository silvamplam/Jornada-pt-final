import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProductionImageSource,
  prepareProductionImage,
} from "./editorial-production-image-preparation.server";

const origin = "https://local-project.supabase.co";
const dossierId = "00000000-0000-4000-8000-000000000001";
const imageId = "00000000-0000-4000-8000-000000000002";

test("preset social IOL é convertido para a fotografia limpa", () => {
  assert.equal(
    normalizeProductionImageSource("https://img.iol.pt/preset/6acfec26d34e9a786e75c32c/og/maisfutebol"),
    "https://img.iol.pt/image/id/6acfec26d34e9a786e75c32c/1024.jpg",
  );
  assert.equal(
    normalizeProductionImageSource("https://img.iol.pt/image/id/6acfec26d34e9a786e75c32c/1024.jpg"),
    "https://img.iol.pt/image/id/6acfec26d34e9a786e75c32c/1024.jpg",
  );
  assert.equal(
    normalizeProductionImageSource("https://cdn.example.test/photo.jpg"),
    "https://cdn.example.test/photo.jpg",
  );
});

test("cópia local contaminada não é reutilizada quando source_url é preset social IOL", async () => {
  let registeredLocal = false;
  let frozenSource = "";
  const result = await prepareProductionImage(
    { dossierId, imageId },
    {
      origin,
      async readImage() {
        return {
          id: imageId,
          dossier_id: dossierId,
          frozen_url: `${origin}/storage/v1/object/public/editorial-images/editorial/sha256/contaminada.jpg`,
          source_url: "https://img.iol.pt/preset/6acfdc92d34e53c759c765ae/og/maisfutebol",
        };
      },
      async latestDecision() { return null; },
      async registerLocal() { registeredLocal = true; },
      async freeze(key, source) {
        frozenSource = source;
        return {
          publicUrl: `${origin}/storage/v1/object/public/editorial-images/editorial/sha256/limpa.jpg`,
          path: "editorial/sha256/limpa.jpg",
          sha256: "abc",
          byteSize: 123,
          contentType: "image/jpeg",
        };
      },
    },
  );

  assert.equal(registeredLocal, false);
  assert.equal(frozenSource, "https://img.iol.pt/image/id/6acfdc92d34e53c759c765ae/1024.jpg");
  assert.match(result.publicUrl, /limpa\.jpg$/u);
  assert.ok(result.decisionKey?.startsWith(`production-image-v1:${imageId}:`));
});
