// Disposable local PostgreSQL 17 only. No production credentials accepted.
const fs=require("node:fs"),{spawnSync}=require("node:child_process");
const connection=process.argv[2],url=new URL(connection);
if(!["127.0.0.1","localhost"].includes(url.hostname)||url.pathname!=="/image_freeze_test")throw new Error("empty-local-image_freeze_test-required");
const foundation=fs.readFileSync("supabase/migrations/20260929084410_editorial_image_authority.sql","utf8");
const activation=fs.readFileSync("supabase/migrations/20260929101014_editorial_image_authority_activation.sql","utf8");
function runSql(sql) {
 const result=spawnSync(process.env.PSQL_BIN||"psql",["-X","-w","-v","ON_ERROR_STOP=1",connection],{input:sql,encoding:"utf8",windowsHide:true});
 process.stdout.write(result.stdout||"");process.stderr.write(result.stderr||"");if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
runSql(`
do $$ begin assert not exists(select 1 from pg_tables where schemaname='public'); end $$;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema storage;
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
create table public.editorial_articles(id uuid primary key default gen_random_uuid(),status text,image_url text,title text default 'TITLE',subtitle text default 'SUBTITLE',body text default 'BODY',slug text default 'slug',published_at timestamptz default now(),updated_at timestamptz default now(),classification text default 'chronicle');
create table public.newsroom_editorial_dossier_images(id uuid primary key,frozen_url text);
-- Columns used by the real canonical application writer in phase B.
alter table public.editorial_articles add column label text, add column author text, add column scope text,
 add column image_caption text, add column created_at timestamptz, add column competition_id uuid,
 add column season_id uuid, add column matchday_id uuid;
create table side_effects(kind text);
create function public.sync_published_editorial_source_to_matchday_bank() returns trigger language plpgsql as $$begin insert into side_effects values('bank');return new;end $$;
create function public.newsroom_link_legacy_article_source_v1() returns trigger language plpgsql as $$begin insert into side_effects values('source');return new;end $$;
create function public.newsroom_mesa_after_article_publication_v2() returns trigger language plpgsql as $$begin insert into side_effects values('context');return new;end $$;
create trigger bank after update on editorial_articles for each row execute function sync_published_editorial_source_to_matchday_bank();
create constraint trigger source after update on editorial_articles deferrable initially deferred for each row execute function newsroom_link_legacy_article_source_v1();
create constraint trigger context after update on editorial_articles deferrable initially deferred for each row execute function newsroom_mesa_after_article_publication_v2();
grant usage on schema public,storage to service_role;
grant select,insert,update on public.editorial_articles,public.newsroom_editorial_dossier_images,storage.objects to service_role;
grant select,insert,truncate on public.side_effects to service_role;
insert into editorial_articles(id,status,image_url) values
 ('11111111-1111-4111-8111-111111111111','published','https://source.example/a.jpg'),
 ('22222222-2222-4222-8222-222222222222','draft','https://source.example/a.jpg');
${foundation}
-- A: the previous application's direct writes must not require new receipts.
do $$ begin
 assert to_regprocedure('public.editorial_require_local_image_v1()') is null;
 assert not exists(select 1 from pg_trigger where tgrelid='public.editorial_articles'::regclass and tgname='editorial_require_local_image');
 assert not exists(select 1 from public.editorial_image_assets);
 -- Current manual uploads already use own Storage but have no asset receipt.
 insert into storage.objects(bucket_id,name) values('editorial-images','editorial/2026/09/1790672400000-77777777-7777-4777-8777-777777777777-legacy-upload.jpg');
 insert into editorial_articles(id,status,image_url) values('77777777-7777-4777-8777-777777777777','published',
  'https://foundation.example/storage/v1/object/public/editorial-images/editorial/2026/09/1790672400000-77777777-7777-4777-8777-777777777777-legacy-upload.jpg');
 insert into editorial_articles(id,status,image_url) values('66666666-6666-4666-8666-666666666666','published','https://source.example/a.jpg');
 update editorial_articles set title='OLD APP UPDATE',image_url='https://source.example/b.jpg' where id='66666666-6666-4666-8666-666666666666';
 update editorial_articles set image_url='https://source.example/a.jpg' where id='66666666-6666-4666-8666-666666666666';
 update editorial_articles set status='published' where id='22222222-2222-4222-8222-222222222222';
 assert (select status='published' from editorial_articles where id='22222222-2222-4222-8222-222222222222');
 update editorial_articles set status='draft' where id='22222222-2222-4222-8222-222222222222';
 update editorial_articles set slug='legacy-'||id::text;
 assert not exists(select 1 from public.editorial_image_assets);
end $$;
select 'PASS A: old application + FOUNDATION; no image guard or receipt requirement' result;
`);

// B: real freezer and canonical application service, with PostgreSQL-backed
// decisions/receipts/writes and in-memory image objects. Never remote Storage.
const application=spawnSync(process.execPath,["--import","tsx","scripts/verify-editorial-image-foundation.ts",connection],{encoding:"utf8",windowsHide:true});
process.stdout.write(application.stdout||"");process.stderr.write(application.stderr||"");
if(application.error)throw application.error;if(application.status!==0)process.exit(application.status||1);

runSql(`
${activation}
-- C: the same invariant is now enforced for every SQL writer as well.
do $$ declare candidate text; hash text:=repeat('a',64); image jsonb; oldrow jsonb; newrow jsonb; result text; begin
 assert exists(select 1 from pg_trigger where tgrelid='public.editorial_articles'::regclass and tgname='editorial_require_local_image' and tgenabled='O');
 candidate:='https://any-configured-environment.example/storage/v1/object/public/editorial-images/editorial/sha256/'||hash||'.jpg';
 image:=jsonb_build_object('publicUrl',candidate,'path','editorial/sha256/'||hash||'.jpg','sha256',hash,'byteSize',123,'contentType','image/jpeg');
 insert into storage.objects(bucket_id,name) values('editorial-images',image->>'path');
 insert into editorial_image_assets(public_url,storage_path,sha256,byte_size,content_type) values(candidate,image->>'path',hash,123,'image/jpeg');
 insert into editorial_image_decisions values('A','https://source.example/a.jpg','ready',image,now());
 insert into newsroom_editorial_dossier_images(id,frozen_url) values('55555555-5555-4555-8555-555555555555','https://source.example/a.jpg');
 perform editorial_confirm_dossier_image_v1('55555555-5555-4555-8555-555555555555','A');
 perform editorial_confirm_dossier_image_v1('55555555-5555-4555-8555-555555555555','A');
 assert (select frozen_url=candidate and source_url='https://source.example/a.jpg' from newsroom_editorial_dossier_images where id='55555555-5555-4555-8555-555555555555');
 begin insert into editorial_articles(status,image_url) values('published','https://source.example/b.jpg');raise exception 'NEW escaped';
 exception when raise_exception then assert sqlerrm='image-materialization-required';end;
 begin insert into editorial_articles(status,image_url) select 'published',image_url from editorial_articles where id='77777777-7777-4777-8777-777777777777';raise exception 'unregistered local escaped';
 exception when raise_exception then assert sqlerrm='image-materialization-required';end;
 begin update editorial_articles set status='published' where id='22222222-2222-4222-8222-222222222222';raise exception 'draft escaped';
 exception when raise_exception then assert sqlerrm='image-materialization-required';end;
 update editorial_articles set title='UPDATED' where id='11111111-1111-4111-8111-111111111111';
 assert (select image_url='https://source.example/a.jpg' from editorial_articles where id='11111111-1111-4111-8111-111111111111');
 begin update editorial_articles set image_url='https://source.example/b.jpg' where id='11111111-1111-4111-8111-111111111111';raise exception 'UPDATE escaped';
 exception when raise_exception then assert sqlerrm='image-materialization-required';end;
 insert into editorial_articles(status,image_url) values('published',candidate);
 select to_jsonb(a)-'image_url' into oldrow from editorial_articles a where id='11111111-1111-4111-8111-111111111111';
 set constraints all immediate;
 truncate side_effects;
 result:=editorial_promote_image_v1('11111111-1111-4111-8111-111111111111','https://source.example/a.jpg',candidate,hash,'Human reviewer');
 assert result='promoted';
 select to_jsonb(a)-'image_url' into newrow from editorial_articles a where id='11111111-1111-4111-8111-111111111111';
 assert oldrow=newrow;
 assert not exists(select 1 from side_effects);
 assert editorial_promote_image_v1('11111111-1111-4111-8111-111111111111','https://source.example/a.jpg',candidate,hash,'Human reviewer')='reused';
 assert (select count(*)=1 from editorial_image_promotions where article_id='11111111-1111-4111-8111-111111111111');
 begin update editorial_image_decisions d set image=jsonb_set(d.image,'{sha256}',to_jsonb(repeat('b',64))) where decision_key='A';raise exception 'candidate changed';
 exception when raise_exception then assert sqlerrm='image-decision-immutable';end;
 -- A multi-row writer cannot persist the valid first row if a later row fails.
 begin insert into editorial_articles(id,status,image_url) values
  ('33333333-3333-4333-8333-333333333333','published',candidate),
  ('44444444-4444-4444-8444-444444444444','published','https://evil.example/b.jpg');
 exception when raise_exception then assert sqlerrm='image-materialization-required';end;
 assert not exists(select 1 from editorial_articles where id='33333333-3333-4333-8333-333333333333');
 assert not has_table_privilege('anon','editorial_image_assets','INSERT');
 assert not has_table_privilege('authenticated','editorial_image_decisions','UPDATE');
 assert not has_function_privilege('anon','editorial_promote_image_v1(uuid,text,text,text,text)','EXECUTE');
end $$;
select 'PASS C: ACTIVATION; external NEW/draft/replacement blocked, registered local accepted, exact legacy preserve, image-only promotion, retry, immutable decisions, rollback, privileges' result;
`);

// Recompile the definitions read from production in a rolled-back local
// transaction. Only their downstream dependencies are replaced by fixtures.
const remote=JSON.parse(fs.readFileSync("docs/image-freeze-20260929/rollout-remote-functions.json","utf8"));
const guardPatch=foundation.slice(foundation.indexOf("do $guard_image_only$"),foundation.indexOf("end $guard_image_only$;")+"end $guard_image_only$;".length);
runSql(`begin;
create schema jornada_private;
create function jornada_private.refresh_matchday_editorial_bank_automatic_classifications(p_source_ids text[],p_refresh_distribution boolean)
 returns void language plpgsql as $$begin if cardinality(p_source_ids)>0 then insert into public.side_effects values('classification'); end if; end $$;
${remote.functions.map(row=>row.definition+";").join("\n")}
create temporary table function_settings as select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid in (
 'public.sync_published_editorial_source_to_matchday_bank()'::regprocedure,
 'public.newsroom_link_legacy_article_source_v1()'::regprocedure,
 'public.newsroom_mesa_after_article_publication_v2()'::regprocedure);
${guardPatch}
create trigger classification after update on public.editorial_articles referencing old table as old_rows new table as new_rows
 for each statement execute function jornada_private.refresh_automatic_classifications_from_articles_update();
do $$ declare before_row jsonb; candidate text; begin
 assert not exists(select 1 from function_settings old join pg_proc p using(oid)
  where (old.proowner,old.proacl,old.prosecdef,old.proconfig) is distinct from (p.proowner,p.proacl,p.prosecdef,p.proconfig));
 select to_jsonb(a)-'image_url' into before_row from editorial_articles a where id='11111111-1111-4111-8111-111111111111';
 select public_url into strict candidate from editorial_image_assets where sha256<>repeat('a',64) order by public_url limit 1;
 truncate side_effects;
 update editorial_articles set image_url=candidate where id='11111111-1111-4111-8111-111111111111';
 set constraints all immediate;
 assert before_row=(select to_jsonb(a)-'image_url' from editorial_articles a where id='11111111-1111-4111-8111-111111111111');
 assert not exists(select 1 from side_effects);
end $$;
select 'PASS remote definitions: actual three functions patched locally, settings preserved, classification unchanged for image-only UPDATE' result;
rollback;`);
