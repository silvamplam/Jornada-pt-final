import sharp from "sharp";
import { syntheticEditorialImage } from "./benchmark-editorial-image-previews";
import { generateEditorialImagePreviews } from "../lib/editorial-image-preview-generator.server";
import { PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "../lib/editorial-image-preview";

export async function benchmarkPublicEditorialPreviews() {
  const original = await syntheticEditorialImage();
  const derivatives = await generateEditorialImagePreviews(original, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
  const reduction = (before: number, after: number) => Number((100 * (1 - after / before)).toFixed(2));
  const assets = await Promise.all(([{ variant: "original", bytes: original }, ...derivatives.map((d) => ({ variant: `w${d.width}`, bytes: d.bytes }))]).map(async ({ variant, bytes }) => {
    const info = await sharp(bytes).metadata();
    return { variant, width: info.width, height: info.height, bytes: bytes.length, reductionPercent: reduction(original.length, bytes.length) };
  }));
  const page = (name: string, widths: number[]) => {
    const before = original.length * widths.length;
    const after = widths.reduce((sum, width) => sum + derivatives.find((d) => d.width === width)!.bytes.length, 0);
    return { name, widths, before, after, reductionPercent: reduction(before, after) };
  };
  // Logos are deliberately unchanged in A3. Include an honest zero-saving strip
  // baseline, using a transparent synthetic shield (never a production asset).
  const rgba = Buffer.alloc(512 * 512 * 4);
  for (let y = 32; y < 480; y++) for (let x = 32; x < 480; x++) {
    if (y > 300 && Math.abs(x - 256) > (480 - y) * 1.24) continue;
    const i = (y * 512 + x) * 4;
    rgba[i] = x % 64 < 32 ? 170 : 245; rgba[i + 1] = x % 64 < 32 ? 20 : 245;
    rgba[i + 2] = x % 64 < 32 ? 30 : 245; rgba[i + 3] = 255;
  }
  const logo = await sharp(rgba, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
  return { assets, pages: [
    page("Jornada: abertura + 8 cartões + 4 miniaturas (assets distintos)", [1280, ...Array(8).fill(640), ...Array(4).fill(320)]),
    page("Notícia: principal + 4 relacionados (assets distintos)", [1280, ...Array(4).fill(320)]),
  ], unchangedLogos: { width: 512, height: 512, originalBytes: logo.length, count: 10,
    stripBefore: logo.length * 10, stripAfter: logo.length * 10, reductionPercent: 0 },
    note: "Synthetic bytes only, not a production traffic estimate. Team/TV logos remain unchanged: zero saving claimed." };
}
if (process.argv[1]?.endsWith("benchmark-public-editorial-previews.ts")) {
  void benchmarkPublicEditorialPreviews().then((result) => console.log(JSON.stringify(result, null, 2)));
}
