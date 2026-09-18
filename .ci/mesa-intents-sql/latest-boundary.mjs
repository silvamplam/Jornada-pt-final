/** Real publication handler + real Latest TS/SQL, never the placement test double.
 * Reuses the strict PostgREST-to-Unix-PostgreSQL transport, not its publisher.
 * Auxiliary tables represent only the untouched layout system's required fields.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
process.env.MESA_UI_DRIVER='1';
const h=await import('./application.mjs');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const argv=process.argv.slice(2),out=resolve(argv[argv.indexOf('--output')+1]);
const DAY='b0000000-0000-4000-8000-000000000902';
const definitions=JSON.parse(readFileSync(out+'/latest-definitions.json','utf8'));
h.sql('create schema if not exists intent_test;');
h.rpcNames.add('set_matchday_latest_news_settings_v15');h.rpcNames.add('normalize_matchday_latest_news_order');
h.tableNames.add('matchday_latest_news');
const originalFetch=globalThis.fetch;
const placementCalls=[];
globalThis.fetch=async (input,init={})=>{
 const u=new URL(String(input)),method=init.method??'GET';
 if(u.pathname==='/rest/v1/rpc/newsroom_place_mesa_intent_latest_v1')placementCalls.push({method,path:u.pathname});
 if(u.origin!=='https://mesa-intents.test.invalid'||u.pathname!=='/rest/v1/matchday_latest_news')return originalFetch(input,init);
 placementCalls.push({method,path:u.pathname+u.search});
 if(method==='GET')return originalFetch(input,init);
 assert.ok(['POST','PATCH'].includes(method));
 const body=JSON.parse(String(init.body));const keys=Object.keys(body);
 assert.ok(keys.every(k=>['matchday_id','time_label','time_label_color','title','subtitle','image_url','link_url','article_id','status','updated_at','sort_order','created_at'].includes(k)));
 const literal=v=>v===null?'null':h.q(v);
 try{
  let text;
  if(method==='POST')text=`insert into public.matchday_latest_news(${keys.join(',')}) values(${keys.map(k=>literal(body[k])).join(',')}) returning *`;
  else {
   assert.match(u.searchParams.get('id')??'',/^eq\.[a-f0-9-]{36}$/);
   text=`update public.matchday_latest_news set ${keys.map(k=>k+'='+literal(body[k])).join(',')} where id=${h.q(u.searchParams.get('id').slice(3))} returning *`;
  }
  const result=JSON.parse(h.sql(`set role service_role; with rows as (${text}) select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from rows;`));
  return Response.json(result,{status:method==='POST'?201:200});
 }catch(e){return Response.json({message:e.message},{status:400});}
};
await build({stdin:{contents:`export * from './.ci/mesa-intents-sql/application-entry'; export {projectEditorialArticleToZone} from './lib/editorial-zone-presentation'; export {ensurePublishedArticlesInLatestBatch} from './lib/editorial-matchday-news-flow';`,resolveDir:root,sourcefile:'boundary-entry.ts'},outfile:out+'/latest-application.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:root+'/tsconfig.json',plugins:[{
 name:'server-only-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'marker'}));b.onLoad({filter:/.*/,namespace:'marker'},()=>({contents:'',loader:'js'}));}
}]});
const app=createRequire(root+'/package.json')(out+'/latest-application.cjs');
async function publish(payload){const r=await app.publishBatchPOST(new Request('http://local.invalid/api/admin/editorial/redacao-automatica/publicacao-lote',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));return {status:r.status,...await r.json()};}
const latest=()=>h.rows(`select * from public.matchday_latest_news where matchday_id=${h.q(DAY)} order by sort_order,id`);
const receiptCount=did=>h.rows(`select * from public.newsroom_mesa_intent_article_receipts where dossier_id=${h.q(did)}`).length;
const events=did=>h.rows(`select * from public.newsroom_mesa_intent_finalizations where dossier_id=${h.q(did)}`).length;
const tests=[];
async function test(name,fn){try{await fn();tests.push({name,passed:true});console.log('PASS',name);}catch(error){tests.push({name,passed:false,error:error.stack});report();throw error;}}
function report(){writeFileSync(out+'/latest-boundary-report.json',JSON.stringify({tests,passed:tests.filter(t=>t.passed).length,failed:tests.filter(t=>!t.passed).length,
 definitions,placementCalls,forbidden:h.forbidden,boundaries:['strict PostgREST over IPC; real SQL functions/Latest and bank writes','thematic allocation and full public-page rendering are not changed or certified by this suite']},null,2));}
