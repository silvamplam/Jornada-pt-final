import { EDITORIAL_PREVIEW_BUCKET, editorialPreviewPath, editorialStorageOrigin, isEditorialPreviewOriginalPath } from "./editorial-image-preview";
import { EDITORIAL_PREVIEW_MAX_BYTES } from "./editorial-image-preview-generator.server";

export type PreviewStorageEntry = { name: string; id: string | null; metadata?: { size?: number; mimetype?: string } | null };
export interface EditorialPreviewStorage {
  exists(path: string): Promise<boolean>;
  readOriginal(path: string): Promise<Uint8Array>;
  writePreview(path: string, bytes: Uint8Array): Promise<"created" | "exists">;
  list(prefix: string, limit: number, offset: number): Promise<PreviewStorageEntry[]>;
}
export const EDITORIAL_PREVIEW_CACHE_CONTROL = "max-age=31536000";
const monthPrefix = /^editorial\/20\d{2}\/(?:0[1-9]|1[0-2])$/;
export function isEditorialPreviewMonth(prefix: string) { return monthPrefix.test(prefix); }

function isPreviewPath(path: string) {
  const match = /^previews\/v1\/(.+)\/w(320|640)\.webp$/.exec(path);
  return Boolean(match && editorialPreviewPath(match[1], Number(match[2]) as 320 | 640) === path);
}

export function createEditorialPreviewStorage(
  config: { url: string; serviceRoleKey: string },
  fetcher: typeof fetch = fetch,
): EditorialPreviewStorage {
  const origin = editorialStorageOrigin(config.url);
  if (!origin || !config.serviceRoleKey) throw new Error("preview-missing-storage-config");
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` };
  async function request(suffix: string, init: RequestInit = {}) {
    return fetcher(`${origin}/storage/v1/${suffix}`, {
      ...init, headers: { ...headers, ...init.headers },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
  }
  return {
    async exists(path) {
      if (!isPreviewPath(path)) throw new Error("preview-invalid-path");
      const response = await request(`object/${EDITORIAL_PREVIEW_BUCKET}/${path}`, { method: "HEAD" });
      if (response.ok) return true;
      // Matches storage-js exists(): missing objects can return 400 or 404.
      if ([400, 404].includes(response.status)) return false;
      throw new Error(`preview-exists-http-${response.status}`);
    },
    async readOriginal(path) {
      if (!isEditorialPreviewOriginalPath(path)) throw new Error("preview-invalid-original");
      const response = await request(`object/${EDITORIAL_PREVIEW_BUCKET}/${path}`);
      if (!response.ok || !response.body) throw new Error(`preview-download-http-${response.status}`);
      const type = response.headers.get("content-type")?.split(";")[0];
      if (!type || !["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"].includes(type)) {
        await response.body.cancel();
        throw new Error("preview-invalid-content-type");
      }
      if (Number(response.headers.get("content-length")) > EDITORIAL_PREVIEW_MAX_BYTES) {
        await response.body.cancel();
        throw new Error("preview-invalid-byte-size");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > EDITORIAL_PREVIEW_MAX_BYTES) throw new Error("preview-invalid-byte-size");
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks);
    },
    async writePreview(path, bytes) {
      if (!isPreviewPath(path) || !bytes.byteLength || bytes.byteLength > EDITORIAL_PREVIEW_MAX_BYTES) {
        throw new Error("preview-invalid-output");
      }
      const response = await request(`object/${EDITORIAL_PREVIEW_BUCKET}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "image/webp", "Cache-Control": EDITORIAL_PREVIEW_CACHE_CONTROL, "x-upsert": "false" },
        body: new Uint8Array(bytes),
      });
      if (response.ok) return "created";
      const error = await response.json().catch(() => null);
      if ([400, 409].includes(response.status) && (error?.error === "Duplicate" || error?.code === "Duplicate" || /already exists/i.test(error?.message ?? ""))) {
        return "exists"; // A concurrent writer won; never overwrite it.
      }
      throw new Error(`preview-upload-http-${response.status}`);
    },
    async list(prefix, limit, offset) {
      if (!isEditorialPreviewMonth(prefix) || !Number.isInteger(limit) || limit < 1 || limit > 100
        || !Number.isSafeInteger(offset) || offset < 0) throw new Error("preview-invalid-list-options");
      const response = await request(`object/list/${EDITORIAL_PREVIEW_BUCKET}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefix + "/", limit, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!response.ok) throw new Error(`preview-list-http-${response.status}`);
      const entries: unknown = await response.json();
      if (!Array.isArray(entries) || entries.length > limit) throw new Error("preview-invalid-list-response");
      return entries as PreviewStorageEntry[];
    },
  };
}
