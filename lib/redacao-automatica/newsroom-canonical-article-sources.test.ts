import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_MESA_PREPARATION_BUFFER, mesaArticleChoiceRequired, mesaExplicitArticleIds, selectMesaMaterial,
  selectMesaPublishedArticle, observeMesaMaterial, readMesaPreparationBuffer, writeMesaPreparationBuffer,
  type MesaMaterialSelection } from "@/app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state";
import { createOperationalDeskReadModel, type OperationalDeskReadTransport } from "./newsroom-operational-desk-read-model-internal";
import { editorialBatchUpdateImageMessage } from "./editorial-batch-image-selection";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const material = (n: number, ids: string[]): MesaMaterialSelection => ({ kind:"source", lifecycle:"published",
  newsroomArticleId:id(n), newsroomSnapshotId:id(n+10), classificationKey:"benfica", title:`Fonte ${n}`,
  sourceLabel:"Fonte", imageUrl:null, relatedArticleIds:ids });
const key = () => id(99);

test("uma identidade comum acompanha A, B ou C e nova fonte antes da Produção", () => {
  for (const source of [1,2,3]) {
    let buffer=selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER,material(source,[id(50)]),key);
    buffer=selectMesaMaterial(buffer,material(4,[]),key);
    assert.deepEqual(mesaExplicitArticleIds(buffer),[id(50)]);
    assert.deepEqual(mesaExplicitArticleIds(readMesaPreparationBuffer(writeMesaPreparationBuffer(buffer))),[id(50)]);
  }
});
test("ambiguidade por fonte ou entre fontes exige escolha individual", () => {
  const source=material(1,[id(50),id(51)]);
  let buffer=selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER,source,key);
  assert.deepEqual(mesaExplicitArticleIds(buffer),[]);
  assert.equal(mesaArticleChoiceRequired(buffer),true);
  buffer=selectMesaPublishedArticle(buffer,source,id(51),true,key);
  assert.deepEqual(mesaExplicitArticleIds(buffer),[id(51)]);
  assert.equal(mesaArticleChoiceRequired(buffer),false);
  buffer=observeMesaMaterial(buffer,{...source,newsroomSnapshotId:id(20)});
  assert.deepEqual(mesaExplicitArticleIds(buffer),[id(51)]);
  let separate=selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER,material(1,[id(50)]),key);
  separate=selectMesaMaterial(separate,material(2,[id(51)]),key);
  assert.deepEqual(mesaExplicitArticleIds(separate),[]);
});
test("desmarcar artigo automático é respeitado no refresh e sessionStorage", () => {
  const source=material(1,[id(50)]);
  let buffer=selectMesaMaterial(EMPTY_MESA_PREPARATION_BUFFER,source,key);
  buffer=selectMesaPublishedArticle(buffer,source,id(50),false,key);
  buffer=observeMesaMaterial(buffer,source);
  assert.deepEqual(mesaExplicitArticleIds(readMesaPreparationBuffer(writeMesaPreparationBuffer(buffer))),[]);
});
test("read model dá igual autoridade às três fontes sem exigir uso factual", async () => {
  const at="2026-09-26T10:00:00Z";
  const transport: OperationalDeskReadTransport={isConfigured:()=>true,
    listCycleArticles:async()=>[1,2,3].map(n=>({id:id(n),source_code:"fixture",source_name:null,
      original_url:null,normalized_url:null,title:`Fonte ${n}`,subtitle:null,summary:null,published_at:null,
      first_detected_at:at,last_detected_at:at,image_url:null,processing_status:"ready_for_review"})),
    readLatestSnapshots:async()=>[1,2,3].map(n=>({id:id(n+10),article_id:id(n),content_hash:"hash",
      body:[{type:"paragraph",text:"Fonte real"}],source_metadata:{},extracted_at:at,created_at:at})),
    readReviewStates:async()=>[],readClassifications:async()=>[],readThemeSources:async()=>[],readLegacyUsage:async()=>[],
    readDossierSources:async()=>[],readPlanAssignments:async()=>[],readPlans:async()=>[],readDossiers:async()=>[],
    readArticleSources:async()=>[1,2,3].map(n=>({newsroom_article_id:id(n),editorial_article_id:id(50)})),
    readPublishedArticles:async ids=>{assert.ok(ids.includes(id(50)));return [{id:id(50),slug:"x",title:"Artigo X",status:"published",published_at:at}];}};
  const result=await createOperationalDeskReadModel(transport)();
  assert.ok(result.ok);
  assert.equal(result.value.novas.items.length,0);
  assert.equal(result.value.publicadas.items.length,3);
  for (const source of result.value.publicadas.items) {
    assert.deepEqual(source.publishedContributions.map(a=>a.editorialArticleId),[id(50)]);
    assert.equal(source.sourceUpdated,false);
  }
});
test("UPDATE com imagem atual informa preservação; com imagem nova informa substituição", () => {
  assert.match(editorialBatchUpdateImageMessage(null,"https://image/current"),/preservada/);
  assert.match(editorialBatchUpdateImageMessage("https://image/current","https://image/current"),/preservada/);
  const replacement=editorialBatchUpdateImageMessage("https://image/new","https://image/current");
  assert.match(replacement,/substituída pela imagem escolhida/);
  assert.doesNotMatch(replacement,/preservad|Mantém/);
  assert.match(editorialBatchUpdateImageMessage(null,"https://image/current",true),/substituída/);
});
