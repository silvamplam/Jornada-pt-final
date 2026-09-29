// Intentionally offline: produces reviewable staging requests, never executes them.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { prepareImageReplacement, type ReplacementInput, type ReplacementSnapshot } from "../lib/editorial-image-replacement.server";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3) throw new Error("Usage: prepare-editorial-image-replacements.ts approvals.json remote-snapshot.json output-directory (offline dry-run only)");
  const [inputFile, snapshotFile, output] = args;
  const inputs: ReplacementInput[] = JSON.parse(await readFile(inputFile, "utf8"));
  const snapshot: ReplacementSnapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
  if (new Set(inputs.map(i => i.articleId)).size !== inputs.length || new Set(inputs.map(i => i.decisionKey)).size !== inputs.length) throw new Error("replacement-duplicate-target");
  const prepared = [];
  // Validate ALL targets before writing any staging bundle. An error is never a partial ready plan.
  for (const input of inputs) prepared.push({ input, result: await prepareImageReplacement(input, await readFile(input.localFile), snapshot) });
  const objects = new Map(prepared.flatMap(p => p.result.uploads.map(o => [o.path, o] as const)));
  await mkdir(resolve(output, "objects"), { recursive: true });
  const staging = [];
  for (const [path, object] of objects) {
    const sha256 = createHash("sha256").update(object.bytes).digest("hex");
    const file = join(resolve(output), "objects", sha256);
    try { await writeFile(file, object.bytes, { flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || createHash("sha256").update(await readFile(file)).digest("hex") !== sha256) throw error;
    }
    staging.push({ method: "POST", path: `storage/v1/object/editorial-images/${path}`, bodyFile: file,
      bytes: object.bytes.byteLength, sha256, headers: { ...object.headers, "Content-Type": object.contentType } });
  }
  const report = { dryRun: true, conflicts: [], articles: prepared.length, assetsExisting: prepared.filter(p => p.result.existingAsset).length,
    assetsNew: prepared.filter(p => !p.result.existingAsset).length, newObjects: objects.size,
    uploadBytes: staging.reduce((n, o) => n + o.bytes, 0), sourceDownloads: 0, storageBytesRead: 0, remoteWrites: 0,
    stagingOrder: ["upload missing immutable objects", "register new asset receipts", "register replacement decisions using RPC", "review checkpoint", "promote all targets in one SQL transaction"],
    staging, replacements: prepared.map(({ input, result }) => ({ ...input, image: result.image, existingAsset: result.existingAsset,
      assetReceipt: { public_url: result.image.publicUrl, storage_path: result.image.path, sha256: result.image.sha256,
        byte_size: result.image.byteSize, content_type: result.image.contentType },
      registrationRpc: "editorial_register_image_replacement_v1", registration: result.registration,
      promotionRpc: "editorial_promote_image_v2", promotion: result.promotion, articlePatch: result.articlePatch })) };
  await writeFile(join(output, "dry-run.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ articles: report.articles, conflicts: 0, existingAssets: report.assetsExisting,
    newAssets: report.assetsNew, newObjects: report.newObjects, uploadBytes: report.uploadBytes, remoteWrites: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
