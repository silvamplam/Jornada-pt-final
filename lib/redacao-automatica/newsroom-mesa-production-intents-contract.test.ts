import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseMesaProductionIntents, validateMesaProductionIntentsManifest, mesaProductionIntentSlots,
  sameMesaIntentJson, parseMesaIntentLatestReceipts, parseMesaIntentLatestArticleReceipts,
} from "./newsroom-mesa-production-intents-contract";
import { parseEditorialBatchTransferSourcePackage } from "./editorial-batch-transfer";
import { editorialMesaPackageBatchContract } from "./editorial-mesa-provenance";
import {
  deriveEditorialDossierWorkspacePlanInput, saveEditorialDossierWorkspaceBatchService,
  type SaveEditorialDossierWorkspaceBatchOutputInput,
} from "./editorial-dossier-workspace-batch-service-internal";
import type { EditorialDossierProductionLoad } from "./editorial-dossier-production-loader";
import type { EditorialSourcePackageManifest } from "./editorial-source-package-internal";

const fixture = JSON.parse(readFileSync(".ci/mesa-intents-sql/intent-plan.fixture.json", "utf8")) as {
  plan: unknown; manifest: EditorialSourcePackageManifest;
};
const plan = parseMesaProductionIntents(fixture.plan)!;
assert.ok(plan);
const theme = plan.contexts.findIndex((c) => c.kind === "theme");
const independent = plan.contexts.findIndex((c) => c.kind === "source");
function mutate(path: readonly (string | number)[], value: unknown) {
  const clone=structuredClone(fixture.plan) as Record<string, unknown>;
  let cursor=clone;
  for (const key of path.slice(0,-1)) cursor=cursor[String(key)] as Record<string, unknown>;
  cursor[String(path[path.length-1])]=value;
  return clone;
}
test("frozen SQL JSON is retained exactly; null matchday survives slot projection", () => {
  assert.equal(parseMesaProductionIntents(fixture.plan),fixture.plan);
  assert.equal(mesaProductionIntentSlots(plan)[0].targetMatchdayId,null);
  assert.deepEqual(validateMesaProductionIntentsManifest(fixture.manifest),plan);
  assert.ok(sameMesaIntentJson(plan,JSON.parse(JSON.stringify(plan))));
});
for (const [name,path,value] of [
  ["version",["contractVersion"],2],
  ["dossier ID",["dossierId"],"wrong"],
  ["fingerprint",["authorityFingerprint"],"wrong"],
  ["request count",["request","themes",0,"newArticleCount"],3],
  ["review flag",["contexts",theme,"reviewPublished"],false],
  ["source reviewed",["contexts",independent,"reviewPublished"],true],
  ["source context identity",["contexts",independent,"sourceId"],plan.contexts[theme].sources[0].newsroomArticleId],
  ["source marked unusable",["contexts",theme,"sources",0,"usable"],false],
  ["snapshot fingerprint",["contexts",theme,"sources",0,"snapshotFingerprint"],null],
  ["future capture",["contexts",theme,"sources",0,"capturedAt"],"2099-01-01T00:00:00Z"],
  ["draft target",["contexts",theme,"publishedArticles",0,"article","status"],"draft"],
  ["target body diverges",["outputs",0,"target","article","body"],"forged"],
  ["target matchday forged",["outputs",0,"target","matchdayId"],plan.dossierId],
  ["unknown output kind",["outputs",0,"kind"],"unchanged"],
  ["output slot swapped",["outputs",0,"slot"],"NEW_01"],
  ["context assignment swapped",["outputs",0,"productionContextId"],plan.contexts[independent].productionContextId],
  ["output duplicate",["outputs",1,"outputId"],plan.outputs[0].outputId],
  ["review total",["totals","reviews"],0],
  ["output omitted",["outputs"],plan.outputs.slice(0,1)],
  ["independent receives history",["contexts",independent,"publishedArticles"],plan.contexts[theme].publishedArticles],
] as const) {
  test(`rejects corrupted intent: ${name}`,()=>assert.equal(parseMesaProductionIntents(mutate(path,value)),null));
}

