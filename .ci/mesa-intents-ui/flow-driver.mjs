/** Browser -> actual server page tree -> real UI -> publication handlers -> disposable SQL.
 * Next routing/RSC wire format, image bytes and the historical API response are
 * declared boundaries, not simulated publication services.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { build } from 'esbuild';
process.env.MESA_FLOW_DRIVER='1';
const base=await import('./driver.mjs'),h=base.h;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),output=resolve(args[args.indexOf('--output')+1]);
for(const table of ['newsroom_editorial_review_states','newsroom_editorial_article_classifications','newsroom_mesa_output_source_usage','newsroom_editorial_dossiers','newsroom_editorial_dossier_sources',
  'newsroom_editorial_dossier_article_plan_sources','newsroom_editorial_dossier_article_plan_generations',
  'newsroom_editorial_dossier_published_contexts','newsroom_editorial_dossier_article_plan_published_contexts',
  'newsroom_editorial_dossier_images','newsroom_mesa_production_context_items','newsroom_mesa_production_context_sources',
  'newsroom_mesa_article_plan_contexts','newsroom_editorial_theme_dossiers',
  'newsroom_editorial_profiles','newsroom_editorial_profile_versions'])h.tableNames.add(table);
for(const rpc of ['newsroom_mesa_source_counts_v1','newsroom_mesa_page_identities_v1','newsroom_read_article_classification_states_v1','newsroom_publish_mesa_intent_output_v2','newsroom_save_dossier_article_plan_state_v3','newsroom_save_mesa_context_article_plan_v3','newsroom_save_mesa_context_article_plan_v1','newsroom_save_dossier_article_plan_state_v1',
 'newsroom_set_mesa_shared_outputs_v2','newsroom_save_editorial_dossier_article_plan','newsroom_set_mesa_output_origin_v2'])h.rpcNames.add(rpc);
// The real profile DDL is required by the real workspace reader. Compose/generation
// providers are not exercised here; load the literal schema/constraints only, without seeding or activating an editorial profile.
if(h.sql("select to_regclass('public.newsroom_editorial_profiles') is null;")==='t'){
 const profile=readFileSync(root+'/supabase/steps/43-redacao-automatica-linha-editorial-persistente-apply.sql','utf8');
 const stop='\ninsert into public.newsroom_editorial_profiles (';
 assert.equal(profile.split(stop).length,2);h.sql(profile.split(stop)[0]+'\nCOMMIT;');
}
// Current workspace columns and article->Bank dependencies, loaded verbatim only in this guarded fixture.
if(h.sql("select count(*) from information_schema.columns where table_schema='public' and table_name='newsroom_editorial_dossier_article_plans' and column_name='classification_mode';")==='0'){
 for(const migration of ['20260924200000_newsroom_article_plan_output_classification_authority.sql','20260924213644_newsroom_article_plan_classification_decision.sql'])
  h.sql(readFileSync(root+'/supabase/migrations/'+migration,'utf8'));
 h.sql(`alter table public.matchday_editorial_bank_items add column if not exists classification_key text,
  add column if not exists classification_source text,add column if not exists classified_at timestamptz,
  add column if not exists continuity_revalidated_at timestamptz;`);
 const classification=readFileSync(root+'/supabase/migrations/20260831110517_matchday_editorial_bank_contextual_classification.sql','utf8').replace(/\r\n/g,'\n');
 const authorizationStart=classification.indexOf('create table\njornada_private.matchday_editorial_bank_classification_authorizations');
 assert.ok(authorizationStart>0);h.sql(classification.slice(authorizationStart,classification.indexOf('-- 5. GUARDA UNIVERSAL',authorizationStart)));
 const articleBank=readFileSync(root+'/supabase/steps/73-composicao-historica-banco-automatico-apply.sql','utf8');
 const syncStart=articleBank.indexOf('create or replace function public.sync_published_editorial_source_to_matchday_bank()');
 assert.ok(syncStart>0);h.sql(articleBank.slice(syncStart,articleBank.indexOf('drop trigger if exists sync_published_editorial_content_to_matchday_bank',syncStart)));
}
// Read the real historical decisions RPC; the composition write response remains a declared boundary.
if(h.sql("select to_regclass('jornada_private.matchday_historical_article_decisions') is null;")==='t')
 h.sql(readFileSync(root+'/supabase/migrations/20260922171755_matchday_historical_article_selection.sql','utf8'));
// Only the guarded disposable DB receives these synthetic catalogue columns.
h.sql(`alter table public.competitions add column if not exists name text, add column if not exists slug text, add column if not exists is_active boolean;
 alter table public.seasons add column if not exists label text, add column if not exists is_current boolean, add column if not exists starts_on date, add column if not exists ends_on date;
 alter table public.matchdays add column if not exists number integer, add column if not exists label text, add column if not exists status text, add column if not exists starts_on date, add column if not exists ends_on date;
 update public.competitions set name='Competição de ensaio',slug='ensaio',is_active=true;
 update public.seasons set label='2026/27',is_current=true;
 update public.matchdays set number=1,label='Jornada 1',status='scheduled';`);
await build({entryPoints:[root+'/.ci/mesa-intents-ui/flow-entry.ts'],outfile:output+'/flow-server.cjs',bundle:true,
 platform:'node',format:'cjs',packages:'external',jsx:'automatic',tsconfig:root+'/tsconfig.json',plugins:[{name:'server-boundaries',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'flow'}));
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'flow'}));
 b.onLoad({filter:/.*/,namespace:'flow'},({path})=>({contents:path==='empty'?'':
  `import {createElement} from 'react'; export default function Link({prefetch,children,...props}){return createElement('a',props,children)}`,loader:'js',resolveDir:root}));
}}]});
const f=createRequire(root+'/package.json')(output+'/flow-server.cjs');
await build({entryPoints:[root+'/.ci/mesa-intents-ui/flow-client.tsx'],outfile:output+'/flow-browser.js',bundle:true,
 platform:'browser',format:'iife',jsx:'automatic',tsconfig:root+'/tsconfig.json',define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://mesa-intents.test.invalid"'},plugins:[{name:'browser-navigation',setup(b){
 if(process.env.MESA_FLOW_DOCUMENT_ONLY==='1')b.onLoad({filter:/_workspace-client\.tsx$/},({path})=>{
  const source=readFileSync(path,'utf8');const assignment='window.location.assign("/admin/editorial/redacao-automatica/publicacao-lote");';
  assert.equal(source.split(assignment).length,2);
  return {contents:source.replace(assignment,'void window.__flowNavigate("/admin/editorial/redacao-automatica/publicacao-lote");'),loader:'tsx',resolveDir:dirname(path)};
 });
 if(process.env.MESA_FLOW_DOCUMENT_ONLY==='1')b.onLoad({filter:/_batchPreflightClient\.tsx$/},({path})=>{
  const source=readFileSync(path,'utf8');assert.equal(source.split('window.location.assign(MESA_ROUTE);').length,2);
  return {contents:source.replace('window.location.assign(MESA_ROUTE);','window.__flowLanding = MESA_ROUTE;'),loader:'tsx',resolveDir:dirname(path)};
 });
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'flow'}));
 b.onLoad({filter:/.*/,namespace:'flow'},()=>({contents:`const router={push(path){void window.__flowNavigate(path)},refresh(){void window.__flowNavigate(window.__flowReady)}};export const useRouter=()=>router;`,loader:'js'}));
}}]});
function serialize(e){
 if(e==null||typeof e==='boolean')return null;
 if(typeof e==='string'||typeof e==='number')return e;
 if(Array.isArray(e))return e.map(serialize);
 if(e.type===f.workspaceClient)return {component:'workspace',props:e.props,children:null};
 if(e.type===f.batchClient)return {component:'batch',props:e.props,children:null};
 if(typeof e.type==='function')return serialize(e.type(e.props));
 if(typeof e.type==='symbol')return serialize(e.props.children);
 assert.equal(typeof e.type,'string','Unrecognised page component');
 const {children,...props}=e.props;
 assert.ok(!Object.values(props).some(v=>typeof v==='function'));
 return {tag:e.type,props,children:serialize(children)};
}
const flowCalls=[],historicalDecisions=[];let fixture=null,historicalFailures=0;
function state(did){
 assert.match(did,/^[a-f0-9-]{36}$/);
 return {plans:h.rows(`select * from public.newsroom_editorial_dossier_article_plans where dossier_id=${h.q(did)} order by sort_order,id`),
  workspace:h.rows(`select * from public.newsroom_mesa_production_contexts where dossier_id=${h.q(did)}`)[0],
  receipts:h.rows(`select * from public.newsroom_mesa_intent_article_receipts where dossier_id=${h.q(did)}`),
  articles:h.rows(`select * from public.editorial_articles where id in (select editorial_article_id from public.newsroom_mesa_output_publications where dossier_id=${h.q(did)})`),
  published:h.rows(`select * from public.newsroom_mesa_output_publications where dossier_id=${h.q(did)}`),
  historical:structuredClone(historicalDecisions),
  themeArticles:fixture?h.rows(`select a.* from public.editorial_articles a join public.newsroom_editorial_theme_articles t on t.editorial_article_id=a.id where t.theme_id=${h.q(fixture.theme)} order by a.id`):[],
  flowCalls,forbidden:h.forbidden};
}
async function execute(input){
 if(input.kind==='setup'){
  flowCalls.length=0;historicalDecisions.length=0;historicalFailures=0;fixture=await base.command(input);
  if(input.historicalDays)for(const [index,day] of input.historicalDays.entries()) {
   assert.match(day,/^[a-f0-9-]{36}$/);
   h.sql(`insert into public.matchdays(id,season_id,number,label,status) values(${h.q(day)},'b0000000-0000-4000-8000-000000000901',${index+1},'Jornada de ensaio','scheduled') on conflict(id) do nothing;
    update public.editorial_articles set scope='matchday',matchday_id=${h.q(day)} where id=${h.q(fixture.articles[index])};`);
  }
  if(input.realMesaReturn){
   fixture.realMesaReturn=true;fixture.returnSourceCode='__return_'+fixture.theme;
   for(let index=0;index<33;index++){
    const source=h.source('Fonte para o primeiro regresso '+index);
    h.sql(`update public.newsroom_articles set source_code=${h.q(fixture.returnSourceCode)} where id=${h.q(source.id)};`);
   }
  }
  return fixture;
 }
 if(input.kind==='page'){
  const path=input.path;let tree;
  if(/^\/admin\/editorial\/redacao-automatica\/mesa\/producao\/[a-f0-9-]{36}$/.test(path))tree=await f.workspacePage({
   params:Promise.resolve({dossierId:path.split('/').pop()}),searchParams:Promise.resolve({}),
  });
  else if(path==='/admin/editorial/redacao-automatica/publicacao-lote')tree=await f.batchPage();
  else throw new Error('Unapproved page '+path);
  flowCalls.push({page:path});return serialize(tree);
 }
 if(input.kind==='http'){
  const u=new URL(input.request.url,'http://127.0.0.1:4319');assert.equal(u.origin,'http://127.0.0.1:4319');
  let transportBody=input.request.body?JSON.parse(input.request.body):null;
  const isForm=transportBody?.format==='form';
  const requestBody=isForm?new FormData():input.request.body;
  if(isForm)for(const [key,value] of transportBody.entries)requestBody.append(key,value);
  const req=new Request(u,{method:input.request.method,...(isForm?{}:{headers:{'Content-Type':'application/json'}}),...(input.request.method==='GET'?{}:{body:requestBody})});
  let response;
  if(u.pathname==='/api/admin/editorial/redacao-automatica/mesa/workspace')response=await f.workspacePOST(req);
  else if(u.pathname==='/api/admin/editorial/redacao-automatica/publicacao-lote')response=await h.app.publishBatchPOST(req);
  else if(u.pathname==='/api/admin/editorial/composicao'){
   if(historicalFailures>0){historicalFailures-=1;response=Response.json({ok:false,message:'Falha histórica sintética recuperável.'},{status:503});}
   else {
    assert.ok(isForm);const form=Object.fromEntries(transportBody.entries);
    assert.equal(form.action_type,'set_historical_article_decision');assert.ok(['selected','undecided'].includes(form.decision));
    assert.match(form.matchday_id,/^[a-f0-9-]{36}$/);const ids=JSON.parse(form.article_ids_json);
    assert.ok(ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>/^[a-f0-9-]{36}$/.test(id)));
    for(const article_id of ids){
     const existing=historicalDecisions.find(row=>row.matchday_id===form.matchday_id&&row.article_id===article_id);
     if(existing)existing.decision=form.decision;else historicalDecisions.push({matchday_id:form.matchday_id,article_id,decision:form.decision});
     h.sql(`insert into jornada_private.matchday_historical_article_decisions(matchday_id,article_id,decision) values(${h.q(form.matchday_id)},${h.q(article_id)},${h.q(form.decision)}) on conflict(matchday_id,article_id) do update set decision=excluded.decision;`);
    }
    response=Response.json({ok:true,updatedCount:ids.length});
   }
  }
  else if(/^\/api\/admin\/editorial\/redacao-automatica\/source-package\/\d{4}\/\d{2}\/[a-f0-9-]{36}$/.test(u.pathname)){
   const [year,month,id]=u.pathname.split('/').slice(-3);response=await f.packageGET(req,{params:Promise.resolve({year,month,id})});
  }else return base.command(input);
  const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=null;}
  flowCalls.push({path:u.pathname,method:req.method,action:isForm?Object.fromEntries(transportBody.entries).action_type:transportBody?.action??null,status:response.status,body});
  return {status:response.status,body,...(body===null?{text}:{})};
 }
 if(input.kind==='mesa-return'){
  assert.ok(fixture?.realMesaReturn);const originalFetch=globalThis.fetch;let attempts=0;
  globalThis.fetch=async(url,init)=>{
   if(String(url).includes('/rpc/newsroom_mesa_source_counts_v1')&&++attempts===1)
    return Response.json({code:'57014',message:'statement timeout — synthetic first return'},{status:500});
   return originalFetch(url,init);
  };
  try {
   const result=await f.loadMesaPageReadModel({lifecycle:'new',classification:{mode:'all'},sourceCode:fixture.returnSourceCode,pagination:{limit:50,offset:0}});
   flowCalls.push({mesaReturn:result,attempts});return {result,attempts};
  }finally{globalThis.fetch=originalFetch;}
 }
 if(input.kind==='flow-state')return state(input.dossierId);
 if(input.kind==='source-state')return (await base.command({kind:'state'})).sourceAudit;
 if(input.kind==='manual-edit'){
  assert.ok(fixture?.articles.includes(input.articleId));
  h.sql(`update public.editorial_articles set body='Edição manual posterior protegida' where id=${h.q(input.articleId)}`);
  return true;
 }
 if(input.kind==='fail-historical'){historicalFailures=Number(input.count??1);return true;}
 if(input.kind==='text'){
  const p=h.rows(`select manifest from public.newsroom_editorial_source_packages where id=${h.q(input.packageId)}`)[0];assert.ok(p);
  const m=p.manifest,plan=m.productionIntents;
  return plan.outputs.map(o=>{
   const decision=input.noChange?.includes(o.outputId)?'SEM_ALTERAÇÃO':o.kind==='existing'?'UPDATE':'NEW';
   const prefix=`[JORNADA_CONTINUIDADE_V1]\nSLOT\n${o.slot}\nDECISAO\n${decision}\n`;
   if(decision==='SEM_ALTERAÇÃO')return prefix+'[/JORNADA_CONTINUIDADE_V1]';
   const sources=m.outputs.find(x=>x.outputId===o.outputId).contextSourceIds;
   return prefix+`FONTES_UTILIZADAS\n${sources.join(', ')}\nANTETÍTULO\nEnsaio\nTÍTULO\n${o.contextKey.startsWith('source:')?'Pote independente':'Milan / Amorim'} ${o.slot} ${o.outputId}\nPÓS-TÍTULO\nContexto separado.\nCORPO\nTexto integral sintético ${o.contextKey}.\n[/JORNADA_CONTINUIDADE_V1]`;
  }).join('\n\n');
 }
 return base.command(input);
}
console.log(JSON.stringify({ready:true}));
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{console.log(JSON.stringify({ok:true,value:await execute(JSON.parse(line))}));}
 catch(error){console.log(JSON.stringify({ok:false,error:String(error.stack),calls:flowCalls}));}
}
