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
for(const name of ['newsroom_organize_theme_sources_v1','newsroom_mesa_theme_summaries_v1','newsroom_latest_snapshot_summaries'])h.rpcNames.add(name);
h.tableNames.add('newsroom_editorial_theme_sources');
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
const state=()=>({
  preparations:h.rows('select dossier_id,frozen_plan from public.newsroom_mesa_intent_preparations'),
  memberships:current?h.rows(`select * from public.newsroom_editorial_theme_sources where theme_id=${h.q(current.theme)}`):[],
  articles:current?h.rows(`select a.* from public.editorial_articles a join public.newsroom_editorial_theme_articles t on t.editorial_article_id=a.id where t.theme_id=${h.q(current.theme)} order by a.created_at,a.id`):[],
  httpCalls,forbidden:h.forbidden,
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
  return {...current,themes:[theme],buffer,before:state().preparations.length};
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
      if(faults.newPublished && body.action==='preview_intents'){
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
  }else throw new Error('Unexpected UI endpoint: '+url);
  const result={status:response.status,body:await response.json()};
  if(faults.loseResponse && body?.action==='prepare_intents' && result.body.ok){faults.loseResponse=false;result.transportFailure=true;}
  return result;
}
async function command(input){
  if(input.kind==='setup')return setup(input);
  if(input.kind==='http')return http(input.request);
  if(input.kind==='state')return state();
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
console.log(JSON.stringify({ready:true}));
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{console.log(JSON.stringify({ok:true,value:await command(JSON.parse(line))}));}
  catch(error){console.log(JSON.stringify({ok:false,error:String(error.stack)}));}
}
