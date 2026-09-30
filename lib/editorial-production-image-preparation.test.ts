import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { prepareProductionImage, type ProductionImageRow } from "./editorial-production-image-preparation.server";
import { productionImageCandidate, productionImageSelection, productionImageNeedsSave, createProductionImagePreparer, productionImageError } from "./editorial-production-image-choice";
import { freezeEditorialImage, type ImageDecision, type ImageFreezeTransport } from "./editorial-image-freeze.server";
import { editorialPreviewPath, PUBLIC_EDITORIAL_PREVIEW_WIDTHS } from "./editorial-image-preview";

const origin = "https://local-project.supabase.co";
const dossierId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const picture = (color: string) => sharp({create:{width:640,height:360,channels:3,background:color}}).jpeg().toBuffer();

async function fixture(count = 1) {
  const decisions = new Map<string, ImageDecision>();
  const objects = new Map<string, Uint8Array>();
  const rows = new Map<string, ProductionImageRow>();
  const sources = new Map<string, string>();
  for (let i = 1; i <= count; i++) {
    rows.set(id(i+10), { id:id(i+10), dossier_id:dossierId, frozen_url:`https://source.example/${i}.jpg`, source_url:null });
    sources.set(id(i+10), id(i+100));
  }
  const state = { downloads: [] as string[], bytes: await picture("red"), failedSource:"", failPreview:false };
  const freeze: ImageFreezeTransport = {
    origin,
    async claim(key,sourceUrl) {
      const old=decisions.get(key); if(old) return {owned:false,decision:old};
      const decision:ImageDecision={key,sourceUrl,state:"acquiring",image:null}; decisions.set(key,decision);
      return {owned:true,decision};
    },
    async bind(key,image){ Object.assign(decisions.get(key)!,{state:"candidate",image}); },
    async finish(key,image){ Object.assign(decisions.get(key)!,{state:"ready",image}); },
    async download(source){ state.downloads.push(source); if(source===state.failedSource)throw Error("image-download-failed"); return {bytes:state.bytes,contentType:"image/jpeg"}; },
    async originalExists(path){return objects.has(path);},
    async writeOriginal(image,bytes){objects.set(image.path,bytes);return "created";},
    previews:{
      async exists(path){return objects.has(path);},
      async readOriginal(path){return objects.get(path)!;},
      async writePreview(path,bytes){if(state.failPreview)throw Error("preview-failed");objects.set(path,bytes);return "created";},
      async list(){return [];},
    },
  };
  const transport = {
    origin,
    async readImage(imageId:string){return rows.get(imageId)??null;},
    async latestDecision(prefix:string){return [...decisions.keys()].filter(key=>key.startsWith(prefix)).at(-1)??null;},
    async registerLocal(url:string){assert.ok(objects.has(url.split("/editorial-images/")[1]));},
    freeze:(key:string,source:string)=>freezeEditorialImage(key,source,freeze),
  };
  const images = () => [...rows.values()].map(row=>({id:row.id,frozenUrl:row.frozen_url,newsroomArticleId:sources.get(row.id)!}));
  return {state,decisions,objects,rows,transport,images,
    prepare:(imageId=id(11),revisionKey?:string)=>prepareProductionImage({dossierId,imageId,revisionKey},transport)};
}

test("uma candidata por artigo: prepara original + previews e só depois fica selecionável", async()=>{
  const f=await fixture(); const candidate=productionImageCandidate(f.images(),[id(101)],null,"new")!;
  assert.equal(productionImageSelection({candidate,explicitChoice:null,destination:"new",origin}).value,"unselected");
  const prepared=await f.prepare(candidate.id);
  assert.equal(productionImageSelection({candidate,explicitChoice:null,destination:"new",prepared,origin}).value,`dossier_image:${candidate.id}`);
  const decision=f.decisions.get(prepared.decisionKey!)!;
  assert.equal(decision.state,"ready"); assert.equal(f.state.downloads.length,1);
  assert.equal(createHash("sha256").update(f.objects.get(decision.image!.path)!).digest("hex"),prepared.sha256);
  for(const width of PUBLIC_EDITORIAL_PREVIEW_WIDTHS)assert.ok(f.objects.has(editorialPreviewPath(decision.image!.path,width)!));
  assert.equal(f.rows.get(candidate.id)!.source_url,null);
  assert.match(f.rows.get(candidate.id)!.frozen_url,/source\.example/); // no editorial confirmation
});