await test('Milan/Amorim null-jornada UPDATE + Pote: only NEW enters real Latest and bank',async()=>{
 const f=h.fixture(),before=h.record('editorial_articles',f.articles[0]),p=await h.prepare(f,{independent:true}),pkg=await h.makePackage(p);
 const payload=h.publicationPayload(p,pkg);assert.equal((await publish(payload)).ok,true);
 const old=h.record('editorial_articles',f.articles[0]);assert.equal(old.slug,before.slug);assert.equal(old.matchday_id,null);
 const n=p.outputs.find(o=>o.kind==='new'),fresh=h.record('editorial_articles',n.outputId),link='/noticias/'+fresh.slug;
 assert.equal(latest().filter(r=>r.link_url===link).length,1);assert.equal(latest().filter(r=>r.link_url==='/noticias/'+old.slug).length,0);
 assert.equal(h.rows(`select * from public.matchday_editorial_bank_items where source_id=${h.q(n.outputId)}`).length,1);
 assert.equal(receiptCount(p.dossierId),1);assert.equal(events(p.dossierId),1);
 assert.equal((await publish(payload)).ok,true);assert.equal(latest().filter(r=>r.link_url===link).length,1);
});
await test('UPDATE with a matchday preserves existing Latest identity and published time',async()=>{
 const f=h.fixture();h.sql(`update public.editorial_articles set matchday_id=${h.q(DAY)},scope='matchday' where id=${h.q(f.articles[0])}`);
 const before=h.record('editorial_articles',f.articles[0]);
 h.sql(`insert into public.matchday_latest_news(matchday_id,title,link_url,status,sort_order) values(${h.q(DAY)},'Título antigo',${h.q('/noticias/'+before.slug)},'published',99)`);
 const row=latest().find(r=>r.link_url==='/noticias/'+before.slug),p=await h.prepare(f),pkg=await h.makePackage(p);
 const result=await publish(h.publicationPayload(p,pkg));assert.ok(result.ok,JSON.stringify(result));
 const now=latest().filter(r=>r.link_url==='/noticias/'+before.slug);assert.equal(now.length,1);assert.equal(now[0].id,row.id);
 assert.notEqual(now[0].title,row.title);assert.equal(h.record('editorial_articles',before.id).published_at,before.published_at);
});
await test('Only SEM ALTERAÇÃO does not read/write Latest or rewrite articles',async()=>{
 const f=h.fixture(2),before=f.articles.map(id=>h.record('editorial_articles',id)),p=await h.prepare(f),pkg=await h.makePackage(p);
 const count=placementCalls.length;assert.ok((await publish(h.publicationPayload(p,pkg,p.outputs.map(o=>o.outputId)))).ok);
 assert.equal(placementCalls.length,count);assert.deepEqual(f.articles.map(id=>h.record('editorial_articles',id)),before);
});
await test('Failure on the second real Latest insert rolls back both Latest and bank; retry completes once',async()=>{
 const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:2}),pkg=await h.makePackage(p),payload=h.publicationPayload(p,pkg);
 const ids=p.outputs.map(o=>o.outputId),array='ARRAY['+ids.map(h.q).join(',')+']::uuid[]';
 const sequence='latest_attempts_'+randomUUID().replaceAll('-','');
 h.sql(`create sequence intent_test.${sequence};
 create function intent_test.fail_second_latest() returns trigger language plpgsql as $$ begin
   if exists(select 1 from public.editorial_articles a where a.id=any(${array}) and '/noticias/'||a.slug=new.link_url)
     and nextval('intent_test.${sequence}')=2 then raise exception 'injected-latest-write-failure'; end if;
   return new; end; $$;
 create trigger latest_test_failure before insert on public.matchday_latest_news for each row execute function intent_test.fail_second_latest();`);
 let failed;
 try { failed=await publish(payload); }
 finally {h.sql('drop trigger latest_test_failure on public.matchday_latest_news; drop function intent_test.fail_second_latest();');}
 assert.equal(failed.error,'theme-continuity-latest-failed',JSON.stringify(failed));
 assert.equal(h.sql(`select last_value from intent_test.${sequence};`),'2');
 assert.equal(receiptCount(p.dossierId),0);assert.equal(events(p.dossierId),0);
 for(const id of ids){const a=h.record('editorial_articles',id);assert.ok(a);assert.equal(latest().filter(r=>r.link_url==='/noticias/'+a.slug).length,0);}
 assert.equal(h.rows(`select * from public.matchday_editorial_bank_items where source_id=any(${array}::text[])`).length,0);
 assert.ok((await publish(payload)).ok);
 for(const id of ids){const a=h.record('editorial_articles',id);assert.equal(latest().filter(r=>r.link_url==='/noticias/'+a.slug).length,1);}
 assert.equal(receiptCount(p.dossierId),2);assert.equal(events(p.dossierId),1);
});
await test('Concurrent identical publication attempts do not duplicate Latest',async()=>{
 const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:1}),pkg=await h.makePackage(p),payload=h.publicationPayload(p,pkg);
 const results=await Promise.all([publish(payload),publish(payload)]);assert.ok(results.every(r=>r.ok),JSON.stringify(results));
 const fresh=h.record('editorial_articles',p.outputs[0].outputId);
 assert.equal(latest().filter(r=>r.link_url==='/noticias/'+fresh.slug).length,1,'Duplicate Latest rows');
 assert.equal(events(p.dossierId),1);
});
await test('Different dossiers sharing a matchday serialize Latest ordering without losing either output',async()=>{
 const inputs=[];
 for(let i=0;i<2;i++){const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:1}),pkg=await h.makePackage(p);inputs.push({p,payload:h.publicationPayload(p,pkg)});}
 const results=await Promise.all(inputs.map(x=>publish(x.payload)));assert.ok(results.every(r=>r.ok),JSON.stringify(results));
 for(const {p} of inputs){const a=h.record('editorial_articles',p.outputs[0].outputId);assert.equal(latest().filter(r=>r.link_url==='/noticias/'+a.slug).length,1);}
 const rows=latest();assert.equal(new Set(rows.map(r=>r.sort_order)).size,rows.length);
});
// True overlapping PostgreSQL transactions, rather than only Promise
// interleaving between synchronous RPC requests. The first transaction holds
// its locks after placement; pg_stat_activity proves the second actually waits.
const args=Object.fromEntries(argv.reduce((pairs,v,i,all)=>i%2?pairs:[...pairs,[v,all[i+1]]],[]));
const pg=args['--container']?['docker','exec','-i',args['--container'],'psql']:[args['--psql']||'psql','-h',args['--socket']];
pg.push('-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','mesa_organization_test');
function transaction(query) {
 const env=Object.fromEntries(['PATH','LD_LIBRARY_PATH'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 const child=spawn(pg[0],pg.slice(1),{env,stdio:['pipe','pipe','pipe']});
 const done=new Promise((resolve,reject)=>{
  let output='',error='';const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Concurrent SQL probe timed out'));},12000);
  child.stdout.on('data',v=>{output+=v.toString();});child.stderr.on('data',v=>{error+=v.toString();});
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new Error(error||'psql exit '+code));else resolve(output.trim());});
 });
 child.stdin.end("set statement_timeout='8s';set lock_timeout='6s';"+query);
 return done;
}
async function waitForActivity(marker,predicate) {
 const until=Date.now()+5000;
 while(Date.now()<until){
  if(h.sql(`select count(*) from pg_stat_activity where application_name=${h.q(marker)} and (${predicate});`)==='1')return;
  await new Promise(r=>setTimeout(r,15));
 }
 throw new Error('Expected live PostgreSQL lock checkpoint not observed: '+marker);
}
async function pendingLatest() {
 const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:1}),pkg=await h.makePackage(p),payload=h.publicationPayload(p,pkg);
 globalThis.__intentFailPlacement=true;
 try{assert.equal((await publish(payload)).error,'theme-continuity-latest-failed');}finally{globalThis.__intentFailPlacement=false;}
 const call=`select result from public.newsroom_place_mesa_intent_latest_v1(${h.q(p.dossierId)},${h.q(pkg.manifest.packageId)},ARRAY[${h.q(p.outputs[0].outputId)}]::uuid[]);`;
 return {p,payload,call};
}
for(const sameDossier of [true,false])await test(sameDossier
 ?'Overlapping SQL transactions: second placement waits for the same workspace lock'
 :'Overlapping SQL transactions: different dossiers wait for their shared matchday lock',async()=>{
 const a=await pendingLatest(),b=sameDossier?a:await pendingLatest();
 const first='latest-holder-'+randomUUID(),second='latest-waiter-'+randomUUID();
 const operations=[];
 try{
  operations.push(transaction(`set application_name=${h.q(first)};begin;${a.call}select pg_sleep(1.5);commit;`));
  await waitForActivity(first,"wait_event='PgSleep'");
  operations.push(transaction(`set application_name=${h.q(second)};begin;${b.call}commit;`));
  await waitForActivity(second,"wait_event_type='Lock'");
  const results=await Promise.all(operations);
  for(const r of results)assert.equal(JSON.parse(r).action,'placed');
 }finally{await Promise.allSettled(operations);}
 for(const entry of sameDossier?[a]:[a,b]){
  const article=h.record('editorial_articles',entry.p.outputs[0].outputId);
  assert.equal(latest().filter(r=>r.link_url==='/noticias/'+article.slug).length,1);
  assert.equal(receiptCount(entry.p.dossierId),0,'Placement alone must not certify the cycle');
  assert.ok((await publish(entry.payload)).ok);assert.equal(events(entry.p.dossierId),1);
 }
});
await test('Existing duplicate is reported, never silently removed or certified',async()=>{
 const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:1}),pkg=await h.makePackage(p),payload=h.publicationPayload(p,pkg);
 // Stop after canonical publication, before placement; then simulate pre-existing
 // legacy duplicate rows in this disposable fixture. No production repair.
 globalThis.__intentFailPlacement=true;
 try{assert.equal((await publish(payload)).error,'theme-continuity-latest-failed');}finally{globalThis.__intentFailPlacement=false;}
 const a=h.record('editorial_articles',p.outputs[0].outputId),link='/noticias/'+a.slug;
 h.sql(`insert into public.matchday_latest_news(matchday_id,title,link_url,status,sort_order)
   values(${h.q(DAY)},'Preservar A',${h.q(link)},'published',1001),(${h.q(DAY)},'Preservar B',${h.q(link)},'published',1002);`);
 const before=latest().filter(r=>r.link_url===link),response=await publish(payload);
 assert.equal(response.error,'theme-continuity-latest-failed');assert.match(JSON.stringify(response),/mesa-intent-latest-existing-duplicate/);
 assert.deepEqual(latest().filter(r=>r.link_url===link),before);assert.equal(receiptCount(p.dossierId),0);assert.equal(events(p.dossierId),0);
});
await test('Completed replay does not restore an entry removed later by an editor',async()=>{
 const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:1}),pkg=await h.makePackage(p),payload=h.publicationPayload(p,pkg);
 assert.ok((await publish(payload)).ok);const a=h.record('editorial_articles',p.outputs[0].outputId);
 h.sql(`delete from public.matchday_latest_news where matchday_id=${h.q(DAY)} and link_url=${h.q('/noticias/'+a.slug)};`);
 assert.ok((await publish(payload)).ok);assert.equal(latest().filter(r=>r.link_url==='/noticias/'+a.slug).length,0);assert.equal(events(p.dossierId),1);
});
await test('Physical Latest settings preserve approved title, color and placement; downstream context is cleared',async()=>{
 const day=randomUUID();h.sql(`insert into public.matchdays(id,season_id) values(${h.q(day)},'b0000000-0000-4000-8000-000000000901');
 insert into jornada_private.matchday_live_layout_physical_cutovers values(${h.q(day)},'ensaio');
 insert into public.matchday_editorial_profile_assignments values(${h.q(day)},'ensaio');
 insert into public.matchday_live_layout_workspace_settings values(${h.q(day)},'editorial_line','Título aprovado','#123ABC','hidden',now());`);
 const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:1}),pkg=await h.makePackage(p),payload={...h.publicationPayload(p,pkg),matchdayId:day};
 const response=await publish(payload);assert.ok(response.ok,JSON.stringify(response));
 const setting=h.rows(`select * from public.matchday_live_layout_workspace_settings where matchday_id=${h.q(day)}`)[0];
 assert.equal(setting.latest_zone_mode,'latest_news');assert.equal(setting.latest_zone_title,'Título aprovado');assert.equal(setting.latest_zone_title_color,'#123ABC');assert.equal(setting.latest_zone_placement,'hidden');
 assert.equal(h.sql('select count(*) from jornada_private.matchday_live_layout_downstream_context;'),'0');
 assert.equal(h.rows(`select * from public.matchday_latest_news where matchday_id=${h.q(day)}`).length,1);
});
await test('RPC rejects unauthorized roles, forged sets, another package and manually edited canonical results',async()=>{
 const f=h.fixture(),p=await h.prepare(f,{review:false,fresh:2}),pkg=await h.makePackage(p),payload=h.publicationPayload(p,pkg);
 globalThis.__intentFailPlacement=true;try{await publish(payload);}finally{globalThis.__intentFailPlacement=false;}
 const ids=p.outputs.map(o=>o.outputId),call=(a=ids,pid=pkg.manifest.packageId)=>`select * from public.newsroom_place_mesa_intent_latest_v1(${h.q(p.dossierId)},${h.q(pid)},ARRAY[${a.map(h.q).join(',')}]::uuid[])`;
 // makePackage returns manifest, transfer, etc.; package ID is in manifest.
 const pid=pkg.manifest.packageId;
 for(const role of ['anon','authenticated'])assert.throws(()=>h.sql('set role '+role+';'+call(ids,pid)),/permission denied/);
 assert.throws(()=>h.sql(call(ids.slice(1),pid)),/mesa-intent-latest-article-set-invalid/);
 assert.throws(()=>h.sql(call([ids[0],ids[0]],pid)),/mesa-intent-latest-input-invalid/);
 assert.throws(()=>h.sql(call(ids,randomUUID())),/package/);
 const allowed=JSON.parse(h.sql('set role service_role;select result from ('+call(ids,pid)+') r;'));
 assert.equal(allowed.action,'placed');assert.equal(allowed.articleCount,2);
 const before=h.record('editorial_articles',ids[0]);
 h.sql(`update public.editorial_articles set body='Edição manual protegida' where id=${h.q(ids[0])};`);
 assert.throws(()=>h.sql(call(ids,pid)),/mesa-intent-published-result-stale/);
 assert.equal(h.record('editorial_articles',ids[0]).body,'Edição manual protegida');assert.equal(receiptCount(p.dossierId),0);
 // Do not restore the manually edited article or attempt to certify this cycle.
 assert.notEqual(before.body,'Edição manual protegida');
});
await test('Atomic projection matches the unchanged TS presentation, including winter/summer time',async()=>{
 for(const date of ['2026-01-10T00:15:00Z','2026-09-10T23:15:00Z']){
  const f=h.fixture();h.sql(`update public.editorial_articles set matchday_id=${h.q(DAY)},scope='matchday',published_at=${h.q(date)} where id=${h.q(f.articles[0])};`);
  const p=await h.prepare(f),pkg=await h.makePackage(p);assert.ok((await publish(h.publicationPayload(p,pkg))).ok);
  const a=h.record('editorial_articles',f.articles[0]),projection=app.projectEditorialArticleToZone(a,'editorial_line_item');
  const row=latest().find(r=>r.link_url===projection.linkUrl);assert.ok(row);
  assert.deepEqual({title:row.title,subtitle:row.subtitle,imageUrl:row.image_url,label:row.time_label,linkUrl:row.link_url},projection);
 }
});
await test('Unchanged legacy Latest writer still inserts and updates the same entry and bank',async()=>{
 const f=h.fixture();h.sql(`update public.editorial_articles set matchday_id=${h.q(DAY)},scope='matchday' where id=${h.q(f.articles[0])};`);
 const a=h.record('editorial_articles',f.articles[0]);await app.ensurePublishedArticlesInLatestBatch([a]);
 const row=latest().find(r=>r.link_url==='/noticias/'+a.slug);assert.ok(row);
 const modified={...a,title:'Título legado revisto'};await app.ensurePublishedArticlesInLatestBatch([modified]);
 const again=latest().filter(r=>r.link_url==='/noticias/'+a.slug);assert.equal(again.length,1);assert.equal(again[0].id,row.id);assert.equal(again[0].title,modified.title);
 assert.equal(h.rows(`select * from public.matchday_editorial_bank_items where source_id=${h.q(a.id)}`).length,1);
});
report();assert.deepEqual(h.forbidden,[]);console.log(`RESULT: ${tests.length} real Latest boundary groups passed`);
