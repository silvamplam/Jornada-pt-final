import { mkdir, readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { downloadFrozenEditorialImage } from "../lib/editorial-image-download.server";
import { frozenImageForBytes } from "../lib/editorial-image-freeze.server";
import { createImageFreezeStorage } from "../lib/editorial-image-freeze-storage.server";
import { generateEditorialImagePreviews } from "../lib/editorial-image-preview-generator.server";
import { PUBLIC_EDITORIAL_PREVIEW_WIDTHS, editorialStorageOrigin } from "../lib/editorial-image-preview";
import { editorialImageOriginalPath } from "../lib/editorial-image-authority";
import { imageMigrationSummary, imagePromotionPlan, imageReviewHtml, type HistoricalImageArticle, type HistoricalImageCandidate, type ImageReview } from "../lib/editorial-image-migration";

type Manifest = { version: 1; runId: string; origin: string; observedAt: string; totalPublished: number; unaffected: number; articles: HistoricalImageArticle[]; candidates: HistoricalImageCandidate[] };
const args = process.argv.slice(2);
function option(name: string, fallback?: string) { const i = args.indexOf(name); return i < 0 ? fallback : args[i+1]; }
async function main() {
  if (args.includes("--help")) {
    console.log("tsx scripts/migrate-editorial-images.ts [--dir out/image-freeze/historical] [--phase snapshot|promote] [--reviews file.json] [--execute]");
    console.log("Default: snapshot dry-run; reads production, downloads each source at most once into an immutable local cache, generates four previews and review.html. No remote writes. Existing manifests/failed acquisitions are never refreshed implicitly.");
    console.log("Execution ALSO requires JORNADA_IMAGE_MIGRATION_WRITE=allow:<configured-hostname>. New acquisition requires a NEW --dir and a new visual review. Promotion defaults to dry-run and requires reviews bound to article/source/hash/reviewer.");
    return;
  }
  const known = new Set(["--dir","--phase","--reviews","--execute"]);
  for (let i=0;i<args.length;i++) { if (!known.has(args[i])) throw new Error(`unknown-option:${args[i]}`); if (args[i] !== "--execute") { if (!args[++i] || args[i].startsWith("--")) throw new Error("missing-option-value"); } }
  const execute = args.includes("--execute"), phase = option("--phase","snapshot");
  if (!["snapshot","promote"].includes(phase!)) throw new Error("invalid-phase");
  const origin = editorialStorageOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL), serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !serviceRoleKey) throw new Error("missing-environment");
  if (execute && process.env.JORNADA_IMAGE_MIGRATION_WRITE !== `allow:${new URL(origin).hostname}`) throw new Error("migration-write-not-authorized");
  const directory = path.resolve(option("--dir","out/image-freeze/historical")!);
  await mkdir(directory,{recursive:true});
  const lockPath = path.join(directory,"run.lock");
  const lock = await open(lockPath,"wx").catch(() => { throw new Error("migration-already-running: if a process crashed, inspect the manifest before removing run.lock"); });
  try {
    const manifestPath = path.join(directory,"manifest.json");
    async function save(manifest: Manifest) { await writeFile(manifestPath+".tmp",JSON.stringify(manifest,null,2)); await rename(manifestPath+".tmp",manifestPath); }
    async function rest(resource: string, init: RequestInit = {}) {
      const response = await fetch(`${origin}/rest/v1/${resource}`, { ...init, redirect:"error", signal:AbortSignal.timeout(30000), headers:{apikey:serviceRoleKey!,Authorization:`Bearer ${serviceRoleKey}`,"Content-Type":"application/json",...init.headers} });
      if(!response.ok) throw new Error(`migration-rest:${response.status}:${await response.text()}`);
      return response.json();
    }
    let manifest: Manifest;
    try { manifest = JSON.parse(await readFile(manifestPath,"utf8")); }
    catch(error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (phase === "promote") throw new Error("snapshot-required");
      const all: HistoricalImageArticle[] = [];
      for(let offset=0;;offset+=500) {
        const rows = await rest(`editorial_articles?select=id,slug,title,image_url&status=eq.published&order=id.asc&limit=500&offset=${offset}`);
        all.push(...rows); if(rows.length<500) break;
      }
      const articles = all.filter(a => !editorialImageOriginalPath(a.image_url,origin));
      manifest={version:1,runId:randomUUID(),origin,observedAt:new Date().toISOString(),totalPublished:all.length,unaffected:all.length-articles.length,articles,candidates:[]};
      await save(manifest);
    }
    if(manifest.version!==1 || manifest.origin!==origin) throw new Error("manifest-environment-conflict");
    const metrics={ externalBytesDownloaded:0, storageBytesUploaded:0, storageBytesRead:0, validationBodyBytes:0, objectsCreated:0, articlesPromoted:0 };
    if(phase === "snapshot") {
      await mkdir(path.join(directory,"assets"),{recursive:true});
      for(const sourceUrl of new Set(manifest.articles.map(a=>a.image_url))) {
        if(manifest.candidates.some(c=>c.sourceUrl===sourceUrl)) continue;
        const candidate: HistoricalImageCandidate={sourceUrl,decisionKey:`migration:${manifest.runId}:${createHash("sha256").update(sourceUrl).digest("hex")}`,state:"acquiring"};
        manifest.candidates.push(candidate); await save(manifest);
        try {
          const downloaded=await downloadFrozenEditorialImage(sourceUrl);
          metrics.externalBytesDownloaded+=downloaded.bytes.byteLength;
          const image=frozenImageForBytes(downloaded.bytes,downloaded.extension,origin);
          candidate.image=image; candidate.files={original:`assets/${image.sha256}.${downloaded.extension}`}; candidate.sizes={original:image.byteSize};
          await writeFile(path.join(directory,candidate.files.original),downloaded.bytes,{flag:"wx"}).catch(error=>{if(error.code!=="EEXIST")throw error;});
          const previews=await generateEditorialImagePreviews(downloaded.bytes,PUBLIC_EDITORIAL_PREVIEW_WIDTHS);
          for(const preview of previews) {
            const file=`assets/${image.sha256}-w${preview.width}.webp`;
            await writeFile(path.join(directory,file),preview.bytes,{flag:"wx"}).catch(error=>{if(error.code!=="EEXIST")throw error;});
            candidate.files[String(preview.width)]=file; candidate.sizes[String(preview.width)]=preview.bytes.byteLength;
          }
          candidate.state="ready";
        } catch(error) {candidate.state="failed";candidate.error=error instanceof Error?error.message:"download-failed";}
        await save(manifest);
        console.log(JSON.stringify({progress:manifest.candidates.length,total:new Set(manifest.articles.map(a=>a.image_url)).size,state:candidate.state}));
      }
      if(execute) {
        const storage=createImageFreezeStorage({url:origin,serviceRoleKey});
        const originalWrite=storage.transport.writeOriginal,previewWrite=storage.transport.previews.writePreview;
        storage.transport.writeOriginal=async(image,bytes)=>{const result=await originalWrite(image,bytes);if(result==="created"){metrics.objectsCreated++;metrics.storageBytesUploaded+=bytes.byteLength;}return result;};
        storage.transport.previews.writePreview=async(p,bytes)=>{const result=await previewWrite(p,bytes);if(result==="created"){metrics.objectsCreated++;metrics.storageBytesUploaded+=bytes.byteLength;}return result;};
        for(const candidate of manifest.candidates.filter(c=>c.state==="ready")) {
          const bytes=await readFile(path.join(directory,candidate.files!.original));
          if(createHash("sha256").update(bytes).digest("hex")!==candidate.image!.sha256) throw new Error("local-cache-hash-mismatch");
          // Even recovery uses our durable LOCAL cache, never a Supabase GET.
          storage.transport.download=async()=>({bytes,contentType:candidate.image!.contentType});
          storage.transport.recoverCandidateBytes=async(image)=>{if(image.sha256!==candidate.image!.sha256)throw new Error("candidate-hash-conflict");return bytes;};
          storage.transport.previews.readOriginal=async(p)=>{if(p!==candidate.image!.path)throw new Error("candidate-path-mismatch");return bytes;};
          const frozen=await storage.freeze(candidate.decisionKey,candidate.sourceUrl);
          if(frozen.sha256!==candidate.image!.sha256) throw new Error("candidate-hash-conflict");
        }
      }
    }
    const reviews: ImageReview[]=option("--reviews")?JSON.parse(await readFile(option("--reviews")!,"utf8")):[];
    const plan=imagePromotionPlan(manifest.articles,manifest.candidates,reviews);
    const promotionConflicts: { articleId: string; reason: string }[]=[];
    if(phase==="promote") {
      // Check the entire approved set before any article is changed. Each RPC
      // also compares under a row lock, covering edits made after preflight.
      for(const entry of plan.filter(p=>p.action==="promote")) {
        const [current]=await rest(`editorial_articles?select=id,status,image_url&id=eq.${encodeURIComponent(entry.article.id)}&limit=1`);
        if(!current || current.status!=="published" || ![entry.article.image_url,entry.candidate!.image!.publicUrl].includes(current.image_url)) {
          promotionConflicts.push({articleId:entry.article.id,reason:"current-reference-changed"});continue;
        }
        const registered=await rest(`editorial_image_assets?select=sha256&public_url=eq.${encodeURIComponent(entry.candidate!.image!.publicUrl)}&limit=1`);
        if(registered[0]?.sha256!==entry.candidate!.image!.sha256) promotionConflicts.push({articleId:entry.article.id,reason:"candidate-not-staged"});
      }
      for(const entry of plan.filter(p=>p.action==="promote")) {
        if(!execute || promotionConflicts.length) continue;
        await rest("rpc/editorial_promote_image_v1",{method:"POST",body:JSON.stringify({p_article_id:entry.article.id,p_source_url:entry.article.image_url,p_candidate_url:entry.candidate!.image!.publicUrl,p_sha256:entry.candidate!.image!.sha256,p_reviewer:entry.review!.reviewer})});
        metrics.articlesPromoted++;
      }
    }
    const report={phase,dryRun:!execute,promotionConflicts,observedAt:manifest.observedAt,...imageMigrationSummary(manifest.articles,manifest.candidates),
      unaffectedArticles:manifest.unaffected,totalPublished:manifest.totalPublished,approvedArticles:plan.filter(p=>p.action==="promote").length,
      reviewArticles:plan.filter(p=>p.action==="review").map(p=>({id:p.article.id,title:p.article.title,sourceUrl:p.article.image_url})),
      affectedArticles:manifest.articles.map(a=>({id:a.id,slug:a.slug})),metrics};
    await writeFile(path.join(directory,`report-${phase}-${execute?"execute":"dry-run"}.json`),JSON.stringify(report,null,2));
    await writeFile(path.join(directory,"review.html"),imageReviewHtml(manifest.articles,manifest.candidates));
    if (promotionConflicts.length) process.exitCode=1;
    console.log(JSON.stringify({...report,affectedArticles:report.affectedArticles.length,reviewArticles:report.reviewArticles.length},null,2));
  } finally {await lock.close();await unlink(lockPath);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
