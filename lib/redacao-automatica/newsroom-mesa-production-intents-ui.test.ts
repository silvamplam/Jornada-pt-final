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
const selectionView={sourceIds:[sid],articles:[]};
function choices(mode:MesaThemeChoice['mode'], n=1):MesaIntentChoices {
  return {themes:{[tid]:{mode,newCount:n}},sources:{},
    selection:{sourceIds:[sid],reviewArticleIds:[],newCount:1}};
}
for(const [mode,n,review,fresh] of [['review',7,true,0],['review-new',2,true,2],['new',2,false,2]] as const) {
  test(`UI ${mode}: review and NEW counts remain separate`,()=>{
    const r=buildMesaIntentUiRequest(selection,choices(mode,n),views,'Produção',key,selectionView);
    assert.ok(r.ok);assert.deepEqual(r.request.themes,[{themeId:tid,action:'prepare',reviewPublished:review,newArticleCount:fresh}]);
    assert.equal(r.reviews,review?view.articles.length:0);assert.equal(r.newArticles,fresh+1);
    assert.deepEqual(r.request.sources,[]);assert.deepEqual(r.request.selection?.sourceIds,[sid]);
  });
}
test('selection requires one decision for the whole selected source set',()=>{
  const r=buildMesaIntentUiRequest(selection,{...choices('review'),selection:null},views,'Produção',key,selectionView);
  assert.equal(r.ok,false);if(!r.ok)assert.equal(r.issues[0].contextKey,`selection:${key}`);
});
test('loose sources become one technical selection instead of per-source destinations',()=>{
  const r=buildMesaIntentUiRequest(selection,choices('review'),views,'Produção',key,selectionView);
  assert.ok(r.ok);assert.deepEqual(r.request.sources,[]);
  assert.deepEqual(r.request.selection,{sourceIds:[sid],reviewArticleIds:[],newArticleCount:1});
});
test('unpublished Theme never permits review; it permits only requested NEWs',()=>{
  const empty={...view,articles:[]};
  for(const mode of ['review','review-new'] as const)assert.equal(buildMesaIntentUiRequest(selection,choices(mode),{[tid]:empty},'Produção',key,selectionView).ok,false);
  const r=buildMesaIntentUiRequest(selection,choices('new',3),{[tid]:empty},'Produção',key,selectionView);
  assert.ok(r.ok);assert.equal(r.reviews,0);assert.equal(r.newArticles,4);
});
test('Theme can be deferred without a successful read while independent source works',()=>{
  const r=buildMesaIntentUiRequest(selection,choices('defer'),{},'Produção',key,selectionView);
  assert.ok(r.ok);assert.deepEqual(r.request.themes,[{themeId:tid,action:'defer'}]);assert.equal(r.reviews,0);
});
test('selection can explicitly review one global candidate without forcing NEW',()=>{
  const candidate={sourceIds:[sid],articles:[{id:c.publishedArticles[0].editorialArticleId,title:c.publishedArticles[0].title}]};
  const selected={...choices('defer'),selection:{sourceIds:[sid],reviewArticleIds:[candidate.articles[0].id],newCount:0}};
  const r=buildMesaIntentUiRequest(selection,selected,views,'Produção',key,candidate);
  assert.ok(r.ok);assert.equal(r.reviews,1);assert.equal(r.newArticles,0);
  assert.deepEqual(r.request.selection?.reviewArticleIds,[candidate.articles[0].id]);
});
test('whole Theme with zero loose sources prepares review from saved captures',()=>{
  const r=buildMesaIntentUiRequest({...selection,sources:[]},choices('review'),views,'Produção',key,null);
  assert.ok(r.ok);assert.equal(r.request.sources.length,0);assert.equal(r.newArticles,0);
});
test('all deferred, zero work, invalid count or >30 results never prepare',()=>{
  for(const n of [0,NaN,-1,1.5,31])assert.equal(buildMesaIntentUiRequest(selection,choices('new',n),views,'Produção',key,selectionView).ok,false);
  assert.equal(buildMesaIntentUiRequest({...selection,sources:[]},choices('defer'),views,'Produção',key,null).ok,false);
  assert.equal(buildMesaIntentUiRequest(selection,{...choices('defer'),selection:{sourceIds:[sid],reviewArticleIds:[],newCount:0}},views,'Produção',key,selectionView).ok,false);
});
test('missing/ambiguous history remains unknown, not SEM ALTERAÇÃO',()=>{
  assert.equal(view.articles[0].decision,null);assert.equal(view.articles[0].unknown,c.sources.length);
  const articleId=c.publishedArticles[0].editorialArticleId;
  const r={contextKey:c.key,themeId:tid,articleId,slot:'EXISTING_01',decision:'UPDATE' as const,capturedAt:p.capturedAt,sources:c.sources};
  const known=mesaIntentThemeView(c,[r]);assert.equal(known.articles[0].decision,'UPDATE');
  const ambiguous=mesaIntentThemeView(c,[r,{...r,decision:'SEM_ALTERAÇÃO'}]);assert.equal(ambiguous.articles[0].decision,null);
  assert.ok(parseMesaIntentThemeView(known));assert.equal(parseMesaIntentThemeView({...known,sourceCount:999}),null);
});
test('corrupted saved choices never manufacture work for a selection',()=>{
  const parsed=parseMesaIntentChoices({themes:{},sources:{},selection:{sourceIds:[sid],reviewArticleIds:['invalid'],newCount:1}});
  assert.equal(parsed.selection,null);
  assert.deepEqual(parseMesaIntentChoices(null),{themes:{},sources:{},selection:null});
});
test('success consumes only requested work, preserving deferred sources and Themes',()=>{
  const buffer:MesaPreparationBuffer={version:3,title:'Produção',preparationKey:key,
    themes:[{kind:'theme',themeId:tid,title:c.title,classificationKey:'sporting',sources:c.sources}],
    sources:[{kind:'source',newsroomArticleId:sid,newsroomSnapshotId:loose.sources[0].newsroomSnapshotId,
      lifecycle:'new',classificationKey:'sporting',title:'Pote',sourceLabel:'Teste',imageUrl:null}]};
  const r=buildMesaIntentUiRequest(selection,choices('defer'),views,'Produção',key,selectionView);assert.ok(r.ok);
  const retained=retainMesaDeferredSelection(buffer,r.request,()=>key);
  assert.equal(retained.sources.length,0);assert.equal(retained.themes?.[0].themeId,tid);
  assert.deepEqual(readMesaPreparationBuffer(JSON.stringify(retained)),retained);
  const themeOnly=buildMesaIntentUiRequest({...selection,sources:[]},choices('review'),views,'Produção',key,null);assert.ok(themeOnly.ok);
  const retained2=retainMesaDeferredSelection(buffer,themeOnly.request,()=>key);
  assert.equal(retained2.sources[0].newsroomArticleId,sid);assert.equal(retained2.themes?.length,0);
});
