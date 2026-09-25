import { parsePreviewBackfillArgs, assertPreviewBackfillWriteGuard, backfillEditorialImagePreviews } from "../lib/editorial-image-preview-backfill.server";
import { createEditorialPreviewStorage } from "../lib/editorial-image-preview-storage.server";
import { editorialStorageOrigin } from "../lib/editorial-image-preview";

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run images:backfill -- --prefix editorial/YYYY/MM [--limit 20 (max 100)] [--offset 0] [--execute]");
    console.log("Dry-run is the default. Writes ALSO require JORNADA_PREVIEW_BACKFILL_WRITE=allow:<configured-hostname>.");
    return;
  }
  const options = parsePreviewBackfillArgs(process.argv.slice(2));
  const origin = editorialStorageOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !key) throw new Error("missing-storage-environment");
  assertPreviewBackfillWriteGuard(options, new URL(origin).hostname, process.env.JORNADA_PREVIEW_BACKFILL_WRITE);
  // No network request is possible before options, origin and the write guard pass.
  const storage = createEditorialPreviewStorage({ url: origin, serviceRoleKey: key });
  const report = await backfillEditorialImagePreviews(storage, options, (entry) => console.log(JSON.stringify(entry)));
  console.log(JSON.stringify(report));
  if (report.failed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "backfill-failed");
  process.exitCode = 1;
});
