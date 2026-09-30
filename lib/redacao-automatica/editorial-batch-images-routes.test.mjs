import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

// Real route handlers and image authority, with all persistence/transport seams
// replaced in this process. Any unexpected network access fails the test.
const origin = "https://local-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
globalThis.fetch = async () => { throw Error("Unexpected network access"); };
const state = globalThis.__batchImageRoutes = { origin, writes: [], freezes: [], assets: [], rows: [], imageRows: [], decisions: new Map(), manifest: null, authorized: true };
const mocks = {
  "@/lib/admin-session": 'export const ADMIN_SESSION_COOKIE="admin"; export const verifyAdminSession=async()=>s.authorized;',
  "@/lib/supabase": `export const getSupabaseServiceConfig=()=>({url:s.origin,serviceRoleKey:"test"});
    export async function fetchSupabaseAdminTable(query){
      if(query.startsWith("newsroom_editorial_dossier_images"))return s.imageRows.filter(row=>query.includes(row.id));
      if(query.startsWith("editorial_image_decisions")){
        const params=new URLSearchParams(query.split("?")[1]), key=params.get("decision_key"), source=params.get("source_url");
        return [...s.decisions.keys()].reverse().filter(value=>key.startsWith("eq.") ? value===key.slice(3) && s.decisionSources.get(value)===source.slice(3)
          : value.startsWith(key.slice(5,-1))).map(decision_key=>({decision_key}));
      }
      if(query.startsWith("newsroom_mesa_output_publications"))return [];
      if(query.startsWith("editorial_articles"))return query.includes("slug=in.") ? [] : s.rows;
      throw Error("Unexpected query: "+query);
    }
    export async function writeSupabaseAdmin(path,init){
      if(path!=="rpc/editorial_confirm_dossier_image_v1")throw Error("Unexpected write");
      const payload=JSON.parse(init.body); s.writes.push({path,payload});
      const image=s.decisions.get(payload.p_decision_key);
      const row=s.imageRows.find(row=>row.id===payload.p_image_id);
      row.source_url??=row.frozen_url; row.frozen_url=image.publicUrl;
    }`,
  "@/lib/editorial-image-freeze-storage.server": `export const createImageFreezeStorage=()=>({
    async freeze(key,source){
      if(s.decisions.has(key))return s.decisions.get(key);
      if(s.freezeFailure)throw Error(s.freezeFailure);
      s.freezes.push({key,source}); const image={publicUrl:s.local,sha256:"a".repeat(64)};
      s.decisions.set(key,image); s.decisionSources.set(key,source); return image;
    }, async registerLocal(url){s.assets.push(url);}
  });`,
  "@/lib/editorial-article-service": `export class EditorialArticleServiceError extends Error {}
    export const normalizeEditorialArticleSlug=title=>title.toLowerCase().replaceAll(" ","-");
    export const resolveCanonicalArticleContext=async input=>input;
    export async function createEditorialArticle(){throw Error("Unexpected legacy create");}
    export async function updateEditorialArticle(id,article){s.writes.push({id,article});return {slug:article.slug};}`,
  "@/lib/editorial-matchday-news-flow": `export class EditorialMatchdayNewsFlowError extends Error {}
    export const ensurePublishedArticlesInLatestBatch=async()=>{};
    export const ensurePublishedArticleInLatest=async()=>{};
    export const finalizePublishedArticlesInLatestBatch=async()=>{};`,
  "@/lib/redacao-automatica/editorial-dossier-article-plan-service": `
    export const linkEditorialDossierArticlePlanPublishedOutput=async()=>({ok:true});
    export async function publishEditorialMesaOutput(input){ s.writes.push(input); return {ok:true,articleId:input.article.id,slug:input.article.slug,action:input.article.mode==="update"?"updated":"created"}; }`,
  "@/lib/redacao-automatica/editorial-source-package": `export const readEditorialSourcePackageManifest=async()=>({ok:true,value:s.manifest});
    export const markEditorialSourcePackageArticleUsed=async()=>({ok:true});`,
  "@/lib/redacao-automatica/editorial-mesa-provenance": `
    export const validateEditorialThemeContinuityProvenance=()=>({ok:true,contract:"mesa-v2",outputs:[]});
    export const validateEditorialMesaOutputProvenance=()=>({ok:true,contract:"mesa-v2",outputs:[]});
    export const validateEditorialMesaSingleOutputProvenance=()=>({ok:true,contract:s.legacy?"historical":"mesa-v2",outputs:[]});`,
  "@/lib/redacao-automatica/newsroom-theme-continuity": `export const finalizeThemeContinuity=async()=>[{
    finalization_action:"created",publication_event_id:"local",updated_count:s.manifest.themeContinuity.publishedArticleCount,
    new_count:s.manifest.themeContinuity.newArticleCount,no_change_count:0}];`,
  "@/lib/redacao-automatica/newsroom-mesa-production-intents-service": `export const mesaIntentService={};`,
  "@/lib/redacao-automatica/newsroom-article-classification-repository": `export const getNewsroomArticleClassificationsByIds=async()=>({ok:true,value:[]});`,
};
const require = createRequire(import.meta.url);
for (const [name, body] of Object.entries(mocks)) {
  const filename = fileURLToPath(new URL("../../" + name.slice(2) + ".ts", import.meta.url));
  const module = { id: filename, filename, loaded: true, exports: {} };
  const source = ts.transpileModule("const s=globalThis.__batchImageRoutes;" + body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", source)(module.exports);
  require.cache[filename] = module;
}
registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only" ? { url: "node:fs", shortCircuit: true } : next(specifier, context);
} });
const { NextRequest } = await import("next/server");
const { POST: freeze } = await import("../../app/api/admin/editorial/images/freeze/route.ts");
const { POST: publish } = await import("../../app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");
const { editorialBatchOutputImage, withEditorialBatchOutputImageChoice } = await import("./editorial-batch-image-selection.ts");
const id = n => `a0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const local = n => `${origin}/storage/v1/object/public/editorial-images/editorial/sha256/${n.toString(16).padStart(64,"0")}.jpg`;
function reset() {
  Object.assign(state, { writes: [], freezes: [], assets: [], rows: [], imageRows: [], decisions: new Map(), decisionSources: new Map(), authorized: true, freezeFailure: null, local: local(32), legacy: false });
}
const freezePost = body => freeze(new NextRequest("http://localhost/api/admin/editorial/images/freeze", {
  method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
const publishPost = body => publish(new Request("http://localhost/api/admin/editorial/redacao-automatica/publicacao-lote", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

test("freeze: seleção manual externa confirma RPC, preserva origem e reload não volta a adquirir", async () => {
  reset(); const source = "https://source.example/photo.jpg";
  state.imageRows = [{ id: id(32), dossier_id: id(2), frozen_url: source, source_url: null }];
  const payload = { select: true, confirm: true, dossierId: id(2), dossierImageId: id(32) };
  const response = await freezePost(payload); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).image.publicUrl, local(32));
  assert.equal(state.writes[0].path, "rpc/editorial_confirm_dossier_image_v1");
  assert.equal(state.imageRows[0].source_url, source); assert.equal(state.imageRows[0].frozen_url, local(32));
  assert.equal((await freezePost(payload)).status, 200);
  assert.equal(state.freezes.length, 1); assert.equal(state.writes.length, 1);
});

test("freeze: decisão já pronta da Produção é reutilizada e só o clique a confirma", async () => {
  reset(); state.imageRows = [{ id: id(32), dossier_id: id(2), frozen_url: "https://source.example/photo.jpg", source_url: null }];
  assert.equal((await freezePost({ prepare: true, confirm: false, dossierId: id(2), dossierImageId: id(32) })).status, 200);
  assert.equal(state.writes.length, 0); assert.equal(state.freezes.length, 1);
  assert.equal((await freezePost({ select: true, confirm: true, dossierId: id(2), dossierImageId: id(32) })).status, 200);
  assert.equal(state.writes.length, 1); assert.equal(state.freezes.length, 1);
});

test("freeze: preparação automática continua incapaz de confirmar; auth e dossier verificados", async () => {
  reset(); state.imageRows = [{ id: id(32), dossier_id: id(2), frozen_url: "https://source.example/photo.jpg", source_url: null }];
  for (const select of [false, true]) assert.equal((await freezePost({ prepare: true, select, confirm: true, dossierId: id(2), dossierImageId: id(32) })).status, 400);
  assert.equal((await freezePost({ select: true, confirm: false, dossierImageId: id(32) })).status, 400);
  assert.equal((await freezePost({ select: true, confirm: true, dossierId: id(999), dossierImageId: id(32) })).status, 422);
  state.authorized = false;
  assert.equal((await freezePost({ select: true, confirm: true, dossierImageId: id(32) })).status, 401);
  assert.equal(state.freezes.length, 0); assert.equal(state.writes.length, 0);
});

test("freeze: decisão antiga é reutilizada apenas quando pertence à origem real da imagem", async () => {
  for (const matchingSource of [true, false]) {
    reset(); const source = "https://source.example/photo.jpg", decisionKey = id(800);
    state.imageRows = [{id:id(32),dossier_id:id(2),frozen_url:source,source_url:null}];
    state.decisions.set(decisionKey,{publicUrl:local(32),sha256:"a".repeat(64)});
    state.decisionSources.set(decisionKey,matchingSource ? source : "https://another.example/unrelated.jpg");
    const response = await freezePost({select:true,confirm:true,dossierId:id(2),dossierImageId:id(32),decisionKey});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    assert.equal(state.freezes.length,matchingSource ? 0 : 1);
    assert.equal(state.writes[0].payload.p_decision_key===decisionKey,matchingSource);
  }
});

test("freeze: legacy sem linha usa decisão existente; falha nunca confirma recurso incompleto", async () => {
  reset(); const payload = { select: true, confirm: true, sourceUrl: "https://source.example/legacy.jpg", decisionKey: id(80) };
  state.freezeFailure = "image-previews-incomplete";
  assert.equal((await freezePost(payload)).status, 422); assert.equal(state.writes.length, 0);
  state.freezeFailure = null;
  assert.equal((await freezePost(payload)).status, 200); assert.equal((await freezePost(payload)).status, 200);
  assert.equal(state.freezes.length, 1); assert.equal(state.writes.length, 0);
});

function batch(update = false) {
  const slots = [10, 11].map((n, index) => ({ slot: update && !index ? "EXISTING_01" : `NEW_${String(index + (update ? 0 : 1)).padStart(2,"0")}`,
    kind: update && !index ? "existing" : "new", outputId: id(n), productionContextId: id(3),
    targetEditorialArticleId: update && !index ? id(90) : null,
    ...(update && !index ? { targetSlug: "existing", targetTitle: "Existente", targetMatchdayId: id(4) } : {}),
  }));
  const themeContinuity = { contractVersion: 1, themeId: id(5), authorityFingerprint: "a".repeat(32), baselineDossierId: null, baselineConsolidatedAt: null,
    sourceDiff: [{ newsroomArticleId: id(20), newsroomSnapshotId: id(22), change: "NEW_SOURCE" }],
    publishedArticleCount: update ? 1 : 0, newArticleCount: update ? 1 : 2, slots };
  const sourcePackage = { year: "2026", month: "09", packageId: id(1), dossierId: id(2), themeContinuity,
    batchContract: { manifestVersion: 5, provenanceContract: "mesa-v2", workspaceContractVersion: 2, outputIds: [id(10),id(11)], sourceIds: [id(20),id(21)], sourceIdsByOutput: { [id(10)]: [id(20)], [id(11)]: [id(21)] } },
    continuityResolution: { noChangeOutputIds: [], materializedOutputIds: [id(10),id(11)] },
    dossierImages: [30,31].map(n=>({id:id(n),imageUrl:local(n),label:`Imagem ${n}`,newsroomArticleId:id(n-10)})),
    outputImages: [10,11].map((n,i)=>({position:i+1,outputId:id(n),dossierImageId:id(n+20),imageUrl:local(n+20),label:`Imagem ${n+20}`})),
  };
  state.manifest = { version: 5, themeContinuity, entries: [], outputs: slots.map((slot,index)=>({position:index+1,outputId:slot.outputId,
    articlePlan: { dossierId:id(2),articlePlanId:slot.outputId,workspaceContractVersion:2 } })) };
  if (update) state.rows = [{ id:id(90),slug:"existing",matchday_id:id(4),status:"published",image_url:"https://published.example/old.jpg",published_at:"2026-09-29T12:00:00.000Z" }];
  return { author:"Editor", matchdayId:id(4), sourcePackage,
    articles: slots.map((slot,index)=>({index:index+1,key:String(index+1).padStart(2,"0"),outputId:slot.outputId,sourceIds:[id(index+20)],label:"Liga",title:`Artigo ${index+1}`,subtitle:"Pós-título",body:"Corpo integral."})),
    classificationsByOutputId: { [id(10)]:"benfica",[id(11)]:"benfica" },
  };
}

test("A–D/O: rota recebe exatamente escolhas originais, cruzadas, iguais ou independentes", async () => {
  for (const choices of [[30,31],[31,30],[31,31],[31,30]]) {
    reset(); const payload = batch();
    for (const [index,image] of choices.entries()) payload.sourcePackage = withEditorialBatchOutputImageChoice(payload.sourcePackage,id(10+index),id(image));
    const preflight = await publishPost({ ...payload, action:"preflight" });
    assert.equal(preflight.status,200,JSON.stringify(await preflight.clone().json()));
    assert.equal(state.writes.length,0); assert.equal(state.assets.length,0);
    const imageUrlsByOutputId = Object.fromEntries([10,11].map(n=>[id(n),editorialBatchOutputImage(payload.sourcePackage,id(n)).imageUrl]));
    const response = await publishPost({ ...payload,action:"publish_theme_continuity",imageUrlsByOutputId });
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    assert.deepEqual(state.writes.map(item=>[item.outputId,item.article.imageUrl]),choices.map((image,index)=>[id(10+index),local(image)]));
    assert.deepEqual(state.writes.map(item=>item.dossierSourceIds),[[id(20)],[id(21)]]);
  }
});

test("preflight e publicação recusam URL externa antes de qualquer writer, mesmo no segundo output", async () => {
  reset(); const payload = batch(); payload.sourcePackage.outputImages[1].imageUrl="https://source.example/not-ready.jpg";
  for (const action of ["preflight","publish_theme_continuity"]) {
    const response = await publishPost({ ...payload,action,imageUrlsByOutputId:{} });
    assert.equal(response.status,409,JSON.stringify(await response.clone().json()));
    assert.match((await response.json()).detail,/image-materialization-required/);
  }
  assert.equal(state.writes.length,0); assert.equal(state.freezes.length,0); assert.equal(state.assets.length,0);
});

test("K/L: UPDATE preserva imagem publicada externa, mas escolha manual local prevalece", async () => {
  for (const replacement of [null,31]) {
    reset(); const payload=batch(true);
    payload.sourcePackage=withEditorialBatchOutputImageChoice(payload.sourcePackage,id(10),replacement===null?null:id(replacement));
    const preflight=await publishPost({...payload,action:"preflight"}); assert.equal(preflight.status,200,JSON.stringify(await preflight.clone().json()));
    const imageUrlsByOutputId=Object.fromEntries([10,11].map(n=>[id(n),editorialBatchOutputImage(payload.sourcePackage,id(n))?.imageUrl??null]));
    const response=await publishPost({...payload,action:"publish_theme_continuity",imageUrlsByOutputId});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    assert.equal(state.writes[0].article.imageUrl,replacement===null?"https://published.example/old.jpg":local(31));
    assert.equal(state.writes[0].article.mode,"update");
  }
});

test("UPDATE no contrato antigo também transporta a escolha, preservando a imagem quando não existe override", async () => {
  for (const imageUrl of [null, local(31)]) {
    reset(); state.legacy = true;
    state.rows = [{ id:id(90),slug:"existing",matchday_id:id(4),status:"published",image_url:local(30),published_at:"2026-09-29T12:00:00.000Z" }];
    state.manifest = { version:4, outputs:[{position:1,sourceArticlePosition:1,publishedArticleId:id(90),publishedSlug:"existing"}],
      entries:[{status:"prepared",articlePosition:1,publishedAtPrecision:"instant",publishedAt:"2026-09-29T10:00:00.000Z"}] };
    const response = await publishPost({ action:"publish_item", publicationMode:"update", updateArticleId:id(90),author:"Editor",matchdayId:id(4),
      sourcePackage:{year:"2026",month:"09",packageId:id(1)},publishedAt:"2026-09-29T12:00:00.000Z",
      article:{index:1,key:"01",label:"Liga",title:"Título novo",subtitle:"Pós-título",body:"Corpo integral."},imageUrl });
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    assert.equal(state.writes[0].article.image_url,imageUrl??local(30));
    assert.equal(state.writes[0].article.published_at,"2026-09-29T12:00:00.000Z");
  }
});