test("seis outputs preparam seis candidatas próprias sem unicidade global",async()=>{
  const f=await fixture(6);
  const results=await Promise.all(Array.from({length:6},(_,i)=>{
    const candidate=productionImageCandidate(f.images(),[id(101+i)],null,"new")!;
    assert.equal(candidate.id,id(11+i)); return f.prepare(candidate.id);
  }));
  assert.equal(results.length,6);assert.equal(f.state.downloads.length,6);assert.equal(new Set(results.map(r=>r.decisionKey)).size,6);
});

test("reload/retry sem localStorage reutiliza a mesma decisão e zero novo download",async()=>{
  const f=await fixture();const first=await f.prepare();f.state.bytes=await picture("blue");
  const afterReload=await prepareProductionImage({dossierId,imageId:id(11)},{...f.transport});
  assert.deepEqual(afterReload,first);assert.equal(f.state.downloads.length,1);
});

test("imagem já local e upload manual não voltam a ser adquiridos",async()=>{
  const f=await fixture();const first=await f.prepare();
  f.rows.get(id(11))!.frozen_url=first.publicUrl;
  const reused=await f.prepare();assert.equal(reused.decisionKey,null);assert.equal(f.state.downloads.length,1);
  const upload={id:id(500),frozenUrl:first.publicUrl};
  const choice=productionImageCandidate([upload],[],`dossier_image:${upload.id}`,"new");
  assert.equal(productionImageSelection({candidate:choice,explicitChoice:`dossier_image:${upload.id}`,destination:"new",origin}).value,`dossier_image:${upload.id}`);
});

test("várias candidatas e zero candidatas: nenhuma seleção automática; escolha manual prepara só uma",async()=>{
  const f=await fixture(2);const images=f.images().map(image=>({...image,newsroomArticleId:id(101)}));
  assert.equal(productionImageCandidate(images,[id(101)],null,"new"),null);
  assert.equal(productionImageCandidate(images,[id(999)],null,"new"),null);
  assert.equal(f.state.downloads.length,0);
  const selected=productionImageCandidate(images,[id(101)],`dossier_image:${id(12)}`,"new")!;
  await f.prepare(selected.id);assert.deepEqual(f.state.downloads,["https://source.example/2.jpg"]);
});