test("frozen contract accepts selection with explicit review targets only", () => {
  const base=structuredClone(fixture.plan) as any;
  const sourceContext=base.contexts[theme];
  const contextKey=`selection:${base.preparationKey}`;
  const selectedOutputs=base.outputs.filter((output:any)=>output.contextKey===sourceContext.key)
    .map((output:any)=>({...output,contextKey}));
  const newTemplate=base.outputs.find((output:any)=>output.kind==="new");
  assert.ok(newTemplate);
  selectedOutputs.push({
    ...newTemplate,
    slot:"NEW_01",
    contextKey,
    productionContextId:sourceContext.productionContextId,
    target:null,
  });
  const selectedSourceIds=sourceContext.sources.map((source:any)=>source.newsroomArticleId).sort();
  const reviewArticleIds=selectedOutputs.filter((output:any)=>output.kind==="existing")
    .map((output:any)=>output.target.editorialArticleId).sort();
  const selectionContext={...sourceContext,key:contextKey,kind:"selection",themeId:null,sourceId:null,title:base.title,newArticleCount:1};
  delete selectionContext.theme;
  const selectionPlan={...base,
    request:{version:1,preparationKey:base.preparationKey,title:base.title,themes:[],sources:[],
      selection:{sourceIds:selectedSourceIds,reviewArticleIds,newArticleCount:selectedOutputs.filter((output:any)=>output.kind==="new").length}},
    contexts:[selectionContext],outputs:selectedOutputs,incorporations:[],deferred:{themeIds:[],sourceIds:[]},
    totals:{contexts:1,sources:selectedSourceIds.length,reviews:reviewArticleIds.length,
      newArticles:selectedOutputs.filter((output:any)=>output.kind==="new").length},
  };
  assert.ok(parseMesaProductionIntents(selectionPlan));
  const withPlannedFocus=structuredClone(selectionPlan);
  const plannedNew=withPlannedFocus.outputs.find((output:any)=>output.kind==="new");
  assert.ok(plannedNew);
  plannedNew.focusSourceIds=[selectedSourceIds[0]];
  assert.ok(parseMesaProductionIntents(withPlannedFocus),"a NEW may carry a planning seed inside its global context");
  const invalidExistingFocus=structuredClone(selectionPlan);
  const existing=invalidExistingFocus.outputs.find((output:any)=>output.kind==="existing");
  assert.ok(existing);
  existing.focusSourceIds=[selectedSourceIds[0]];
  assert.equal(parseMesaProductionIntents(invalidExistingFocus),null,"planning seeds never rewrite EXISTING");
  const broken=structuredClone(selectionPlan);
  broken.request.selection.reviewArticleIds=["a0000000-0000-4000-8000-000000009999"];
  assert.equal(parseMesaProductionIntents(broken),null);
});

