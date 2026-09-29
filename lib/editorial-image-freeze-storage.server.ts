import { createEditorialPreviewStorage } from "./editorial-image-preview-storage.server";
import { freezeEditorialImage, type FrozenImage, type ImageDecision, type ImageFreezeTransport } from "./editorial-image-freeze.server";
import { downloadFrozenEditorialImage, validateEditorialImageBytes } from "./editorial-image-download.server";
import { editorialImageOriginalPath } from "./editorial-image-authority";
import { editorialStorageOrigin, PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "./editorial-image-preview";
import { ensureEditorialImagePreviews } from "./editorial-image-preview-generation.server";
import { createHash } from "node:crypto";

export function createImageFreezeStorage(config: { url: string; serviceRoleKey: string }, fetcher: typeof fetch = fetch) {
  const origin = editorialStorageOrigin(config.url);
  if (!origin || !config.serviceRoleKey) throw new Error("image-missing-config");
  const previews = createEditorialPreviewStorage(config, fetcher);
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetcher(`${origin}/${path}`, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, ...init.headers } });
    return response;
  }
  async function json(path: string, init: RequestInit = {}) {
    const response = await request(`rest/v1/${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    if (!response.ok) throw new Error(`image-persistence-failed:${response.status}:${await response.text()}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function register(image: FrozenImage) {
    await json("editorial_image_assets?on_conflict=public_url", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ public_url: image.publicUrl, storage_path: image.path, sha256: image.sha256, byte_size: image.byteSize, content_type: image.contentType }) });
  }
  const transport: ImageFreezeTransport = {
    origin, previews, download: downloadFrozenEditorialImage,
    async claim(key, sourceUrl) {
      const rows = await json("editorial_image_decisions?on_conflict=decision_key", { method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ decision_key: key, source_url: sourceUrl }) });
      const owned = rows.length === 1;
      const row = owned ? rows[0] : (await json(`editorial_image_decisions?decision_key=eq.${encodeURIComponent(key)}&limit=1`))[0];
      if (!row) throw new Error("image-decision-missing");
      return { owned, decision: { key: row.decision_key, sourceUrl: row.source_url, state: row.state, image: row.image } as ImageDecision };
    },
    async bind(key, image) {
      await json(`editorial_image_decisions?decision_key=eq.${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({ image, state: "candidate" }) });
    },
    async finish(key, image) {
      await register(image);
      await json(`editorial_image_decisions?decision_key=eq.${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({ state: "ready" }) });
    },
    async originalExists(path) {
      const response = await request(`storage/v1/object/editorial-images/${path}`, { method: "HEAD" });
      if (response.ok) return true;
      if ([400,404].includes(response.status)) return false;
      throw new Error(`image-storage-head:${response.status}`);
    },
    async writeOriginal(image, bytes) {
      const response = await request(`storage/v1/object/editorial-images/${image.path}`, { method: "POST",
        headers: { "Content-Type": image.contentType, "Cache-Control": "max-age=31536000", "x-upsert": "false" }, body: new Uint8Array(bytes) });
      if (response.ok) return "created";
      const error = await response.json().catch(() => null);
      if ([400,409].includes(response.status) && (error?.error === "Duplicate" || error?.code === "Duplicate" || /already exists/i.test(error?.message ?? ""))) return "exists";
      throw new Error(`image-storage-upload:${response.status}`);
    },
  };
  return {
    transport,
    freeze: (key: string, source: string) => freezeEditorialImage(key, source, transport),
    async registerLocal(url: string) {
      const path = editorialImageOriginalPath(url, origin);
      if (!path) throw new Error("image-materialization-required");
      if ((await json(`editorial_image_assets?public_url=eq.${encodeURIComponent(url)}&select=public_url&limit=1`)).length) return;
      const bytes = await previews.readOriginal(path);
      const extension = await validateEditorialImageBytes(bytes);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (path.startsWith("editorial/sha256/") && path !== `editorial/sha256/${sha256}.${extension}`) throw new Error("image-candidate-hash-mismatch");
      const result = await ensureEditorialImagePreviews(path, previews, bytes, PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
      if (!result.ok) throw new Error("image-previews-incomplete");
      await register({ path, publicUrl: url, sha256, byteSize: bytes.byteLength, contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}` });
    },
  };
}
