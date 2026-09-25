import { EDITORIAL_PREVIEW_WIDTHS, PUBLIC_EDITORIAL_PREVIEW_WIDTHS, editorialPreviewPath, isEditorialPreviewOriginalPath, type EditorialPreviewWidth } from "./editorial-image-preview";
import { ensureEditorialImagePreviews } from "./editorial-image-preview-generation.server";
import { EDITORIAL_PREVIEW_MAX_BYTES } from "./editorial-image-preview-generator.server";
import { isEditorialPreviewMonth, type EditorialPreviewStorage } from "./editorial-image-preview-storage.server";

export type PreviewBackfillOptions = { prefix: string; limit: number; offset: number; execute: boolean; widths?: EditorialPreviewWidth[] };
export function parsePreviewBackfillArgs(args: string[]): PreviewBackfillOptions {
  const result: PreviewBackfillOptions = { prefix: "", limit: 20, offset: 0, execute: false };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error("duplicate-option");
    seen.add(arg);
    if (arg === "--execute") result.execute = true;
    else if (arg === "--prefix") result.prefix = args[++i] ?? "";
    else if (arg === "--limit") result.limit = Number(args[++i]);
    else if (arg === "--offset") result.offset = Number(args[++i]);
    else if (arg === "--widths") {
      const widths = (args[++i] ?? "").split(",").map(Number);
      if (!widths.length || widths.some((width) => !PUBLIC_EDITORIAL_PREVIEW_WIDTHS.includes(width as EditorialPreviewWidth))) throw new Error("invalid-preview-widths");
      result.widths = [...new Set(widths)].sort((a, b) => a - b) as EditorialPreviewWidth[];
    }
    else throw new Error("unknown-option: " + arg);
  }
  if (!isEditorialPreviewMonth(result.prefix) || !Number.isInteger(result.limit) || result.limit < 1 || result.limit > 100
    || !Number.isSafeInteger(result.offset) || result.offset < 0) throw new Error("invalid-backfill-options");
  return result;
}

export function assertPreviewBackfillWriteGuard(options: PreviewBackfillOptions, hostname: string, confirmation?: string) {
  if (options.execute && confirmation !== "allow:" + hostname) throw new Error("backfill-write-not-confirmed");
}

export async function backfillEditorialImagePreviews(
  storage: EditorialPreviewStorage,
  options: PreviewBackfillOptions,
  report: (entry: Record<string, unknown>) => void = console.log,
) {
  // Validate even when called without the CLI.
  parsePreviewBackfillArgs(["--prefix", options.prefix, "--limit", String(options.limit), "--offset", String(options.offset)]);
  const widths = options.widths ?? EDITORIAL_PREVIEW_WIDTHS;
  if (!widths.length || widths.some((width) => !PUBLIC_EDITORIAL_PREVIEW_WIDTHS.includes(width))) throw new Error("invalid-preview-widths");
  const totals = {
    mode: options.execute ? "execute" : "dry-run",
    found: 0, alreadyExisting: 0, created: 0, skipped: 0, failed: 0, planned: 0,
    previewsCreated: 0, originalBytesProcessed: 0, previewBytesGenerated: 0,
    nextOffset: null as number | null,
  };
  const entries = await storage.list(options.prefix, options.limit, options.offset);
  totals.nextOffset = entries.length === options.limit ? options.offset + entries.length : null;
  for (const entry of entries) {
    totals.found++;
    const path = options.prefix + "/" + entry.name;
    if (!entry.id || !isEditorialPreviewOriginalPath(path)
      || (entry.metadata?.size ?? 0) > EDITORIAL_PREVIEW_MAX_BYTES
      || (entry.metadata?.mimetype && !["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"].includes(entry.metadata.mimetype))) {
      totals.skipped++;
      report({ path, status: "skipped", reason: "ineligible-path-format-or-size" });
      continue;
    }
    try {
      const missing: string[] = [];
      for (const width of widths) {
        const preview = editorialPreviewPath(path, width)!;
        if (!await storage.exists(preview)) missing.push(preview);
      }
      if (!missing.length) {
        totals.alreadyExisting++;
        report({ path, status: "already-existing" });
      } else if (!options.execute) {
        totals.planned++;
        report({ path, status: "planned", missing, originalBytes: entry.metadata?.size ?? null });
      } else {
        const result = await ensureEditorialImagePreviews(path, storage, undefined, widths);
        totals.originalBytesProcessed += result.originalBytes;
        totals.previewBytesGenerated += result.previewBytes;
        totals.previewsCreated += result.created;
        if (result.ok) {
          if (result.created) totals.created++;
          else totals.alreadyExisting++;
        } else totals.failed++;
        report({ path, status: result.ok ? "complete" : "failed", ...result });
      }
    } catch (error) {
      totals.failed++;
      report({ path, status: "failed", error: error instanceof Error ? error.message : "backfill-failed" });
    }
  }
  return totals;
}
