/** JSON-lines IPC: browser actions reach real route handlers and PostgreSQL.
 * Runs without Internet sockets. No dev/prod server, credentials or site visit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
process.env.MESA_UI_DRIVER='1';
const h=await import('../mesa-intents-sql/application.mjs');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const argv=process.argv.slice(2),output=resolve(argv[argv.indexOf('--output')+1]);
for(const name of ['newsroom_organize_theme_selection_v3','read_matchday_historical_article_decisions_v1','newsroom_organize_theme_sources_v1','newsroom_mesa_theme_summaries_v1','newsroom_latest_snapshot_summaries',
  'newsroom_preview_mesa_grouping_v2','newsroom_prepare_mesa_grouping_v2','newsroom_change_mesa_new_output_groups_v2',
  'newsroom_materialize_mesa_new_output_groups_v2'])h.rpcNames.add(name);
for(const name of ['newsroom_editorial_theme_sources','newsroom_mesa_new_output_groupings',
  'newsroom_mesa_new_output_groups','newsroom_mesa_new_output_theme_targets','newsroom_mesa_new_output_group_sources',
  'newsroom_editorial_dossier_sources','newsroom_editorial_dossier_images'])h.tableNames.add(name);
// Existing scoped-read RPC required by the unmodified organization handler.
h.sql(readFileSync(root+'/supabase/sql/jornada-redacao-automatica-egress-snapshot-summaries-1-aplicar.sql','utf8'));
await build({entryPoints:[root+'/.ci/mesa-intents-ui/client.tsx'],outfile:output+'/browser.js',bundle:true,
  platform:'browser',format:'iife',jsx:'automatic',tsconfig:root+'/tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},
  plugins:[{name:'router-boundary',setup(b){
    b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'test-router'}));
    b.onLoad({filter:/.*/,namespace:'test-router'},()=>({contents:`
      const router={push(url){window.__navigations.push(url)},refresh(){}};
      export const useRouter=()=>router;`,loader:'js'}));
  }}]});
let current=null, faults={},httpCalls=[];
const sourceAudit=()=>current?{
  articles:h.rows(`select id,processing_status from public.newsroom_articles where id in (${[current.material.id,current.loose.id,current.extra?.id].filter(Boolean).map(h.q).join(',')}) order by id`),
  snapshots:h.rows(`select id,article_id,content_hash,body,source_metadata,extracted_at from public.newsroom_article_snapshots where article_id in (${[current.material.id,current.loose.id,current.extra?.id].filter(Boolean).map(h.q).join(',')}) order by id`),
  memberships:h.rows(`select * from public.newsroom_editorial_theme_sources where newsroom_article_id in (${[current.material.id,current.loose.id,current.extra?.id].filter(Boolean).map(h.q).join(',')}) order by theme_id,newsroom_article_id`),
  usage:h.rows(`select * from public.newsroom_mesa_output_source_usage where newsroom_article_id in (${[current.material.id,current.loose.id,current.extra?.id].filter(Boolean).map(h.q).join(',')}) order by dossier_id,article_plan_id,newsroom_article_id`),
}:null;
const state=()=>({
  preparations:h.rows('select dossier_id,frozen_plan from public.newsroom_mesa_intent_preparations'),
  groupingPreparations:h.rows('select preparation_key,dossier_id,request,authority_fingerprint,authority_snapshot,base_preview from public.newsroom_mesa_new_output_grouping_preparations order by created_at,dossier_id'),
  groupings:h.rows('select dossier_id,production_context_id,loose_source_ids,target_count,revision,state,existing_outputs from public.newsroom_mesa_new_output_groupings order by dossier_id'),
  memberships:current?h.rows(`select * from public.newsroom_editorial_theme_sources where theme_id=${h.q(current.theme)}`):[],
  articles:current?h.rows(`select a.* from public.editorial_articles a join public.newsroom_editorial_theme_articles t on t.editorial_article_id=a.id where t.theme_id=${h.q(current.theme)} order by a.created_at,a.id`):[],
  sourceAudit:sourceAudit(),httpCalls,forbidden:h.forbidden,
});
function uiSource(s,title){return {kind:'source',lifecycle:'new',newsroomArticleId:s.id,newsroomSnapshotId:s.sid,
  classificationKey:'sporting',title,sourceLabel:'Ensaio local',imageUrl:null};}
