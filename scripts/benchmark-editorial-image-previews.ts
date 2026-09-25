import sharp from "sharp";
import { generateEditorialImagePreviews } from "../lib/editorial-image-preview-generator.server";

// Deterministic synthetic raster, no production assets or network access.
export async function syntheticEditorialImage(width = 2400, height = 1600) {
  const rgb = Buffer.alloc(width * height * 3);
  let seed = 123456789;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed >>> 24) % 36;
    const i = (y * width + x) * 3;
    rgb[i] = (Math.floor(x * 180 / width) + noise + (y % 80 < 40 ? 40 : 0)) % 256;
    rgb[i + 1] = (Math.floor(y * 190 / height) + noise + (x % 120 < 60 ? 30 : 0)) % 256;
    rgb[i + 2] = (80 + Math.floor(70 * Math.sin(x / 70)) + noise) % 256;
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({ quality: 94 }).toBuffer();
}

async function main() {
  const original = await syntheticEditorialImage();
  const derivatives = await generateEditorialImagePreviews(original);
  const rows = [];
  for (const [variant, bytes] of [["original", original], ...derivatives.map((d) => ["w" + d.width, d.bytes])] as [string, Buffer][]) {
    const info = await sharp(bytes).metadata();
    rows.push({ variant, width: info.width, height: info.height, bytes: bytes.length,
      reductionPercent: Number((100 * (1 - bytes.length / original.length)).toFixed(2)) });
  }
  console.log(JSON.stringify(rows, null, 2));
}
if (process.argv[1]?.endsWith("benchmark-editorial-image-previews.ts")) void main();
