// Disposable local PostgreSQL 17 only. No production credentials accepted.
const fs=require("node:fs"),{spawnSync}=require("node:child_process");
const connection=process.argv[2],url=new URL(connection);
if(!["127.0.0.1","localhost"].includes(url.hostname)||url.pathname!=="/image_freeze_test")throw new Error("empty-local-image_freeze_test-required");
const migration=fs.readFileSync("supabase/migrations/20260929084410_editorial_image_authority.sql","utf8");
const sql=`
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
create table side_effects(kind text);
create function public.sync_published_editorial_source_to_matchday_bank() returns trigger language plpgsql as $$begin insert into side_effects values('bank');return new;end $$;
create function public.newsroom_link_legacy_article_source_v1() returns trigger language plpgsql as $$begin insert into side_effects values('source');return new;end $$;
create function public.newsroom_mesa_after_article_publication_v2() returns trigger language plpgsql as $$begin insert into side_effects values('context');return new;end $$;
create trigger bank after update on editorial_articles for each row execute function sync_published_editorial_source_to_matchday_bank();
create constraint trigger source after update on editorial_articles deferrable initially deferred for each row execute function newsroom_link_legacy_article_source_v1();
create constraint trigger context after update on editorial_articles deferrable initially deferred for each row execute function newsroom_mesa_after_article_publication_v2();
insert into editorial_articles(id,status,image_url) values
 ('11111111-1111-4111-8111-111111111111','published','https://source.example/a.jpg'),
 ('22222222-2222-4222-8222-222222222222','draft','https://source.example/a.jpg');
${migration}
do $$ declare candidate text; hash text:=repeat('a',64); image jsonb; oldrow jsonb; newrow jsonb; result text; begin
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
 assert (select count(*)=1 from editorial_image_promotions);
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
select 'PASS: new, draft, legacy preserve, update replacement, exact promotion, retry, immutable decisions, batch rollback, privileges' result;
`;
const result=spawnSync(process.env.PSQL_BIN||"psql",["-X","-w","-v","ON_ERROR_STOP=1",connection],{input:sql,encoding:"utf8",windowsHide:true});
process.stdout.write(result.stdout||"");process.stderr.write(result.stderr||"");if(result.error)throw result.error;process.exitCode=result.status||0;
