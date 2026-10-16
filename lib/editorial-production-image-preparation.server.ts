import { createHash } from "node:crypto";
import { editorialImageOriginalPath } from "./editorial-image-authority";
import type { FrozenImage } from "./editorial-image-freeze.server";
import { safeEditorialSourceUrl } from "./editorial-image-download.server";
import { resolveEditorialImageSource } from "./editorial-image-source.server";

export type ProductionImageRow = { id: string; dossier_id: string; frozen_url: string; source_url: string | null; newsroom_article_id?: string | null };
export type PreparedProductionImage = { publicUrl: string; decisionKey: string | null; sha256: string | null };

export async function prepareProductionImage(
  input: { dossierId: string; imageId: string; revisionKey?: string },
  transport: {
    origin: string;
    readImage(id: string): Promise<ProductionImageRow | null>;
    latestDecision(prefix: string): Promise<string | null>;
    registerLocal(url: string): Promise<void>;
    resolveSource?(source: string): Promise<string>;
    freeze(key: string, source: string, acquisitionUrl?: string): Promise<FrozenImage>;
  },
): Promise<PreparedProductionImage> {
  const row = await transport.readImage(input.imageId);
  if (!row || row.dossier_id !== input.dossierId) throw new Error("image-not-in-dossier");
  const source = row.source_url ?? row.frozen_url;
  safeEditorialSourceUrl(source);
  const local = editorialImageOriginalPath(row.frozen_url, transport.origin);
  const prefix = `production-image-v2:${row.id}:${createHash("sha256").update(source).digest("hex")}`;
  let existing = !input.revisionKey ? await transport.latestDecision(prefix) : null;
  let acquisitionUrl: string | undefined;
  if (!existing) {
    acquisitionUrl = editorialImageOriginalPath(source, transport.origin) && !row.newsroom_article_id ? source
      : await (transport.resolveSource ?? resolveEditorialImageSource)(source);
    // Old local copies with external provenance must be checked before reuse.
    if (!input.revisionKey && local && acquisitionUrl === source) {
      await transport.registerLocal(row.frozen_url);
      return { publicUrl: row.frozen_url, decisionKey: null, sha256: null };
    }
    if (!input.revisionKey && acquisitionUrl === source) {
      // Preserve legitimate pre-v2 decisions only after checking their source;
      // social renditions must never reuse an older branded candidate.
      existing = await transport.latestDecision(prefix.replace("production-image-v2:", "production-image-v1:"));
    }
  }
  const key = input.revisionKey ? `${prefix}:${input.revisionKey}` : existing ?? prefix;
  // The original source remains the decision's provenance and matches the
  // confirmation RPC. acquisitionUrl is separate, never a replacement for it.
  const image = await transport.freeze(key, source, acquisitionUrl);
  return { publicUrl: image.publicUrl, decisionKey: key, sha256: image.sha256 };
}
