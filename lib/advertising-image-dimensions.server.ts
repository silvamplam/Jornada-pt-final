import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  downloadFrozenEditorialImage,
  validateEditorialImageBytes,
  type EditorialImageNetwork,
} from "./editorial-image-download.server";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type AdvertisingImageDimensions = {
  imageWidth: number;
  imageHeight: number;
};

export async function measureAdvertisingImageBytes(
  bytes: Uint8Array,
  contentType?: string,
): Promise<AdvertisingImageDimensions> {
  await validateEditorialImageBytes(bytes, contentType);
  const { width, height, orientation } = await sharp(bytes).metadata();
  if (!width || !height) throw new Error("image-invalid-dimensions");
  // Browsers display EXIF-rotated JPEGs with the axes swapped.
  const rotated = orientation !== undefined && orientation >= 5 && orientation <= 8;
  return {
    imageWidth: rotated ? height : width,
    imageHeight: rotated ? width : height,
  };
}

async function readPublicImage(url: string): Promise<Uint8Array> {
  const pathname = new URL(url, "https://jornada.pt").pathname;
  const decoded = decodeURIComponent(pathname);
  if (!decoded.startsWith("/") || decoded.includes("\0")) {
    throw new Error("image-unsafe-local-path");
  }
  const publicRoot = await realpath(path.join(process.cwd(), "public"));
  const filePath = await realpath(path.resolve(publicRoot, `.${decoded}`));
  if (!filePath.startsWith(publicRoot + path.sep)) {
    throw new Error("image-unsafe-local-path");
  }
  const file = await stat(filePath);
  if (!file.isFile() || !file.size || file.size > MAX_IMAGE_BYTES) {
    throw new Error("image-invalid-byte-size");
  }
  return readFile(filePath);
}

export async function measureAdvertisingImageUrl(
  imageUrl: string,
  network?: EditorialImageNetwork,
): Promise<AdvertisingImageDimensions> {
  if (imageUrl.startsWith("/") && !imageUrl.startsWith("//")) {
    return measureAdvertisingImageBytes(await readPublicImage(imageUrl));
  }
  const downloaded = await downloadFrozenEditorialImage(imageUrl, network);
  return measureAdvertisingImageBytes(downloaded.bytes, downloaded.contentType);
}
