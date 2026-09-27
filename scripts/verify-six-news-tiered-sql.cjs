// Usage: node scripts/verify-six-news-tiered-sql.cjs postgresql://postgres@127.0.0.1:55438/six_news_test
// Requires an EMPTY, disposable PostgreSQL 17 database. PSQL_BIN may select psql.
// Historical RPCs/tables are loaded verbatim; unrelated identities are synthetic.
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const connection = process.argv[2];
const url = new URL(connection);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/six_news_test(?:_\d+)?$/.test(url.pathname)) {
  throw new Error("An empty local six_news_test database is required");
}
function sql(input) {
  const result = spawnSync(process.env.PSQL_BIN || "psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1", connection], {
    input, encoding: "utf8", windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return result.stdout + result.stderr;
}
function migration(name) { return fs.readFileSync(`supabase/migrations/${name}.sql`, "utf8"); }
function definition(file, name) {
  const pattern = new RegExp("create(?: or replace)? function\\s+" + name.replaceAll(".", "\\.") + "\\s*\\([\\s\\S]*?as (\\$[a-z_]*\\$)[\\s\\S]*?\\1;", "i");
  const match = migration(file).match(pattern);
  if (!match) throw new Error(`Missing definition: ${name}`);
  return match[0];
}
const definitions = [
  ["20260827183157_historical_composition_optional_public_titles", "public.replace_historical_composition_dynamic_zones"],
  ["20260826120541_historical_composition_dynamic_publication_activation", "public.activate_matchday_reference_composition"],
  ["20260823141940_matchday_editorial_profile_flexible_layouts_latest_order", "public.apply_matchday_editorial_profile_workspace_v2"],
  ["20260903233122_matchday_selection_optional_capacity", "jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_bridge"],
  ["20260901082156_matchday_live_layout_zones_blocks_shadow", "jornada_private.validate_matchday_live_layout_shadow_inputs"],
  ["20260906220000_matchday_live_layout_four_news_optional_titles_v21", "jornada_private.matchday_live_layout_layout_capacity_v20"],
].map(([file, name]) => definition(file, name)).join("\n");
const control = migration("20260907145743_matchday_profile_reconcile_four_news_layout");
const controlCheck = control.slice(control.indexOf("alter table", control.indexOf("alter table") + 1), control.lastIndexOf("commit;"));
const historical = migration("20260826061934_historical_composition_dynamic_zones");
const historicalTables = historical.slice(historical.indexOf("create table"), historical.indexOf("create index"));
console.log(sql(`
do $guard$ begin
 assert current_setting('server_version_num')::integer between 170000 and 179999;
 assert not exists(select 1 from pg_tables where schemaname not in ('pg_catalog','information_schema'));
 assert not exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace);
end; $guard$;
create schema jornada_private;
create table public.matchday_reference_compositions(id uuid primary key, matchday_id uuid, status text,
 presentation_mode text, hierarchical_editorial_source_type text, hierarchical_editorial_source_id uuid,
 hierarchical_video_position integer, hierarchical_editorial_title text, hierarchical_editorial_excerpt text,
 hierarchical_editorial_text text, hierarchical_editorial_author text, is_current boolean default false,
 updated_at timestamptz, published_at timestamptz);
create table public.matchday_editorial_bank_items(id uuid primary key, matchday_id uuid, status text, source_type text, source_id text);
create table public.editorial_articles(id uuid primary key, status text, slug text, label text, title text,
 subtitle text, image_url text, published_at timestamptz);
create table public.matchday_hierarchical_composition_slots(composition_id uuid, bank_item_id uuid,
 source_identity text, slot_key text, label_snapshot text, title_snapshot text, subtitle_snapshot text,
 image_url_snapshot text, link_url_snapshot text);
create table public.matchday_reference_composition_items(composition_id uuid, slot_type text, source_type text, source_id uuid);
create table public.matchday_editorial_profile_reconcile_control(thematic_zone_layouts jsonb);
${historicalTables}
${controlCheck}
-- Unrelated legacy dependencies are intentionally not executed in this harness.
set check_function_bodies=off;
${definitions}
create temp table original_functions as select oid, proowner, proacl, proconfig, prosecdef,
 pg_get_functiondef(oid) as definition from pg_proc
 where pronamespace in ('public'::regnamespace,'jornada_private'::regnamespace);
${migration("20260927110935_editorial_six_news_1_2_3")}
${fs.readFileSync("supabase/sql/test-editorial-six-news-1-2-3.sql", "utf8")}
do $test$ begin
 assert not exists(select 1 from original_functions old join pg_proc now using(oid)
  where old.proowner is distinct from now.proowner or old.proacl is distinct from now.proacl
  or old.proconfig is distinct from now.proconfig or old.prosecdef is distinct from now.prosecdef);
 assert not exists(select 1 from original_functions old join pg_proc now using(oid)
  where now.proname <> 'matchday_live_layout_layout_capacity_v20'
  and replace(replace(pg_get_functiondef(now.oid), ', ''six_news_1_2_3''', ''), ' when ''six_news_1_2_3'' then 6', '') <> old.definition);
end; $test$;
do $test$
declare
 v_matchday uuid := gen_random_uuid(); v_composition uuid; v_article uuid; v_bank uuid;
 v_items jsonb := '[]'; v_payload jsonb; v_family text; v_result uuid;
begin
 for n in 1..6 loop
  v_article := gen_random_uuid(); v_bank := gen_random_uuid();
  insert into editorial_articles values(v_article, 'published', 'story-'||n, 'JORNADA', 'Story '||n,
   'Summary '||n, '/editorial-'||n||'.jpg', now());
  insert into matchday_editorial_bank_items values(v_bank,v_matchday,'active','editorial_article',v_article::text);
  v_items := v_items || jsonb_build_array(jsonb_build_object('position',n,'bankItemId',v_bank));
 end loop;
 foreach v_family in array array['six_news','six_news_1_2_3'] loop
  v_composition := gen_random_uuid();
  insert into matchday_reference_compositions(id,matchday_id,status,presentation_mode,
   hierarchical_video_position,hierarchical_editorial_title,hierarchical_editorial_excerpt,hierarchical_editorial_text,hierarchical_editorial_author)
   values(v_composition,v_matchday,'draft','hierarchical',0,'Editorial','Excerpt','Text','Author');
  insert into matchday_hierarchical_composition_slots(composition_id,slot_key,label_snapshot,title_snapshot,
   subtitle_snapshot,image_url_snapshot,link_url_snapshot)
   select v_composition,k,'JORNADA','Opening','Summary','/opening.jpg','/opening'
   from unnest(array['dominant_main','other_chronicle_1','other_chronicle_2','other_chronicle_3']) k;
  v_payload := jsonb_build_array(jsonb_build_object('publicTitle','Atualidade','visualFamily',v_family,'items',v_items));
  assert replace_historical_composition_dynamic_zones(v_matchday,v_composition,v_payload)=7;
  assert (select count(*) from matchday_historical_composition_zone_items where composition_id=v_composition)=6;
  assert not exists(select 1 from matchday_historical_composition_zone_items where composition_id=v_composition
   and image_url_snapshot <> '/editorial-'||position||'.jpg');
  begin
   perform replace_historical_composition_dynamic_zones(v_matchday,v_composition,
    jsonb_set(v_payload,'{0,items,5,position}','7'));
   raise exception 'Seventh position accepted';
  exception when raise_exception then
   if sqlerrm <> 'historical_dynamic_zone_item_invalid' then raise; end if;
  end;
  assert replace_historical_composition_dynamic_zones(v_matchday,v_composition,
   jsonb_set(v_payload,'{0,items}',v_items - 5))=6;
  begin
   perform activate_matchday_reference_composition(v_matchday,v_composition,true);
   raise exception 'Incomplete six-story zone published';
  exception when raise_exception then
   if sqlerrm <> 'historical_dynamic_zones_incomplete' then raise; end if;
  end;
  perform replace_historical_composition_dynamic_zones(v_matchday,v_composition,v_payload);
  v_result := activate_matchday_reference_composition(v_matchday,v_composition,true);
  assert v_result = v_composition;
  assert exists(select 1 from matchday_reference_compositions where id=v_composition
   and is_current and status='published' and published_at is not null);
  raise notice 'PASS: % save/snapshots/publish; position 7 and incomplete publication rejected', v_family;
 end loop;
end; $test$;
`));
