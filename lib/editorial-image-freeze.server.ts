import { createHash } from "node:crypto";
import { ensureEditorialImagePreviews } from "./editorial-image-preview-generation.server";
import { PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "./editorial-image-preview";
import type { EditorialPreviewStorage } from "./editorial-image-preview-storage.server";
import { validateEditorialImageBytes } from "./editorial-image-download.server";

export type FrozenImage = { path: string; sha256: string; byteSize: number; contentType: string; publicUrl: string };
export type ImageDecision = { key: string; sourceUrl: string; state: "acquiring" | "candidate" | "ready"; image: FrozenImage | null };
export interface ImageFreezeTransport {
  origin: string;
  previews: EditorialPreviewStorage;
  claim(key: string, sourceUrl: string): Promise<{ owned: boolean; decision: ImageDecision }>;
  bind(key: string, image: FrozenImage): Promise<void>;
  finish(key: string, image: FrozenImage): Promise<void>;
  writeOriginal(image: FrozenImage, bytes: Uint8Array): Promise<"created" | "exists">;
  originalExists(path: string): Promise<boolean>;
  recoverCandidateBytes?(image: FrozenImage): Promise<Uint8Array>;
  download(sourceUrl: string): Promise<{ bytes: Uint8Array; contentType: string }>;
}
export function frozenImageForBytes(bytes: Uint8Array, extension: string, origin: string): FrozenImage {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `editorial/sha256/${sha256}.${extension}`;
  return { path, sha256, byteSize: bytes.byteLength, contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}`,
    publicUrl: `${origin}/storage/v1/object/public/editorial-images/${path}` };
}

/** A decision is claimed BEFORE the network request, and bound BEFORE upload.
 * Existing claims never download. An interrupted acquisition with no durable
 * original requires an explicit new decision; it cannot silently become B. */
export async function freezeEditorialImage(key: string, sourceUrl: string, transport: ImageFreezeTransport): Promise<FrozenImage> {
  if (!/^[a-zA-Z0-9:_.-]{1,200}$/.test(key)) throw new Error("image-invalid-decision-key");
  const { owned, decision } = await transport.claim(key, sourceUrl);
  if (decision.sourceUrl !== sourceUrl) throw new Error("image-decision-source-conflict");
  if (decision.state === "ready" && decision.image) return decision.image;
  let image = decision.image;
  let bytes: Uint8Array | undefined;
  if (owned) {
    const downloaded = await transport.download(sourceUrl);
    bytes = downloaded.bytes;
    const extension = await validateEditorialImageBytes(bytes, downloaded.contentType);
    image = frozenImageForBytes(bytes, extension, transport.origin);
    await transport.bind(key, image);
    await transport.writeOriginal(image, bytes);
  } else if (!image || !await transport.originalExists(image.path)) {
    if (!image || !transport.recoverCandidateBytes) {
      throw new Error("image-acquisition-incomplete: Inicie explicitamente uma nova obtenção da imagem.");
    }
    // Historical snapshots already have durable local bytes. Recovery may use
    // only those exact bytes, never download the source again.
    bytes = await transport.recoverCandidateBytes(image);
    if (createHash("sha256").update(bytes).digest("hex") !== image.sha256) throw new Error("image-candidate-hash-mismatch");
    await transport.writeOriginal(image, bytes);
  }
  if (!image) throw new Error("image-candidate-missing");
  // On the normal path the very same external bytes feed both uploads. Only
  // crash recovery may read the durable original, and its hash is verified.
  const storage: EditorialPreviewStorage = { ...transport.previews, async readOriginal(path) {
    const recovered = await transport.previews.readOriginal(path);
    if (createHash("sha256").update(recovered).digest("hex") !== image!.sha256) throw new Error("image-candidate-hash-mismatch");
    return recovered;
  } };
  const result = await ensureEditorialImagePreviews(image.path, storage, bytes, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
  if (!result.ok) throw new Error(`image-previews-incomplete:${result.error}`);
  await transport.finish(key, image);
  return image;
}
