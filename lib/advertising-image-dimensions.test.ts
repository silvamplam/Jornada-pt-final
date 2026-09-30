import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import sharp from "sharp";
import type { EditorialImageNetwork } from "./editorial-image-download.server";
import {
  measureAdvertisingImageBytes,
  measureAdvertisingImageUrl,
} from "./advertising-image-dimensions.server";

test("medição de criativos valida os bytes e a proporção real", async () => {
  for (const [width, height] of [[2172, 724], [640, 120]]) {
    const bytes = await sharp({
      create: { width, height, channels: 3, background: "white" },
    }).png().toBuffer();
    assert.deepEqual(await measureAdvertisingImageBytes(bytes, "image/png"), {
      imageWidth: width,
      imageHeight: height,
    });
    await assert.rejects(measureAdvertisingImageBytes(bytes, "image/jpeg"));
  }
  await assert.rejects(measureAdvertisingImageBytes(new Uint8Array([1, 2, 3])));
});

test("orientação EXIF corresponde à caixa pintada pelo browser", async () => {
  const bytes = await sharp({
    create: { width: 40, height: 100, channels: 3, background: "red" },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.deepEqual(await measureAdvertisingImageBytes(bytes, "image/jpeg"), {
    imageWidth: 100,
    imageHeight: 40,
  });
});

test("asset público local é medido do ficheiro, nunca do nome ou formato", async () => {
  assert.deepEqual(await measureAdvertisingImageUrl("/ads/coral-lateral-v2.webp"), {
    imageWidth: 701,
    imageHeight: 2048,
  });
  await assert.rejects(measureAdvertisingImageUrl("/../package.json"));
  await assert.rejects(measureAdvertisingImageUrl("http://127.0.0.1/private.png"));
});

test("URL externo é medido pelo downloader seguro e recusa redirect privado", async () => {
  const bytes = await sharp({
    create: { width: 640, height: 120, channels: 3, background: "blue" },
  }).png().toBuffer();
  let redirectPrivate = false;
  const network: EditorialImageNetwork = {
    async resolve(hostname) {
      return [{ address: hostname === "private.example" ? "169.254.169.254" : "1.1.1.1", family: 4 }];
    },
    request: ((_url: URL, options: { lookup: (host: string, opts: object, callback: (error: null, address: string, family: number) => void) => void }, callback: (response: PassThrough & { statusCode: number; headers: Record<string, string> }) => void) => {
      options.lookup("creative.example", {}, (_error, address) => assert.equal(address, "1.1.1.1"));
      const request = new EventEmitter() as EventEmitter & { end(): void };
      request.end = () => {
        const headers: Record<string, string> = { "content-type": "image/png" };
        if (redirectPrivate) headers.location = "https://private.example/banner.png";
        const response = Object.assign(new PassThrough(), {
          statusCode: redirectPrivate ? 302 : 200,
          headers,
        });
        callback(response);
        if (!response.destroyed) response.end(bytes);
      };
      return request;
    }) as unknown as EditorialImageNetwork["request"],
  };
  assert.deepEqual(
    await measureAdvertisingImageUrl("https://creative.example/banner.png", network),
    { imageWidth: 640, imageHeight: 120 },
  );
  redirectPrivate = true;
  await assert.rejects(
    measureAdvertisingImageUrl("https://creative.example/banner.png", network),
    /image-unsafe-address/,
  );
});
