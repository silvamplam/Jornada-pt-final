import { createHash } from "node:crypto";
import { editorialImageOriginalPath } from "./editorial-image-authority";
import type { FrozenImage } from "./editorial-image-freeze.server";
import { safeEditorialSourceUrl } from "./editorial-image-download.server";

export type ProductionImageRow = { id: string; dossier_id: string; frozen_url: string; source_url: string | null };
export type PreparedProductionImage = { publicUrl: string; decisionKey: string | null; sha256: string | null };

export async function prepareProductionImage(
  input: { dossierId: string; imageId: string; revisionKey?: string },
  transport: {
    origin: string;
    readImage(id: string): Promise<ProductionImageRow | null>;
    latestDecision(prefix: string): Promise<string | null>;
    registerLocal(url: string): Promise<void>;
    freeze(key: string, source: string): Promise<FrozenImage>;
  },
): Promise<PreparedProductionImage> {
  const row = await transport.readImage(input.imageId);
  if (!row || row.dossier_id !== input.dossierId) throw new Error("image-not-in-dossier");
  if (!input.revisionKey && editorialImageOriginalPath(row.frozen_url, transport.origin)) {
    await transport.registerLocal(row.frozen_url);
    return { publicUrl: row.frozen_url, decisionKey: null, sha256: null };
  }
  const source = row.source_url ?? row.frozen_url;
  safeEditorialSourceUrl(source);
  const prefix = `production-image-v1:${row.id}:${createHash("sha256").update(source).digest("hex")}`;
  // The durable identity belongs to the dossier image/source, not a browser or
  // render. Explicit reacquisition is the only operation that starts a revision.
  const key = input.revisionKey ? `${prefix}:${input.revisionKey}`
    : await transport.latestDecision(prefix) ?? prefix;
  const image = await transport.freeze(key, source);
  return { publicUrl: image.publicUrl, decisionKey: key, sha256: image.sha256 };
}
