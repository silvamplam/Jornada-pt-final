// Run against a disposable clone of the foundation/activation PostgreSQL fixture.
const fs = require('node:fs'), { spawnSync } = require('node:child_process');
const connection = process.argv[2], url = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/image_replacements_test') throw Error('local-disposable-database-only');
const migration = fs.readFileSync('supabase/migrations/20260929162642_editorial_image_replacements_v2.sql', 'utf8').replace(/^begin;\s*/, '').replace(/commit;\s*$/, '');
const quote = value => `'${String(value).replace(/'/g, "''")}'`;
let realBatch = '';
if (process.argv[3]) {
 const dry = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
 const snapshot = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
 if (!dry.dryRun || dry.conflicts.length || dry.replacements.length !== 13) throw Error('verified-13-target-dry-run-required');
 const ids = dry.replacements.map(r => quote(r.articleId)).join(',');
 const objects = [...snapshot.objects, ...dry.staging.map(o => ({ name: o.path.replace('storage/v1/object/editorial-images/', ''), metadata: { size: o.bytes, mimetype: o.headers['Content-Type'] } }))];
 realBatch = `alter table editorial_articles disable trigger editorial_require_local_image;\n`;
 for (const r of dry.replacements) {
  realBatch += `insert into editorial_articles(id,status,image_url,title) values(${quote(r.articleId)},'published',${quote(r.expectedCurrentImageUrl)},'Real replacement target');\n`;
  const a = r.assetReceipt;
  realBatch += `insert into editorial_image_assets(public_url,storage_path,sha256,byte_size,content_type) values(${quote(a.public_url)},${quote(a.storage_path)},${quote(a.sha256)},${a.byte_size},${quote(a.content_type)});\n`;
 }
 for (const o of objects) realBatch += `insert into storage.objects(bucket_id,name,metadata) values('editorial-images',${quote(o.name)},${quote(JSON.stringify(o.metadata))}::jsonb);\n`;
 realBatch += `alter table editorial_articles enable trigger editorial_require_local_image;
 create temporary table real_before as select id,to_jsonb(a)-'image_url' fields from editorial_articles a;
 create temporary table audit_before as select count(*) n from editorial_image_promotions;
 grant select on real_before,audit_before to service_role;
 truncate side_effects; set local role service_role;\n`;
 for (const r of dry.replacements) realBatch += `select editorial_register_image_replacement_v1(${[r.articleId,r.expectedCurrentImageUrl,r.decisionKey,r.sourceUrl,r.image.publicUrl].map(quote).join(',')});\n`;
 for (const r of dry.replacements) realBatch += `select editorial_promote_image_v2(${[r.articleId,r.expectedCurrentImageUrl,r.decisionKey,r.reviewer].map(quote).join(',')});\n`;
 realBatch += `set constraints all immediate;
 do $$ begin
 assert not exists(select 1 from real_before b join editorial_articles a using(id) where b.fields is distinct from to_jsonb(a)-'image_url');
 assert not exists(select 1 from side_effects);
 assert (select count(*) from editorial_image_promotions)=(select n+13 from audit_before);
 assert (select count(*) from editorial_articles a join editorial_image_replacement_promotions p on p.article_id=a.id and p.candidate_url=a.image_url where a.id in (${ids}))=13;
 end $$;
 select 'PASS real local batch: 13/13 approved SHA assets, 65 objects, distinct provenance, 13 new decisions/promotions, no collateral changes' result;
 reset role;\n`;
}
const sql = `begin;
do $$ begin assert current_setting('server_version_num')::int between 170000 and 179999; end $$;
-- The synthetic side-effect trigger bodies use unqualified fixture table names.
alter function sync_published_editorial_source_to_matchday_bank() set search_path=public;
alter function newsroom_link_legacy_article_source_v1() set search_path=public;
alter function newsroom_mesa_after_article_publication_v2() set search_path=public;
create temporary table old_contract as select pg_get_functiondef('editorial_promote_image_v1(uuid,text,text,text,text)'::regprocedure) definition;
create temporary table old_triggers as select oid,pg_get_functiondef(oid) definition from pg_proc where proname in
 ('sync_published_editorial_source_to_matchday_bank','newsroom_link_legacy_article_source_v1','newsroom_mesa_after_article_publication_v2');
alter table storage.objects add column metadata jsonb;
${migration}
do $$ begin
 assert (select definition from old_contract)=pg_get_functiondef('editorial_promote_image_v1(uuid,text,text,text,text)'::regprocedure);
 assert not exists(select 1 from old_triggers where definition<>pg_get_functiondef(oid));
 assert not has_function_privilege('anon','editorial_promote_image_v2(uuid,text,text,text)','EXECUTE');
 assert not has_function_privilege('authenticated','editorial_register_image_replacement_v1(uuid,text,text,text,text)','EXECUTE');
 assert not has_table_privilege('authenticated','editorial_image_replacement_promotions','INSERT');
 assert not has_table_privilege('authenticated','editorial_image_replacement_bindings','INSERT');
 assert not has_table_privilege('service_role','editorial_image_replacement_bindings','UPDATE');
 assert not has_table_privilege('service_role','editorial_image_replacement_bindings','DELETE');
 assert not has_table_privilege('service_role','editorial_image_replacement_bindings','TRUNCATE');
end $$;
create function pg_temp.fails(command text, expected text) returns void language plpgsql as $$
begin
 begin execute command; exception when others then
   if position(expected in sqlerrm)=0 then raise exception 'wrong error: %, expected %',sqlerrm,expected; end if;
   return;
 end;
 raise exception 'expected failure: %',command;
end $$;
insert into editorial_image_assets(public_url,storage_path,sha256,byte_size,content_type)
 values('https://fixture.example/storage/v1/object/public/editorial-images/editorial/sha256/'||repeat('f',64)||'.jpg',
 'editorial/sha256/'||repeat('f',64)||'.jpg',repeat('f',64),200,'image/jpeg');
insert into storage.objects(bucket_id,name,metadata)
 select 'editorial-images',case when w=0 then a.storage_path else 'previews/v1/'||a.storage_path||'/w'||w||'.webp' end,
 jsonb_build_object('size',case when w=0 then 200 else 100 end,'mimetype',case when w=0 then 'image/jpeg' else 'image/webp' end)
 from editorial_image_assets a cross join unnest(array[0,320,640,960,1280]) w where a.sha256=repeat('f',64);
-- Seed legacy state before exercising the guard, only inside this disposable test transaction.
alter table editorial_articles disable trigger editorial_require_local_image;
insert into editorial_articles(id,status,image_url) select ('aaaaaaaa-aaaa-4aaa-8aaa-'||lpad(n::text,12,'0'))::uuid,
 case when n=4 then 'draft' else 'published' end,'https://old.example/A.jpg' from generate_series(1,6) n;
alter table editorial_articles enable trigger editorial_require_local_image;
insert into editorial_image_promotions(article_id,source_url,candidate_url,sha256,reviewer)
 select 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006','https://history.example/'||n,a.public_url,a.sha256,'history'
 from editorial_image_assets a cross join generate_series(1,655-(select count(*)::int from editorial_image_promotions)) n where a.sha256=repeat('f',64);
create temporary table old_history as select * from editorial_image_promotions;
grant select on old_history to service_role;
truncate side_effects;
set local role service_role;
do $$ declare candidate text; before_row jsonb; begin
 select public_url into candidate from editorial_image_assets where sha256=repeat('f',64);
 assert editorial_register_image_replacement_v1('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg',
 'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','https://real-source.example/B.jpg',candidate)='registered';
 assert editorial_register_image_replacement_v1('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg',
 'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','https://real-source.example/B.jpg',candidate)='reused';
 assert (select count(*) from editorial_image_replacement_bindings where replacement_decision_key='replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B'
   and article_id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001' and expected_current_image_url='https://old.example/A.jpg')=1;
 insert into editorial_image_decisions(decision_key,source_url,state,image) select 'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:unbound',source_url,state,image
   from editorial_image_decisions where decision_key='replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B';
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:unbound','reviewer')$q$,'binding-conflict');
 perform pg_temp.fails(format('select editorial_register_image_replacement_v1(%L,%L,%L,%L,%L)',
 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg','migration:rejected','https://real-source.example/B.jpg',candidate),'decision-invalid');
 perform pg_temp.fails(format('select editorial_register_image_replacement_v1(%L,%L,%L,%L,%L)',
 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','https://wrong.example/C.jpg',candidate),'decision-conflict');
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','stale','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','reviewer')$q$,'binding-conflict');
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B',' ')$q$,'reviewer-required');
 select to_jsonb(a)-'image_url' into before_row from editorial_articles a where id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
 assert editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg',
 'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','reviewer')='promoted';
 set constraints all immediate;
 assert before_row=(select to_jsonb(a)-'image_url' from editorial_articles a where id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001');
 assert not exists(select 1 from side_effects);
 assert exists(select 1 from editorial_image_replacement_promotions where previous_image_url='https://old.example/A.jpg' and source_url='https://real-source.example/B.jpg' and sha256=repeat('f',64));
 assert (select count(*) from editorial_image_promotions)=656;
 assert not exists((select * from old_history) except (select * from editorial_image_promotions));
 assert editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg',
 'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','reviewer')='reused';
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','stale','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','reviewer')$q$,'binding-conflict');
 perform pg_temp.fails($q$update editorial_image_decisions set source_url='https://mutated.example/x' where decision_key='replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B'$q$,'immutable');
 -- Missing preview and corrupt metadata must block both association and promotion.
 update storage.objects set name=name||'.missing' where name like '%/w960.webp' and name like '%'||repeat('f',64)||'%';
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000001','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B','reviewer')$q$,'objects-incomplete');
 update storage.objects set name=replace(name,'.missing','') where name like '%.missing';
 update storage.objects set metadata=jsonb_set(metadata,'{size}','201') where name='editorial/sha256/'||repeat('f',64)||'.jpg';
 perform pg_temp.fails(format('select editorial_assert_replacement_asset_v1(%L)',candidate),'original-mismatch');
 update storage.objects set metadata=jsonb_set(metadata,'{size}','200') where name='editorial/sha256/'||repeat('f',64)||'.jpg';
 perform pg_temp.fails(format('select editorial_register_image_replacement_v1(%L,%L,%L,%L,%L)',
 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000004:B','https://real-source.example/B.jpg',candidate),'query returned no rows');
 insert into editorial_image_decisions(decision_key,source_url) values('replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000003:pending','https://real-source.example/B.jpg');
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000003','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000003:pending','reviewer')$q$,'query returned no rows');
 insert into editorial_image_decisions(decision_key,source_url,state,image) select 'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000003:forged',source_url,state,jsonb_set(image,'{sha256}',to_jsonb(repeat('e',64))) from editorial_image_decisions where decision_key='replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B';
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000003','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000003:forged','reviewer')$q$,'decision-asset-mismatch');
 -- Batch exception rolls back a previously successful promotion in the same subtransaction.
 perform editorial_register_image_replacement_v1('aaaaaaaa-aaaa-4aaa-8aaa-000000000002','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000002:B','https://real-source.example/B.jpg',candidate);
 begin
  perform editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000002','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000002:B','reviewer');
  perform editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000003','stale','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000003:missing','reviewer');
  raise exception 'batch should fail';
 exception when no_data_found then null;
 end;
 assert (select image_url from editorial_articles where id='aaaaaaaa-aaaa-4aaa-8aaa-000000000002')='https://old.example/A.jpg';
 assert (select count(*) from editorial_image_promotions)=656;
 -- A v1 invocation remains compatible with the original five-argument contract.
 insert into editorial_image_decisions(decision_key,source_url,state,image) select 'v1:compat','https://old.example/A.jpg',state,image from editorial_image_decisions where decision_key='replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000001:B';
 assert editorial_promote_image_v1('aaaaaaaa-aaaa-4aaa-8aaa-000000000005','https://old.example/A.jpg',candidate,repeat('f',64),'v1 reviewer')='promoted';
end $$;
reset role;
-- A reviewed A -> B cannot be repurposed to C -> B, even by supplying the current C.
insert into editorial_image_assets(public_url,storage_path,sha256,byte_size,content_type)
 values('https://fixture.example/storage/v1/object/public/editorial-images/editorial/sha256/'||repeat('c',64)||'.jpg',
 'editorial/sha256/'||repeat('c',64)||'.jpg',repeat('c',64),200,'image/jpeg');
insert into storage.objects(bucket_id,name,metadata)
 values('editorial-images','editorial/sha256/'||repeat('c',64)||'.jpg','{"size":200,"mimetype":"image/jpeg"}'::jsonb);
set local role service_role;
do $$ declare candidate text; current_c text; begin
 select public_url into candidate from editorial_image_assets where sha256=repeat('f',64);
 select public_url into current_c from editorial_image_assets where sha256=repeat('c',64);
 assert editorial_register_image_replacement_v1('aaaaaaaa-aaaa-4aaa-8aaa-000000000006','https://old.example/A.jpg',
 'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000006:B','https://real-source.example/B.jpg',candidate)='registered';
 update editorial_articles set image_url=current_c where id='aaaaaaaa-aaaa-4aaa-8aaa-000000000006';
 perform pg_temp.fails(format('select editorial_promote_image_v2(%L,%L,%L,%L)',
 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006',current_c,'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000006:B','reviewer'),'binding-conflict');
 perform pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000006','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000006:B','reviewer')$q$,'reference-conflict');
 perform pg_temp.fails(format('select editorial_register_image_replacement_v1(%L,%L,%L,%L,%L)',
 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006',current_c,'replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000006:B','https://real-source.example/B.jpg',candidate),'binding-conflict');
 assert (select image_url from editorial_articles where id='aaaaaaaa-aaaa-4aaa-8aaa-000000000006')=current_c;
 assert not exists(select 1 from editorial_image_replacement_promotions where article_id='aaaaaaaa-aaaa-4aaa-8aaa-000000000006');
 assert (select expected_current_image_url from editorial_image_replacement_bindings where replacement_decision_key='replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000006:B')='https://old.example/A.jpg';
end $$;
reset role;
-- The trigger also rejects mutations by a role with UPDATE/DELETE privileges.
select pg_temp.fails($q$update editorial_image_replacement_bindings set expected_current_image_url='https://changed.example/C.jpg'$q$,'binding-immutable');
select pg_temp.fails($q$update editorial_image_replacement_bindings set article_id='aaaaaaaa-aaaa-4aaa-8aaa-000000000003'$q$,'binding-immutable');
select pg_temp.fails($q$update editorial_image_replacement_bindings set replacement_decision_key=replacement_decision_key||':changed'$q$,'binding-immutable');
select pg_temp.fails($q$delete from editorial_image_replacement_bindings$q$,'binding-immutable');
select 'PASS immutable binding: A -> B, retry, A -> C rejects both expected URLs, re-registration and mutations rejected' result;
${realBatch}
-- An unexpected article-field mutation is detected and rolled back together with audit.
create function pg_temp.corrupt_article() returns trigger language plpgsql as $$begin new.title:='CORRUPTED';return new;end $$;
create trigger test_corruption before update on editorial_articles for each row execute function pg_temp.corrupt_article();
set local role service_role;
select pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000002','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000002:B','reviewer')$q$,'content-changed');
do $$ begin assert (select title from editorial_articles where id='aaaaaaaa-aaaa-4aaa-8aaa-000000000002')='TITLE'; end $$;
reset role;
create or replace function pg_temp.corrupt_article() returns trigger language plpgsql as $$begin new.image_url:=old.image_url;return new;end $$;
set local role service_role;
select pg_temp.fails($q$select editorial_promote_image_v2('aaaaaaaa-aaaa-4aaa-8aaa-000000000002','https://old.example/A.jpg','replacement:aaaaaaaa-aaaa-4aaa-8aaa-000000000002:B','reviewer')$q$,'image-changed');
select 'PASS PostgreSQL 17: v1/history/ACL, explicit association, CAS, immutable provenance, previews, retry, image-only triggers, audit and atomic rollback' result;
rollback;`;
const result = spawnSync(process.env.PSQL_BIN || 'psql', ['-X','-w','-v','ON_ERROR_STOP=1',connection], { input: sql, encoding: 'utf8', windowsHide: true });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
process.exitCode = result.status || 0;