test("falha num output não impede as cinco outras preparações nem seleciona uma URL externa",async()=>{
  const f=await fixture(6);f.state.failedSource="https://source.example/2.jpg";
  const results=await Promise.allSettled(f.images().map(image=>f.prepare(image.id)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,5);
  assert.equal(productionImageSelection({candidate:f.images()[1],explicitChoice:null,destination:"new",origin}).value,"unselected");
  assert.match(productionImageError("image-download-failed"),/tentar novamente/);
});

test("Sem imagem e UPDATE preservam a decisão humana, mesmo surgindo outra candidata",async()=>{
  const f=await fixture(2);
  for(const choice of ["unselected","preserve_published"])assert.equal(productionImageCandidate(f.images(),[id(101)],choice,"update"),null);
  assert.equal(productionImageCandidate(f.images(),[id(101)],null,"update"),null);
  const manual=productionImageCandidate(f.images(),[id(102)],`dossier_image:${id(11)}`,"update");
  assert.equal(manual?.id,id(11));assert.equal(f.state.downloads.length,0);
});

test("substituição externa ainda não pronta conserva a última imagem utilizável, mesmo em UPDATE",async()=>{
  const f=await fixture(2); const prepared=await f.prepare();
  const fallback=productionImageSelection({candidate:f.images()[0],explicitChoice:`dossier_image:${id(11)}`,destination:"update",prepared,origin});
  const failed=productionImageSelection({candidate:f.images()[1],explicitChoice:`dossier_image:${id(12)}`,destination:"update",fallback,origin});
  assert.deepEqual(failed,fallback);
  assert.equal(productionImageSelection({candidate:null,explicitChoice:"unselected",destination:"update",fallback,origin}).value,"unselected");
});

test("Guardar confirma a seleção preparada; mesma seleção não volta a sujar o formulário, nova revisão sim",()=>{
  const selection={value:`dossier_image:${id(11)}`,decisionKey:"prepared-a",automatic:true,publicUrl:"local"};
  assert.equal(productionImageNeedsSave(selection,null),true);
  const confirmed={...selection,destination:"new" as const};
  assert.equal(productionImageNeedsSave({...selection,automatic:false},confirmed),false);
  assert.equal(productionImageNeedsSave({...selection,decisionKey:"prepared-b"},confirmed),true);
});

test("pedido concorrente para a mesma imagem é coalescido; imagens diferentes são independentes",async()=>{
  const f=await fixture(2);let calls=0;
  const prepare=createProductionImagePreparer(async(dossierId,imageId)=>{calls++;return prepareProductionImage({dossierId,imageId},f.transport);});
  const [a,b]=await Promise.all([prepare(dossierId,f.images()[0]),prepare(dossierId,f.images()[0]),prepare(dossierId,f.images()[1])]);
  assert.deepEqual(a,b);assert.equal(calls,2);assert.equal(f.state.downloads.length,2);
});

test("nova aquisição só por pedido explícito cria outra revisão; reload conserva essa revisão",async()=>{
  const f=await fixture();const first=await f.prepare();f.state.bytes=await picture("blue");
  const second=await f.prepare(id(11),id(901));
  assert.notEqual(second.decisionKey,first.decisionKey);assert.notEqual(second.publicUrl,first.publicUrl);
  assert.deepEqual(await f.prepare(),second);assert.equal(f.state.downloads.length,2);
});

test("falha dos previews pode ser retomada sem mudar bytes nem repetir download",async()=>{
  const f=await fixture();f.state.failPreview=true;
  await assert.rejects(f.prepare(),/preview-failed/);f.state.failPreview=false;
  const ready=await f.prepare();assert.ok(ready.publicUrl);assert.equal(f.state.downloads.length,1);
});

test("dossier errado é recusado antes da aquisição",async()=>{
  const f=await fixture();await assert.rejects(prepareProductionImage({dossierId:id(99),imageId:id(11)},f.transport),/not-in-dossier/);
  assert.equal(f.state.downloads.length,0);
});

test("origem inválida não cria sequer uma decisão técnica nem dispara download",async()=>{
  const f=await fixture(); f.rows.get(id(11))!.frozen_url="file:///private/image.jpg";
  await assert.rejects(f.prepare());assert.equal(f.decisions.size,0);assert.equal(f.state.downloads.length,0);
});

test("preparação de Produção conserva confirm=false; confirmação exige seleção manual distinta",()=>{
  const route=readFileSync("app/api/admin/editorial/images/freeze/route.ts","utf8");
  assert.match(route,/payload\.confirm !== false/);
  assert.match(route,/selection && \(preparation \|\| payload\.confirm !== true\)/);
  assert.match(route,/if \(selection && image\.decisionKey\)/);
  const ui=readFileSync("app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_production-image-preparation.ts","utf8");
  assert.match(ui,/confirm: false/);assert.doesNotMatch(ui,/localStorage/);
});

test("grelha limita candidatas externas e badges ao thumbnail, sem painel técnico normal",()=>{
  const grid=readFileSync("app/admin/editorial/redacao-automatica/_dossierImageChoiceGrid.tsx","utf8");
  const css=readFileSync("app/admin/editorial/redacao-automatica/dossier-image-choice-grid.module.css","utf8");
  assert.match(grid,/className=\{styles\.candidateChoice\}/);
  assert.match(grid,/!prepareBeforeSave && !disabled/);
  assert.doesNotMatch(css,/\.imageChoices small\s*[,\{]/);
  assert.match(css,/\.candidateChoice > small/);
});