test("a malformed new contract never falls back to the old transfer reader",()=>{
  const bc=editorialMesaPackageBatchContract(fixture.manifest);assert.equal(bc.kind,"mesa-v2");
  if (bc.kind!=="mesa-v2") return;
  const payload={year:"2026",month:"09",packageId:fixture.manifest.packageId,productionIntents:plan,batchContract:bc.value};
  assert.deepEqual(parseEditorialBatchTransferSourcePackage(JSON.stringify(payload))?.productionIntents,plan);
  assert.equal(parseEditorialBatchTransferSourcePackage(JSON.stringify({...payload,productionIntents:null})),null);
  const { sourceIdsByOutput: removedMap, ...withoutMap }=payload.batchContract;
  assert.ok(removedMap);
  const noMap={...payload,batchContract:withoutMap};
  assert.equal(parseEditorialBatchTransferSourcePackage(JSON.stringify(noMap)),null);
});
test("manifest source list cannot cross contexts or lose a captured snapshot",()=>{
  const crossed={...fixture.manifest,outputs:[{...fixture.manifest.outputs[0],contextSourceIds:fixture.manifest.outputs[1].contextSourceIds},...fixture.manifest.outputs.slice(1)]};
  assert.equal(validateMesaProductionIntentsManifest(crossed),null);
  const dropped={...fixture.manifest,entries:fixture.manifest.entries.slice(1)};
  assert.equal(validateMesaProductionIntentsManifest(dropped),null);
});
function workspace() {
  return {
    dossier:{id:plan.dossierId,title:plan.title,outputCount:plan.outputs.length,sources:fixture.manifest.entries.map((e,i)=>({
      id:e.provenanceSourceId,newsroomArticleId:e.newsroomArticleId,newsroomSnapshotId:e.newsroomSnapshotId,
      included:true,sortOrder:i+1,articleTitle:e.title,
    }))},plans:[],parentThemeId:null,organizationReadable:true,
    workspace:{contextMode:"contexts",mesaContext:{workspaceContractVersion:2,workspaceState:"active",selectionPayload:{productionIntents:plan},materialRefs:[]},
      productionContexts:plan.contexts.map(c=>({id:c.productionContextId,title:c.title,
        sources:fixture.manifest.entries.filter(e=>c.sources.some(s=>s.newsroomArticleId===e.newsroomArticleId)).map(e=>({dossierSourceId:e.provenanceSourceId}))})),
      publishedContexts:plan.contexts.flatMap(c=>c.publishedArticles.map(a=>({id:a.editorialArticleId,editorialArticleId:a.editorialArticleId})))},
  } as unknown as EditorialDossierProductionLoad;
}
function output(i:number):SaveEditorialDossierWorkspaceBatchOutputInput {
  const o=plan.outputs[i];
  return {clientKey:o.slot,articlePlanId:o.outputId,priority:i+1,articleKind:"news",lengthMode:"standard",editorialInstructions:"",
    destination:o.kind==="existing"?"update":"new",updateTargetEditorialArticleId:o.target?.editorialArticleId??null,
    imageChoice:{mode:o.kind==="existing"?"preserve_published":"unselected"},productionContextId:o.productionContextId};
}
test("workspace protects identity/context and independent output has no other Theme's history",()=>{
  const w=workspace();
  for(let i=0;i<plan.outputs.length;i++) assert.ok(deriveEditorialDossierWorkspacePlanInput(plan.dossierId,output(i),w));
  assert.deepEqual(deriveEditorialDossierWorkspacePlanInput(plan.dossierId,output(1),w)?.production.dossierPublishedContextIds,[]);
  assert.equal(deriveEditorialDossierWorkspacePlanInput(plan.dossierId,{...output(0),destination:"new",updateTargetEditorialArticleId:null},w),null);
  assert.equal(deriveEditorialDossierWorkspacePlanInput(plan.dossierId,{...output(0),productionContextId:output(1).productionContextId},w),null);
});
test("batch validates every frozen slot before opening a write session",async()=>{
  let writes=0;
  const save=saveEditorialDossierWorkspaceBatchService({
    loadProduction:async()=>({ok:true,value:workspace()}),
    openArticlePlanSession:async()=>{writes++;throw new Error("must not write");},
    saveProductionState:async()=>{writes++;throw new Error("must not write");},
    synchronizeOutputs:async()=>{writes++;throw new Error("must not write");},
  });
  const result=await save({dossierId:plan.dossierId,outputCount:2,outputs:[output(0),{...output(1),articlePlanId:null}]});
  assert.equal(result.ok,false);assert.equal(writes,0);
});
test("receipt reader rejects another Theme or a NEW disguised as an existing review",()=>{
  const c=plan.contexts[theme],o=plan.outputs[0];
  const receipt={contextKey:c.key,themeId:c.themeId,articleId:o.target!.editorialArticleId,slot:o.slot,
    decision:"UPDATE",capturedAt:plan.capturedAt,sources:c.sources};
  assert.ok(parseMesaIntentLatestReceipts([receipt],c.themeId!));
  assert.equal(parseMesaIntentLatestReceipts([{...receipt,decision:"NEW"}],c.themeId!),null);
  assert.equal(parseMesaIntentLatestReceipts([receipt],plan.dossierId),null);
});

test("article receipt reader accepts Theme-less selection and rejects unrequested article",()=> {
  const c=plan.contexts[theme],o=plan.outputs[0];
  const selectionReceipt={contextKey:`selection:${plan.preparationKey}`,themeId:null,
    articleId:o.target!.editorialArticleId,slot:o.slot,decision:"UPDATE",capturedAt:plan.capturedAt,sources:c.sources};
  assert.ok(parseMesaIntentLatestArticleReceipts([selectionReceipt],[o.target!.editorialArticleId]));
  assert.equal(parseMesaIntentLatestArticleReceipts([selectionReceipt],[plan.dossierId]),null);
});
