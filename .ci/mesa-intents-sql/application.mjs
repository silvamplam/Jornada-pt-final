/** End-to-end application/SQL integration with a local, strict PostgREST double.
 * All requests are translated to real SQL in the already seeded disposable DB.
 * This is not a browser test. Public page placement is an observable boundary.
 * No production credentials, external network, AI call or source refetch is used.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,v,i,all) => i%2 ? pairs : [...pairs,[v,all[i+1]]],[]));
assert.ok(Object.keys(options).every(k => ['--socket','--psql','--container','--output'].includes(k)));
const output=resolve(options['--output'] || '/tmp/mesa-intents-application'); mkdirSync(output,{recursive:true});
let command;
if(options['--container']) {
  assert.match(options['--container'],/^[0-9a-f]{12,64}$/); assert.ok(!options['--socket']);
  command=['docker','exec','-i',options['--container'],'psql'];
} else {
  assert.ok(options['--socket']?.startsWith('/'),'Absolute disposable Unix socket required');
  command=[options['--psql'] || 'psql','-h',options['--socket']];
}
command.push('-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','mesa_organization_test');
const env=Object.fromEntries(['PATH','LD_LIBRARY_PATH'].filter(k => process.env[k]).map(k=>[k,process.env[k]]));
function sql(query) {
  const p=spawnSync(command[0],command.slice(1),{input:"set statement_timeout='20s'; set lock_timeout='5s';\n"+query,encoding:'utf8',env,timeout:30000,maxBuffer:20*1024*1024});
  if(p.status!==0) throw new Error(p.stderr || String(p.error));
  return p.stdout.trim();
}
const identity=sql("select current_database()||'|'||current_setting('server_version_num')||'|'||coalesce(inet_server_addr()::text,'unix-socket');");
assert.equal(identity,'mesa_organization_test|170006|unix-socket');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const json=v=>q(JSON.stringify(v))+'::jsonb';
const identifier=s=>{assert.match(s,/^[a-z_][a-z0-9_]*$/);return '"'+s+'"';};
const rows=query=>JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (${query}) r;`));
const record=(table,id)=>rows(`select * from public.${identifier(table)} where id=${q(id)}`)[0];
const rpcNames=new Set(['newsroom_mesa_preview_intents_v1','newsroom_prepare_mesa_intents_v1','newsroom_publish_mesa_intent_output_v1','newsroom_finalize_mesa_intents_v1','newsroom_mesa_intent_latest_receipts_v1','newsroom_place_mesa_intent_latest_v1']);
const tableNames=new Set(['newsroom_articles','newsroom_article_snapshots','newsroom_editorial_source_packages','editorial_articles','newsroom_mesa_output_publications','newsroom_mesa_production_contexts','newsroom_editorial_dossier_article_plans','competitions','seasons','matchdays']);
const rpcLiteral=(key,value)=>value===null?'null':Array.isArray(value)?`ARRAY[${value.map(q).join(',')}]::uuid[]`:typeof value==='object'?json(value):q(value);
const calls=[]; const forbidden=[];
function where(params) {
  return [...params].filter(([k])=>!['select','limit','order','offset'].includes(k)).map(([k,v])=>{
    const c=identifier(k);
    if(v.startsWith('eq.')) return c+'='+q(v.slice(3));
    if(v.startsWith('in.(') && v.endsWith(')')) return c+' in ('+v.slice(4,-1).split(',').map(q).join(',')+')';
    if(v==='is.null') return c+' is null';
    throw new Error('Unsupported test filter '+k+'='+v);
  }).join(' and ') || 'true';
}
globalThis.fetch=async (input,init={})=>{
  const u=new URL(String(input));
  if(u.origin!=='https://mesa-intents.test.invalid'||!u.pathname.startsWith('/rest/v1/')) {
    forbidden.push(u.toString()); throw new Error('External network forbidden: '+u);
  }
  const path=u.pathname.slice('/rest/v1/'.length), method=init.method||'GET';
  calls.push({path,method});
  try {
    let result;
    if(path.startsWith('rpc/')) {
      const name=path.slice(4); assert.ok(rpcNames.has(name),'Unapproved test RPC '+name);
      const values=method==='POST'?JSON.parse(String(init.body)):Object.fromEntries([...u.searchParams].filter(([k])=>k.startsWith('p_')));
      if(name==='newsroom_place_mesa_intent_latest_v1' && globalThis.__intentFailPlacement) throw new Error('test-placement-failure');
      result=rows(`select * from public.${identifier(name)}(${Object.entries(values).map(([k,v])=>identifier(k)+'=>'+rpcLiteral(k,v)).join(',')})`);
    } else {
      assert.ok(tableNames.has(path),'Unsupported test table '+path);
      const table='public.'+identifier(path);
      if(method==='GET') {
        const select=u.searchParams.get('select') || '*';
        const cols=select==='*'?'*':select.split(',').map(identifier).join(',');
        const limit=u.searchParams.get('limit'); if(limit) assert.match(limit,/^\d+$/);
        const order=u.searchParams.get('order');
        result=rows(`select ${cols} from ${table} where ${where(u.searchParams)}`+(order?' order by '+order.split(',').map(v=>{const [c,d]=v.split('.'); assert.ok(!d||['asc','desc'].includes(d));return identifier(c)+' '+(d||'asc');}).join(','):'')+(limit?' limit '+limit:'')+(u.searchParams.has('offset')?' offset '+Number(u.searchParams.get('offset')):''));
      } else {
        assert.equal(path,'newsroom_editorial_source_packages','Only package writes outside approved RPCs');
        const body=JSON.parse(String(init.body)), keys=Object.keys(body);
        assert.ok(keys.every(k=>['id','created_at','updated_at','package_year','package_month','manifest','markdown'].includes(k)));
        const literal=(k,v)=>k==='manifest'?json(v):v===null?'null':q(v);
        if(method==='POST') result=JSON.parse(sql(`with w as (insert into ${table}(${keys.map(identifier).join(',')}) values(${keys.map(k=>literal(k,body[k])).join(',')}) returning *) select jsonb_agg(to_jsonb(w)) from w;`));
        else if(method==='PATCH') result=JSON.parse(sql(`with w as(update ${table} set ${keys.map(k=>identifier(k)+'='+literal(k,body[k])).join(',')} where ${where(u.searchParams)} returning *) select coalesce(jsonb_agg(to_jsonb(w)),'[]') from w;`));
        else throw new Error('Unsupported method '+method);
      }
    }
    return Response.json(result,{status:method==='POST'?201:200});
  } catch(error) {
    writeFileSync(output+'/last-transport-error.txt',String(error.stack));
    return Response.json({message:String(error.message)},{status:400});
  }
};
process.env.SUPABASE_URL='https://mesa-intents.test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-not-a-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://mesa-intents.test.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='';
process.env.JORNADA_EDITORIAL_LOCAL_IMAGE_DIR='';
globalThis.__intentPlacements=[];
globalThis.__intentFailPlacement=false;
await build({entryPoints:[root+'/.ci/mesa-intents-sql/application-entry.ts'],outfile:output+'/application.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:root+'/tsconfig.json',plugins:[{
  name:'explicit-test-boundaries', setup(b) {
    b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'test'}));
    b.onResolve({filter:/^@\/lib\/editorial-matchday-news-flow$/},()=>({path:'placement',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='server-only'?'':`
      export class EditorialMatchdayNewsFlowError extends Error {}
      export async function ensurePublishedArticlesInLatestBatch(input) {
        globalThis.__intentPlacements.push(structuredClone(input));
        if(globalThis.__intentFailPlacement) throw new Error('test-placement-failure');
        return {affectedMatchdayIds:[],syncFailures:[]};
      }
      export const ensurePublishedArticleInLatest=async()=>{throw new Error('unexpected single placement')};
      export const finalizePublishedArticlesInLatestBatch=async()=>{throw new Error('unexpected legacy finalizer')};
      export const placePublishedArticleInitially=async()=>{throw new Error('unexpected generic publisher')};
    `,loader:'js'}));
  }
}]});
// External runtime dependencies resolve relative to the bundle, not the runner.
const {createRequire}=await import('node:module');
const require=createRequire(root+'/package.json');
process.env.NODE_PATH=root+'/node_modules'; require('module').Module._initPaths();
const app=require(output+'/application.cjs');
const DAY='b0000000-0000-4000-8000-000000000902';
function source(title) {
  const id=randomUUID(),sid=randomUUID();
  sql(`insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,detected_at,first_detected_at,last_detected_at,processing_status,published_at,image_url)
    values(${q(id)},'__intent_test__',${q('https://example.invalid/'+id)},${q('https://example.invalid/'+id)},${q(title)},now(),now(),now(),'ready_for_review','2026-09-17T11:00:00Z','https://example.invalid/image.jpg');
    insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at) values(${q(sid)},${q(id)},repeat('a',64),${json([{type:'paragraph',text:title+' — material sintético exclusivo.'}])},'{"publishedAtPrecision":"instant"}','2026-09-17T12:00:00Z');
    insert into public.newsroom_editorial_article_classifications(newsroom_article_id,classification_key,classification_source) values(${q(id)},'sporting','automatic');`);
  return {id,sid};
}
function fixture(published=1) {
  const theme=randomUUID(),material=source('Milan / Amorim'),loose=source('Pote independente'),articles=[];
  sql(`insert into public.newsroom_editorial_themes(id,title,classification_key) values(${q(theme)},'Milan / Amorim','sporting'); select public.newsroom_set_editorial_theme_source_membership_v1(${q(theme)},${q(material.id)},true);`);
  for(let i=0;i<published;i++) {
    const id=randomUUID();articles.push(id);
    sql(`insert into public.editorial_articles(id,status,scope,slug,label,title,subtitle,body,author,image_url,competition_id,season_id,matchday_id,published_at,image_caption)
    values(${q(id)},'published','competition',${q('milan-'+id)},'Ante','Milan / Amorim publicado','Pós','Corpo antigo','Editor antigo','https://example.invalid/old.jpg','b0000000-0000-4000-8000-000000000900','b0000000-0000-4000-8000-000000000901',null,'2026-09-17T09:00:00Z','Legenda antiga');
    insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id) values(${q(theme)},${q(id)});`);
  }
  return {theme,material,loose,articles};
}
function request(f,{review=true,fresh=0,independent=false,defer=false}={}) {
  return {version:1,preparationKey:randomUUID(),title:'Produção de teste',themes:[defer?{themeId:f.theme,action:'defer'}:{themeId:f.theme,action:'prepare',reviewPublished:review,newArticleCount:fresh}],sources:independent?[{sourceId:f.loose.id,destination:'independent',newArticleCount:1}]:[]};
}
async function prepare(f,options) {
  const req=request(f,options),preview=await app.mesaIntentService.preview(req);
  const result=await app.mesaIntentService.prepare(req,preview.authorityFingerprint);
  assert.equal(result.preparationAction,'created');
  assert.equal((await app.mesaIntentService.prepare(req,preview.authorityFingerprint)).preparationAction,'reused');
  return result.plan;
}
async function makePackage(plan) {
  const sourceRows=rows(`select * from public.newsroom_editorial_dossier_sources where dossier_id=${q(plan.dossierId)} order by id`);
  const contextSources=rows(`select * from public.newsroom_mesa_production_context_sources where dossier_id=${q(plan.dossierId)}`);
  const outputs=plan.outputs.map((o,i)=>{
    const sourceIds=contextSources.filter(s=>s.production_context_id===o.productionContextId).map(s=>s.dossier_source_id);
    return {position:i+1,outputId:o.outputId,sourceArticlePosition:1,startingPointSourceId:sourceIds[0],contextSourceIds:sourceIds,focus:o.slot,
      imageNewsroomArticleId:null,publishedArticleId:o.target?.editorialArticleId??null,publishedSlug:o.target?.slug??null,
      articlePlan:{dossierId:plan.dossierId,articlePlanId:o.outputId,contextId:o.productionContextId,workingTitle:o.slot,
        articleKind:'news',articleKindLabel:'Notícia',lengthMode:'standard',lengthModeLabel:'Normal',editorialInstructions:'',
        destination:o.kind==='existing'?'update':'new',workspaceContractVersion:2,sourceScope:'context'}};
  });
  const result=await app.createEditorialSourcePackage({packageId:randomUUID(),productionIntents:plan,now:new Date('2026-09-18T12:00:00Z'),
    selections:sourceRows.map(s=>({newsroomArticleId:s.newsroom_article_id,newsroomSnapshotId:s.newsroom_snapshot_id,provenanceSourceId:s.id,articleGroup:1})),
    outputs,editorial:{genre:'news',genreLabel:'Notícia',suggestedTitle:null,additionalInstructions:null}});
  assert.ok(result.ok,JSON.stringify(result));
  const {manifest,markdown}=result.value;
  assert.ok(app.validateMesaProductionIntentsManifest(manifest));
  const read=await app.readEditorialSourcePackageManifest(manifest);assert.ok(read.ok,JSON.stringify(read));
  assert.deepEqual(read.value.productionIntents,plan);
  const bc=app.editorialMesaPackageBatchContract(manifest);assert.equal(bc.kind,'mesa-v2');
  const transfer=app.parseEditorialBatchTransferSourcePackage(JSON.stringify({year:manifest.year,month:manifest.month,packageId:manifest.packageId,productionIntents:plan,batchContract:bc.value}));
  assert.ok(transfer);assert.deepEqual(transfer.productionIntents,plan);
  return {manifest,markdown,transfer};
}
function text(plan,manifest,nochange=[]) {
  return plan.outputs.map(o=>{
    const decision=nochange.includes(o.outputId)?'SEM_ALTERAÇÃO':o.kind==='existing'?'UPDATE':'NEW';
    const prefix=`[JORNADA_CONTINUIDADE_V1]\nSLOT\n${o.slot}\nDECISAO\n${decision}\n`;
    if(decision==='SEM_ALTERAÇÃO') return prefix+'[/JORNADA_CONTINUIDADE_V1]';
    const s=manifest.outputs.find(x=>x.outputId===o.outputId).contextSourceIds;
    return prefix+`FONTES_UTILIZADAS\n${s.join(', ')}\nANTETÍTULO\nEnsaio\nTÍTULO\n${o.contextKey.startsWith('source:')?'Pote independente':'Milan / Amorim'} ${o.slot} ${o.outputId}\nPÓS-TÍTULO\nContexto separado.\nCORPO\nTexto integral sintético ${o.contextKey}.\n[/JORNADA_CONTINUIDADE_V1]`;
  }).join('\n\n');
}
function returned(plan,pkg,nochange=[]) {
  const raw=text(plan,pkg.manifest,nochange);
  const preflight=app.preflightEditorialArticleBatchForSourcePackage(raw,pkg.transfer);
  assert.ok(preflight.ready,JSON.stringify(preflight));
  const transfer={...pkg.transfer,continuityResolution:{noChangeOutputIds:preflight.noChangeOutputIds,materializedOutputIds:preflight.articles.map(a=>a.outputId)}};
  assert.ok(app.parseEditorialBatchTransferSourcePackage(JSON.stringify(transfer)));
  assert.ok(app.validateEditorialThemeContinuityProvenance(pkg.manifest,preflight.articles,nochange).ok);
  return {raw,preflight,transfer};
}
async function api(payload) {
  const response=await app.publishBatchPOST(new Request('http://local.invalid/api/admin/editorial/redacao-automatica/publicacao-lote',{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'application/json'}}));
  return {status:response.status,...await response.json()};
}
function publicationPayload(plan,pkg,nochange=[]) {
  const result=returned(plan,pkg,nochange);
  return {action:'publish_theme_continuity',author:'Editor de teste',matchdayId:DAY,sourcePackage:result.transfer,
    articles:result.preflight.articles.map(a=>({index:a.index,key:a.key,outputId:a.outputId,sourceIds:a.sourceIds,label:a.label,title:a.title,subtitle:a.subtitle,body:a.body})),
    imageUrlsByOutputId:Object.fromEntries(plan.outputs.filter(o=>o.kind==='new').map(o=>[o.outputId,'https://example.invalid/new.jpg']))};
}
const results=[];
async function test(name,fn) {
  try { await fn();results.push({name,passed:true});console.log('PASS',name); }
  catch(error) {results.push({name,passed:false,error:String(error.stack)});report();throw error;}
}
function report() {writeFileSync(output+'/application-report.json',JSON.stringify({identity,tests:results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,forbidden,calls,placementBoundary:'intents use real atomic Latest SQL; only legacy placement retains its observable double; full public rendering NOT tested',browser:'NOT tested'},null,2));}
if (process.env.MESA_UI_DRIVER !== '1') {
await test('Milan / Amorim + Pote: preparation → real package → transfer → returned text → API → SQL → receipts',async()=>{
  const f=fixture(),before=record('editorial_articles',f.articles[0]),p=await prepare(f,{independent:true}),pkg=await makePackage(p);
  const payload=publicationPayload(p,pkg),check=await api({...payload,action:'preflight'});
  assert.ok(check.ok,JSON.stringify(check));
  const published=await api(payload);assert.ok(published.ok,JSON.stringify(published));
  const after=record('editorial_articles',before.id);
  for(const key of ['id','slug','scope','competition_id','season_id','matchday_id','published_at','image_caption','created_at']) assert.deepEqual(after[key],before[key],key);
  assert.notEqual(after.body,before.body);assert.equal(after.matchday_id,null);
  const newOutput=p.outputs.find(o=>o.kind==='new'),fresh=record('editorial_articles',newOutput.outputId);
  assert.ok(fresh);assert.match(fresh.title,/Pote/);
  assert.equal(rows(`select * from public.newsroom_editorial_theme_articles where theme_id=${q(f.theme)}`).length,1);
  const receipts=await app.mesaIntentService.readReceipts(f.theme);assert.equal(receipts.length,1);assert.equal(receipts[0].decision,'UPDATE');
  assert.equal(rows(`select * from public.newsroom_editorial_theme_sources where theme_id=${q(f.theme)}`).length,1);
  assert.equal((await api(payload)).ok,true,'Exact retry through actual API');
  writeFileSync(output+'/mixed-application.json',JSON.stringify({plan:p,manifest:pkg.manifest,transfer:payload.sourcePackage,published,articles:[after,fresh],receipts},null,2));
});
await test('Only SEM ALTERAÇÃO closes the cycle, no canonical article is rewritten',async()=>{
  const f=fixture(2),before=f.articles.map(id=>record('editorial_articles',id)),p=await prepare(f),pkg=await makePackage(p);
  const ids=p.outputs.map(o=>o.outputId),payload=publicationPayload(p,pkg,ids);
  payload.author='';payload.matchdayId='';
  const r=await api(payload);assert.ok(r.ok,JSON.stringify(r));
  assert.equal(r.noChangeCount,2);assert.equal(r.updatedCount+r.newCount,0);
  assert.deepEqual(f.articles.map(id=>record('editorial_articles',id)),before);
  assert.equal(rows(`select * from public.newsroom_mesa_output_publications where dossier_id=${q(p.dossierId)}`).length,0);
  assert.equal((await app.mesaIntentService.readReceipts(f.theme)).length,2);
  assert.ok((await api(payload)).ok);
});
await test('NEW without review keeps old reference pending; next review evaluates both published articles',async()=>{
  const f=fixture(),old=record('editorial_articles',f.articles[0]);
  const p=await prepare(f,{review:false,fresh:1}),pkg=await makePackage(p);
  assert.equal(p.outputs.length,1);assert.equal(p.outputs[0].kind,'new');
  assert.match(pkg.markdown,/Não rever|não rever|apenas.*referência|só.*referência/i);
  assert.ok(pkg.markdown.includes(old.body),'Published history remains a reference');
  assert.ok((await api(publicationPayload(p,pkg))).ok);
  assert.deepEqual(record('editorial_articles',old.id),old);
  const r=await app.mesaIntentService.readReceipts(f.theme);
  assert.equal(r.length,1);assert.equal(r[0].decision,'NEW');assert.notEqual(r[0].articleId,old.id);
  const next=await prepare(f),c=next.contexts.find(c=>c.themeId===f.theme);
  assert.equal(next.outputs.length,2);assert.ok(next.outputs.every(o=>o.kind==='existing'));
  const continuity=await app.readMesaIntentArticleContinuity(c);
  assert.ok(continuity.find(a=>a.articleId===old.id).sources.every(s=>s.change==='UNKNOWN'));
  assert.ok(continuity.find(a=>a.articleId!==old.id).sources.every(s=>s.change==='UNCHANGED_SOURCE'));
  const pkg2=await makePackage(next),done=await api(publicationPayload(next,pkg2,next.outputs.map(o=>o.outputId)));
  assert.ok(done.ok,JSON.stringify(done));assert.equal(done.noChangeCount,2);
  assert.ok((await app.readMesaIntentArticleContinuity(c)).every(a=>a.sources.every(s=>s.change==='UNCHANGED_SOURCE')));
});
await test('Review plus requested new count; mixed UPDATE and SEM ALTERAÇÃO and NEW',async()=>{
  const f=fixture(2),p=await prepare(f,{fresh:2}),pkg=await makePackage(p);
  const unchanged=p.outputs.filter(o=>o.kind==='existing')[1],before=record('editorial_articles',unchanged.target.editorialArticleId);
  const r=await api(publicationPayload(p,pkg,[unchanged.outputId]));assert.ok(r.ok,JSON.stringify(r));
  assert.deepEqual([r.updatedCount,r.noChangeCount,r.newCount],[1,1,2]);
  assert.deepEqual(record('editorial_articles',before.id),before);
  assert.equal((await app.mesaIntentService.readReceipts(f.theme)).length,4);
});
await test('Theme without published articles accepts NEW, refuses review; draft is not published',async()=>{
  const f=fixture(1);
  sql(`update public.editorial_articles set status='draft' where id=${q(f.articles[0])}`);
  await assert.rejects(()=>prepare(f),/mesa-intent-nothing-to-review/);
  const p=await prepare(f,{review:false,fresh:1}),pkg=await makePackage(p);
  assert.equal(p.contexts[0].publishedArticles.length,0);
  assert.ok((await api(publicationPayload(p,pkg))).ok);
  assert.equal(record('editorial_articles',f.articles[0]).status,'draft');
});
await test('Explicitly deferred Theme remains untouched while independent source publishes',async()=>{
  const f=fixture(),before=record('editorial_articles',f.articles[0]),p=await prepare(f,{independent:true,defer:true}),pkg=await makePackage(p);
  assert.equal(p.contexts.length,1);assert.equal(p.contexts[0].kind,'source');
  assert.ok((await api(publicationPayload(p,pkg))).ok);
  assert.deepEqual(record('editorial_articles',before.id),before);
  assert.deepEqual(await app.mesaIntentService.readReceipts(f.theme),[]);
});
await test('Placement failure leaves publication partial, retry reuses exact payload then finalizes',async()=>{
  const f=fixture(),p=await prepare(f,{independent:true}),pkg=await makePackage(p),payload=publicationPayload(p,pkg);
  globalThis.__intentFailPlacement=true;
  let partial;try{partial=await api(payload);}finally{globalThis.__intentFailPlacement=false;}
  assert.equal(partial.ok,false);assert.equal(partial.error,'theme-continuity-latest-failed');assert.ok(partial.partialPersistence);
  assert.deepEqual(await app.mesaIntentService.readReceipts(f.theme),[]);
  const writes=rows(`select * from public.newsroom_mesa_output_publications where dossier_id=${q(p.dossierId)}`);
  assert.equal(writes.length,2);
  const r=await api(payload);assert.ok(r.ok,JSON.stringify(r));assert.ok(r.completed.every(x=>x.action==='reused'));
  assert.equal(rows(`select * from public.newsroom_mesa_output_publications where dossier_id=${q(p.dossierId)}`).length,2);
});
await test('Manual edit after a partial cycle blocks API retry; article is not overwritten or certified',async()=>{
  const f=fixture(),p=await prepare(f,{independent:true}),pkg=await makePackage(p),payload=publicationPayload(p,pkg);
  globalThis.__intentFailPlacement=true;try{assert.equal((await api(payload)).ok,false);}finally{globalThis.__intentFailPlacement=false;}
  sql(`update public.editorial_articles set body='Manual protected text' where id=${q(f.articles[0])}`);
  const r=await api(payload);assert.equal(r.ok,false);assert.match(r.detail,/retry-conflict|stale/);
  assert.equal(record('editorial_articles',f.articles[0]).body,'Manual protected text');
  assert.deepEqual(await app.mesaIntentService.readReceipts(f.theme),[]);
});
await test('Cross-context returned sources, forged plan and downgrade request are refused before writes',async()=>{
  const f=fixture(),p=await prepare(f,{independent:true}),pkg=await makePackage(p);
  const raw=text(p,pkg.manifest),source0=pkg.manifest.outputs[0].contextSourceIds[0],source1=pkg.manifest.outputs[1].contextSourceIds[0];
  assert.equal(app.preflightEditorialArticleBatchForSourcePackage(raw.replace(source0,source1),pkg.transfer).ready,false);
  const payload=publicationPayload(p,pkg);
  const crossed=structuredClone(payload);crossed.articles[0].sourceIds=[source1];assert.equal((await api(crossed)).ok,false);
  const corrupted=structuredClone(payload);corrupted.sourcePackage.productionIntents.totals.reviews=0;assert.equal((await api(corrupted)).ok,false);
  assert.equal((await api({...payload,action:'publish_article'})).error,'mesa-intent-publication-path-required');
  assert.equal(rows(`select * from public.newsroom_mesa_output_publications where dossier_id=${q(p.dossierId)}`).length,0);
  const changed=structuredClone(pkg.manifest);changed.outputs[0].contextSourceIds=[source1];assert.equal(app.validateMesaProductionIntentsManifest(changed),null);
  assert.equal(app.parseEditorialBatchTransferSourcePackage(JSON.stringify({...pkg.transfer,productionIntents:null})),null);
  const missingMap=structuredClone(pkg.transfer);delete missingMap.batchContract.sourceIdsByOutput;assert.equal(app.parseEditorialBatchTransferSourcePackage(JSON.stringify(missingMap)),null);
});
await test('SQL-normalized unordered multi-Theme request is accepted and retains separated contexts',async()=>{
  const f=fixture(),g=fixture();
  const req=request(f);req.themes.push(request(g).themes[0]);req.themes.sort((a,b)=>b.themeId.localeCompare(a.themeId));
  const preview=await app.mesaIntentService.preview(req),r=await app.mesaIntentService.prepare(req,preview.authorityFingerprint);
  assert.equal(r.plan.contexts.length,2);assert.equal(r.plan.outputs.length,2);
  const pkg=await makePackage(r.plan);assert.ok((await api(publicationPayload(r.plan,pkg,r.plan.outputs.map(o=>o.outputId)))).ok);
});

report();
assert.deepEqual(forbidden,[]);
console.log(`RESULT: ${results.length} application/SQL cases passed`);

}
export { app, fixture, source, request, prepare, makePackage, publicationPayload, returned, api, rows, record, sql, q, json, rpcNames, tableNames, forbidden, calls };