function setup(input){
  current=h.fixture(input.published??1);faults={};httpCalls=[];
  if(input.draft)h.sql(`update public.editorial_articles set status='draft' where id=${h.q(current.articles[0])}`);
  const extra=input.extra?h.source('Fonte adicional'):null;
  current.extra=extra;
  const ref={newsroomArticleId:current.material.id,newsroomSnapshotId:current.material.sid};
  const theme={id:current.theme,title:'Milan / Amorim',classificationKey:'sporting',status:'open',sourceCount:1,
    articleCount:input.draft?0:current.articles.length,updatedSourceCount:0,productionReady:true,
    updatedAt:'2026-09-18T10:00:00Z',sourceRefs:[ref]};
  const buffer={version:3,preparationKey:randomUUID(),title:'Produção de ensaio',
    sources:input.independent===false?[]:[uiSource(current.loose,'Pote independente'),...(extra?[uiSource(extra,'Fonte adicional')]:[])],
    themes:input.sourceOnly?[]:[{kind:'theme',themeId:current.theme,title:theme.title,classificationKey:'sporting',sources:[ref]}]};
  if(input.explicitArticles){
    h.sql(`delete from public.newsroom_editorial_theme_articles where theme_id=${h.q(current.theme)};`);
    theme.articleCount=0;buffer.themes=[];buffer.sources=[uiSource(current.loose,'Fonte com vários artigos publicados')];
  }
  return {...current,themes:[theme],buffer,before:state().preparations.length,
    ...(input.explicitArticles?{publishedChoices:{material:buffer.sources[0],articles:current.articles.map((id,index)=>({id,title:'Artigo publicado '+(index+1)}))}}:{})};
}
async function http(input){
  const url=new URL(input.url,'http://127.0.0.1:4319'),body=input.body?JSON.parse(input.body):null;
  assert.equal(url.origin,'http://127.0.0.1:4319');
  assert.ok(['GET','POST'].includes(input.method));
  httpCalls.push({path:url.pathname,method:input.method,body});
  let response;
  if(url.pathname==='/api/admin/editorial/redacao-automatica/mesa/preparar'){
    if(input.method==='GET'){
      if(faults.read){faults.read=false;return {status:503,body:{ok:false,message:'Leitura temporariamente indisponível — ensaio'}};}
      response=await h.app.intentThemeGET(new Request(url));
    }else{
      if(faults.newPublished && body.action==='preview_groups'){
        faults.newPublished=false;const id=randomUUID(),original=h.record('editorial_articles',current.articles[0]);
        h.sql(`insert into public.editorial_articles(id,status,scope,slug,label,title,subtitle,body,author,matchday_id,published_at)
          values(${h.q(id)},'published','competition',${h.q('novo-publicado-'+id)},'Ante','Publicado entretanto','Pós','Texto posterior','Editor',null,now());
          insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id) values(${h.q(current.theme)},${h.q(id)});`);
        assert.ok(original);current.articles.push(id);
      }
      response=await h.app.prepareMesaPOST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    }
  }else if(url.pathname==='/api/admin/editorial/redacao-automatica/mesa/organizacao'&&input.method==='POST'){
    response=await h.app.organizePOST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  }else if(url.pathname==='/api/admin/editorial/redacao-automatica/mesa/workspace'&&input.method==='POST'){
    response=await h.app.workspacePOST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  }else throw new Error('Unexpected UI endpoint: '+url);
  const result={status:response.status,body:await response.json()};
  if(faults.loseResponse && body?.action==='prepare_groups' && result.body.ok){faults.loseResponse=false;result.transportFailure=true;}
  return result;
}
async function command(input){
  if(input.kind==='setup')return setup(input);
  if(input.kind==='http')return http(input.request);
  if(input.kind==='state')return state();
  if(input.kind==='grouping')return h.app.readMesaNewOutputGrouping(input.dossierId);
  if(input.kind==='faults'){faults=input.value;return true;}
  if(input.kind==='publish'){
    assert.match(input.dossierId,/^[a-f0-9-]{36}$/);
    const plan=h.rows(`select frozen_plan from public.newsroom_mesa_intent_preparations where dossier_id=${h.q(input.dossierId)}`)[0].frozen_plan;
    const pkg=await h.makePackage(plan);
    const unchanged=input.noChange?plan.outputs.filter(o=>o.kind==='existing').map(o=>o.outputId):[];
    const reply=await h.api(h.publicationPayload(plan,pkg,unchanged));assert.ok(reply.ok,JSON.stringify(reply));
    return {reply,plan,articles:state().articles,receipts:await h.app.mesaIntentService.readReceipts(current.theme)};
  }
  throw new Error('Unapproved browser test command');
}
if(process.env.MESA_FLOW_DRIVER!=='1'){
console.log(JSON.stringify({ready:true}));
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{console.log(JSON.stringify({ok:true,value:await command(JSON.parse(line))}));}
  catch(error){console.log(JSON.stringify({ok:false,error:String(error.stack)}));}
}

}
export { command, h };
