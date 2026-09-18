import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildMesaIntentUiRequest, mesaIntentThemeView, parseMesaIntentChoices, parseMesaIntentThemeView,
  type MesaIntentChoices, type MesaThemeChoice } from './newsroom-mesa-production-intents-ui';
import { parseMesaProductionIntents } from './newsroom-mesa-production-intents-contract';
import { retainMesaDeferredSelection, readMesaPreparationBuffer, type MesaPreparationBuffer } from
  '../../app/admin/editorial/redacao-automatica/mesa/_mesa-selection-state';
const fixture=JSON.parse(readFileSync('.ci/mesa-intents-sql/intent-plan.fixture.json','utf8'));
const p=parseMesaProductionIntents(fixture.plan)!;
const c=p.contexts.find(c=>c.kind==='theme')!, loose=p.contexts.find(c=>c.kind==='source')!;
const tid=c.themeId!, sid=loose.sourceId!, key='f0000000-0000-4000-8000-000000000001';
const selection={themes:[{themeId:tid,title:c.title}],sources:[{newsroomArticleId:sid,title:loose.title}]};
const view=mesaIntentThemeView(c,[]), views={[tid]:view};
function choices(mode:MesaThemeChoice['mode'], n=1):MesaIntentChoices {
  return {themes:{[tid]:{mode,newCount:n}},sources:{[sid]:{destination:'independent',newCount:1,themeId:''}}};
}
for(const [mode,n,review,fresh] of [['review',7,true,0],['review-new',2,true,2],['new',2,false,2]] as const) {
  test(`UI ${mode}: review and NEW counts remain separate`,()=>{
    const r=buildMesaIntentUiRequest(selection,choices(mode,n),views,'Produção',key);
    assert.ok(r.ok);assert.deepEqual(r.request.themes,[{themeId:tid,action:'prepare',reviewPublished:review,newArticleCount:fresh}]);
    assert.equal(r.reviews,review?view.articles.length:0);assert.equal(r.newArticles,fresh+1);
    assert.equal(r.request.sources[0].destination,'independent');
  });
}
test('missing source destination blocks; selecting side by side never incorporates',()=>{
  const r=buildMesaIntentUiRequest(selection,{...choices('review'),sources:{}},views,'Produção',key);
  assert.equal(r.ok,false);if(!r.ok)assert.equal(r.issues[0].contextKey,`source:${sid}`);
});
test('explicit incorporation does not add a NEW count',()=>{
  const r=buildMesaIntentUiRequest(selection,{...choices('review'),sources:{[sid]:{destination:'theme',themeId:tid,newCount:9}}},views,'Produção',key);
  assert.ok(r.ok);assert.equal(r.newArticles,0);assert.equal(r.request.sources[0].destination,'theme');
});
test('unpublished Theme never permits review; it permits only requested NEWs',()=>{
  const empty={...view,articles:[]};
  for(const mode of ['review','review-new'] as const)assert.equal(buildMesaIntentUiRequest(selection,choices(mode),{[tid]:empty},'Produção',key).ok,false);
  const r=buildMesaIntentUiRequest(selection,choices('new',3),{[tid]:empty},'Produção',key);
  assert.ok(r.ok);assert.equal(r.reviews,0);assert.equal(r.newArticles,4);
});
test('Theme can be deferred without a successful read while independent source works',()=>{
  const r=buildMesaIntentUiRequest(selection,choices('defer'),{},'Produção',key);
  assert.ok(r.ok);assert.deepEqual(r.request.themes,[{themeId:tid,action:'defer'}]);assert.equal(r.reviews,0);
});
test('source cannot be incorporated into a deferred Theme',()=>{
  const r=buildMesaIntentUiRequest(selection,{...choices('defer'),sources:{[sid]:{destination:'theme',themeId:tid,newCount:1}}},views,'Produção',key);
  assert.equal(r.ok,false);
});
test('whole Theme with zero loose sources prepares review from saved captures',()=>{
  const r=buildMesaIntentUiRequest({...selection,sources:[]},choices('review'),views,'Produção',key);
  assert.ok(r.ok);assert.equal(r.request.sources.length,0);assert.equal(r.newArticles,0);
});
test('all deferred, zero NEW without review, invalid count or >30 results never prepare',()=>{
  for(const n of [0,NaN,-1,1.5,31])assert.equal(buildMesaIntentUiRequest(selection,choices('new',n),views,'Produção',key).ok,false);
  assert.equal(buildMesaIntentUiRequest(selection,{...choices('defer'),sources:{[sid]:{destination:'defer',themeId:'',newCount:1}}},views,'Produção',key).ok,false);
});
test('missing/ambiguous history remains unknown, not SEM ALTERAÇÃO',()=>{
  assert.equal(view.articles[0].decision,null);assert.equal(view.articles[0].unknown,c.sources.length);
  const articleId=c.publishedArticles[0].editorialArticleId;
  const r={contextKey:c.key,themeId:tid,articleId,slot:'EXISTING_01',decision:'UPDATE' as const,capturedAt:p.capturedAt,sources:c.sources};
  const known=mesaIntentThemeView(c,[r]);assert.equal(known.articles[0].decision,'UPDATE');
  const ambiguous=mesaIntentThemeView(c,[r,{...r,decision:'SEM_ALTERAÇÃO'}]);assert.equal(ambiguous.articles[0].decision,null);
  assert.ok(parseMesaIntentThemeView(known));assert.equal(parseMesaIntentThemeView({...known,sourceCount:999}),null);
});
test('corrupted saved choices never manufacture work for a source',()=>{
  assert.deepEqual(parseMesaIntentChoices({themes:{},sources:{[sid]:{destination:'invented',themeId:'',newCount:1}}}).sources,{});
  assert.deepEqual(parseMesaIntentChoices(null),{themes:{},sources:{}});
});
test('success consumes only requested work, preserving deferred sources and Themes',()=>{
  const buffer:MesaPreparationBuffer={version:3,title:'Produção',preparationKey:key,
    themes:[{kind:'theme',themeId:tid,title:c.title,classificationKey:'sporting',sources:c.sources}],
    sources:[{kind:'source',newsroomArticleId:sid,newsroomSnapshotId:loose.sources[0].newsroomSnapshotId,
      lifecycle:'new',classificationKey:'sporting',title:'Pote',sourceLabel:'Teste',imageUrl:null}]};
  const r=buildMesaIntentUiRequest(selection,choices('defer'),views,'Produção',key);assert.ok(r.ok);
  const retained=retainMesaDeferredSelection(buffer,r.request,()=>key);
  assert.equal(retained.sources.length,0);assert.equal(retained.themes?.[0].themeId,tid);
  assert.deepEqual(readMesaPreparationBuffer(JSON.stringify(retained)),retained);
  const r2=buildMesaIntentUiRequest(selection,{...choices('review'),sources:{[sid]:{destination:'defer',themeId:'',newCount:1}}},views,'Produção',key);assert.ok(r2.ok);
  const retained2=retainMesaDeferredSelection(buffer,r2.request,()=>key);
  assert.equal(retained2.sources[0].newsroomArticleId,sid);assert.equal(retained2.themes?.length,0);
});
