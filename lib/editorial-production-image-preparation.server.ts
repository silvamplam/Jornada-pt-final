import { createHash } from "node:crypto";
import { editorialImageOriginalPath } from "./editorial-image-authority";
import type { FrozenImage } from "./editorial-image-freeze.server";
import { safeEditorialSourceUrl } from "./editorial-image-download.server";

export type ProductionImageRow = { id: string; dossier_id: string; frozen_url: string; source_url: string | null };
export type PreparedProductionImage = { publicUrl: string; decisionKey: string | null; sha256: string | null };

export function normalizeProductionImageSource(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname.toLowerCase() === "img.iol.pt") {
      const match = url.pathname.match(/^\/preset\/([0-9a-f]{24})\/og\/[^/]+\/?$/iu);
      if (match) {
        return `https://img.iol.pt/image/id/${match[1]}/1024.jpg`;
      }
    }
  } catch {
    return value;
  }
  return value;
}

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
  const rawSource = row.source_url ?? row.frozen_url;
  const source = normalizeProductionImageSource(rawSource);
  const normalizedSourceChanged = source !== rawSource;
  if (!input.revisionKey && !normalizedSourceChanged && editorialImageOriginalPath(row.frozen_url, transport.origin)) {
    await transport.registerLocal(row.frozen_url);
    return { publicUrl: row.frozen_url, decisionKey: null, sha256: null };
  }
  safeEditorialSourceUrl(source);
  const prefix = `production-image-v1:${row.id}:${createHash("sha256").update(source).digest("hex")}`;
  // The durable identity belongs to the dossier image/source, not a browser or
  // render. Explicit reacquisition is the only operation that starts a revision.
  const key = input.revisionKey ? `${prefix}:${input.revisionKey}`
    : await transport.latestDecision(prefix) ?? prefix;
  const image = await transport.freeze(key, source);
  return { publicUrl: image.publicUrl, decisionKey: key, sha256: image.sha256 };
}
